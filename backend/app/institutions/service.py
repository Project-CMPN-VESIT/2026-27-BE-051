"""
College partner aggregates and employer verification requests.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import (
    ConflictError, ForbiddenError, NotFoundError, ValidationError,
)
from app.core.logging import get_logger
from app.institutions.models import CollegePartner, EmployerVerificationRequest

logger = get_logger("institutions")

REQUEST_TTL_DAYS = 30
# Below this many participating students, per-student figures are not shown at
# all. With two students in the cohort, an "average earnings" number identifies
# them both.
MIN_COHORT_FOR_AVERAGES = 5


def _now() -> datetime:
    return datetime.now(timezone.utc)


def college_key(name: str) -> str:
    """Normalise an institution name for matching."""
    return " ".join((name or "").lower().split())


class CollegePartnerService:
    def __init__(self, db: Session):
        self.db = db

    # ── Registration ─────────────────────────────────────────────────────────

    def register(
        self,
        user,
        *,
        college_name: str,
        department: str | None = None,
        contact_name: str | None = None,
        contact_title: str | None = None,
        website_url: str | None = None,
    ) -> CollegePartner:
        if not (college_name or "").strip():
            raise ValidationError("Enter your institution's name")

        existing = (
            self.db.query(CollegePartner)
            .filter(CollegePartner.user_id == user.id)
            .first()
        )
        if existing:
            raise ConflictError("You already have a partner profile")

        partner = CollegePartner(
            user_id=user.id,
            college_name=college_name.strip()[:200],
            college_key=college_key(college_name),
            department=department,
            contact_name=contact_name,
            contact_title=contact_title,
            website_url=website_url,
            is_verified=False,
        )
        self.db.add(partner)
        self.db.flush()

        from app.notifications.models import NotificationType
        from app.notifications.service import NotificationService
        from app.users.models import User, UserRole

        notif = NotificationService(self.db)
        for admin in self.db.query(User).filter(User.role == UserRole.ADMIN).all():
            notif.create(
                recipient_id=admin.id,
                type=NotificationType.SYSTEM,
                title="College partner awaiting verification",
                body=f"{partner.college_name} requested a faculty dashboard.",
                link="/admin/institutions",
            )
        self.db.commit()
        self.db.refresh(partner)
        return partner

    def get_for_user(self, user_id: uuid.UUID) -> CollegePartner | None:
        return (
            self.db.query(CollegePartner)
            .filter(CollegePartner.user_id == user_id)
            .first()
        )

    def verify(
        self, partner_id: uuid.UUID, admin, *, approve: bool, note: str | None = None
    ) -> CollegePartner:
        partner = self.db.get(CollegePartner, partner_id)
        if not partner:
            raise NotFoundError("College partner")

        partner.is_verified = approve
        partner.verified_at = _now() if approve else None
        partner.verified_by_id = admin.id
        partner.notes = note

        from app.notifications.models import NotificationType
        from app.notifications.service import NotificationService

        NotificationService(self.db).create(
            recipient_id=partner.user_id,
            type=NotificationType.SYSTEM,
            title=(
                "Partner dashboard approved" if approve
                else "Partner request needs more information"
            ),
            body=note or (
                f"Your dashboard for {partner.college_name} is live."
                if approve else
                "We couldn't confirm your affiliation yet."
            ),
            link="/campus/dashboard",
        )
        self.db.commit()
        self.db.refresh(partner)
        return partner

    def list_pending(self) -> list[CollegePartner]:
        return (
            self.db.query(CollegePartner)
            .options(joinedload(CollegePartner.user))
            .filter(CollegePartner.is_verified == False)
            .order_by(CollegePartner.created_at.asc())
            .all()
        )

    # ── The aggregate dashboard ──────────────────────────────────────────────

    def dashboard(self, user) -> dict:
        """Aggregate stats for the partner's own institution.

        Every number here is derived from data the student already made public by
        listing a project. Nothing private is aggregated in.
        """
        partner = self.get_for_user(user.id)
        if not partner:
            raise NotFoundError("College partner profile")
        if not partner.is_verified:
            raise ForbiddenError(
                "Your institution's affiliation is still being verified. The "
                "dashboard unlocks once an admin confirms it."
            )

        from app.payments.models import Payment, PaymentStatus, PaymentType
        from app.projects.models import Project, ProjectVerification
        from app.users.models import Profile, User

        key = partner.college_key

        student_ids = [
            uid for (uid,) in (
                self.db.query(Profile.user_id)
                .filter(func.lower(func.trim(Profile.college)) == key)
                .all()
            )
        ]

        if not student_ids:
            return {
                "college_name": partner.college_name,
                "department": partner.department,
                "is_verified": True,
                "students_total": 0,
                "projects_total": 0,
                "verified_projects": 0,
                "total_earned_paise": 0,
                "avg_score": None,
                "leaderboard_rank": None,
                "leaderboard_total": self._institution_count(),
                "top_projects": [],
                "score_distribution": [],
                "cohort_too_small_for_averages": True,
                "empty_reason": (
                    "No students have listed this institution on their profile yet. "
                    "Students appear here once they add it themselves."
                ),
            }

        projects = (
            self.db.query(Project.id, Project.title, Project.is_verified, Project.owner_id)
            .filter(Project.owner_id.in_(student_ids), Project.is_deleted == False)
            .all()
        )
        project_ids = [p.id for p in projects]
        verified_count = sum(1 for p in projects if p.is_verified)

        earned = 0
        if project_ids:
            earned = int(
                self.db.query(func.coalesce(func.sum(Payment.seller_net_paise), 0))
                .filter(
                    Payment.project_id.in_(project_ids),
                    Payment.status == PaymentStatus.PAID,
                    Payment.payment_type == PaymentType.PROJECT_ACCESS,
                )
                .scalar() or 0
            )

        scores = []
        if project_ids:
            scores = [
                s for (s,) in self.db.query(ProjectVerification.verified_build_score)
                .filter(
                    ProjectVerification.project_id.in_(project_ids),
                    ProjectVerification.verified_build_score.isnot(None),
                )
                .all()
            ]

        avg_score = int(round(sum(scores) / len(scores))) if scores else None
        rank, total_institutions = self._rank(key)

        top_projects = []
        if project_ids:
            rows = (
                self.db.query(
                    Project.id, Project.title,
                    ProjectVerification.verified_build_score,
                    Profile.display_name,
                )
                .join(ProjectVerification, ProjectVerification.project_id == Project.id)
                .outerjoin(Profile, Profile.user_id == Project.owner_id)
                .filter(
                    Project.id.in_(project_ids),
                    Project.is_verified == True,
                )
                .order_by(ProjectVerification.verified_build_score.desc())
                .limit(8)
                .all()
            )
            top_projects = [
                {
                    "project_id": pid,
                    "title": title,
                    "score": score,
                    "builder_name": name or "Student",
                    "link": f"/projects/{pid}",
                }
                for pid, title, score, name in rows
            ]

        bands = [("80-100", 0), ("70-79", 0), ("50-69", 0), ("0-49", 0)]
        counts = dict(bands)
        for score in scores:
            if score >= 80:
                counts["80-100"] += 1
            elif score >= 70:
                counts["70-79"] += 1
            elif score >= 50:
                counts["50-69"] += 1
            else:
                counts["0-49"] += 1

        cohort_small = len(student_ids) < MIN_COHORT_FOR_AVERAGES

        return {
            "college_name": partner.college_name,
            "department": partner.department,
            "is_verified": True,
            "students_total": len(student_ids),
            "projects_total": len(projects),
            "verified_projects": verified_count,
            "total_earned_paise": earned,
            "avg_score": avg_score,
            "leaderboard_rank": rank,
            "leaderboard_total": total_institutions,
            "top_projects": top_projects,
            "score_distribution": [
                {"band": band, "count": counts[band]} for band, _ in bands
            ],
            # Suppresses per-student derived figures in the UI when the cohort is
            # small enough that an average is effectively an individual's number.
            "cohort_too_small_for_averages": cohort_small,
            "empty_reason": None,
        }

    def _institution_count(self) -> int:
        from app.users.models import Profile

        return int(
            self.db.query(func.count(func.distinct(func.lower(func.trim(Profile.college)))))
            .filter(Profile.college.isnot(None), Profile.college != "")
            .scalar() or 0
        )

    def _rank(self, key: str) -> tuple[int | None, int]:
        """Rank an institution by verified project count.

        Uses the same ordering the public campus leaderboard uses, so a partner's
        stated position matches what anyone else can see.
        """
        from app.projects.models import Project
        from app.users.models import Profile

        rows = (
            self.db.query(
                func.lower(func.trim(Profile.college)).label("key"),
                func.count(Project.id).label("verified"),
            )
            .join(Project, Project.owner_id == Profile.user_id)
            .filter(
                Profile.college.isnot(None),
                Profile.college != "",
                Project.is_verified == True,
                Project.is_deleted == False,
            )
            .group_by(func.lower(func.trim(Profile.college)))
            .order_by(func.count(Project.id).desc())
            .all()
        )
        total = self._institution_count()
        for index, row in enumerate(rows, start=1):
            if row.key == key:
                return index, total
        return None, total


# ══════════════════════════════════════════════════════════════════════════════
# Employer verification requests
# ══════════════════════════════════════════════════════════════════════════════

def _report_code() -> str:
    return f"VR-{uuid.uuid4().hex[:8].upper()}"


class EmployerVerificationService:
    def __init__(self, db: Session):
        self.db = db

    def request(
        self,
        requester,
        *,
        builder_id: uuid.UUID,
        role_title: str,
        message: str,
        company: str | None = None,
        looking_for: str | None = None,
    ) -> EmployerVerificationRequest:
        from app.users.models import User

        builder = self.db.get(User, builder_id)
        if not builder:
            raise NotFoundError("Builder")
        if builder.id == requester.id:
            raise ValidationError("You cannot request a verification from yourself")

        open_already = (
            self.db.query(EmployerVerificationRequest)
            .filter(
                EmployerVerificationRequest.requester_id == requester.id,
                EmployerVerificationRequest.builder_id == builder_id,
                EmployerVerificationRequest.status == "pending",
            )
            .first()
        )
        if open_already:
            raise ConflictError(
                "You already have an open verification request with this builder"
            )

        row = EmployerVerificationRequest(
            requester_id=requester.id,
            builder_id=builder_id,
            role_title=role_title.strip()[:200],
            company=company,
            message=message,
            looking_for=looking_for,
            status="pending",
            expires_at=_now() + timedelta(days=REQUEST_TTL_DAYS),
        )
        self.db.add(row)
        self.db.flush()

        from app.notifications.models import NotificationType
        from app.notifications.service import NotificationService

        NotificationService(self.db).create(
            recipient_id=builder_id,
            type=NotificationType.SYSTEM,
            title=f"Verification request: {row.role_title}",
            body=(
                f"{company or 'A recruiter'} asked you to verify a private repo for "
                "a role. You choose which repo, and it stays private."
            ),
            link="/verification-requests",
        )
        self.db.commit()
        self.db.refresh(row)
        logger.info("employer_verification_requested", extra={"request": str(row.id)})
        return row

    async def fulfil(
        self,
        request_id: uuid.UUID,
        builder,
        *,
        repo_full_name: str,
        github_token: str,
        note: str | None = None,
    ) -> EmployerVerificationRequest:
        """Run the real scoring engine against a private repo and attach the report.

        Reuses `collect_signals` + `compute_build_score` — the identical engine
        the marketplace uses, so a hiring report is not a weaker second-class
        score. It just isn't persisted onto a Project, because there is no
        listing and the builder is not selling anything.
        """
        row = self.db.get(EmployerVerificationRequest, request_id)
        if not row:
            raise NotFoundError("Verification request")
        if row.builder_id != builder.id:
            raise ForbiddenError("This request was sent to someone else")
        if row.status != "pending":
            raise ConflictError(f"This request is already {row.status}")
        if not repo_full_name or "/" not in repo_full_name:
            raise ValidationError("Enter a repository as owner/name")

        from app.github.service import GitHubClient
        from app.verification import scoring
        from app.verification.service import collect_signals

        gh = GitHubClient(github_token)

        # Ownership is checked against the builder's own GitHub id, so a builder
        # cannot pass off someone else's private repo as their work.
        owns = False
        if builder.github_id:
            try:
                owns = await gh.verify_ownership(repo_full_name, builder.github_id)
            except Exception:
                owns = False
        if not owns:
            raise ValidationError(
                "We could not confirm you own that repository on GitHub. A hiring "
                "report is only meaningful if the work is verifiably yours."
            )

        signals = await collect_signals(
            gh, repo_full_name, ownership_verified=True, hackathon_verified=False,
        )
        result = scoring.compute_build_score(signals)

        row.repo_full_name = repo_full_name
        row.builder_note = note
        row.verified_build_score = result.verified_build_score
        row.report = {
            "verified_build_score": result.verified_build_score,
            "confidence": result.confidence,
            "reasoning": result.reasoning,
            "repo_age_days": result.repo_age_days,
            "commits_analyzed": result.commits_analyzed,
            "contributors_count": result.contributors_count,
            "fraud_flags": list(result.fraud_flags),
            "components": [
                {
                    "key": spec["key"],
                    "label": spec["label"],
                    "weight": spec["weight"],
                    "score": getattr(
                        result,
                        spec["field"] if spec["field"].endswith("_score")
                        else f"{spec['key']}_score",
                        None,
                    ),
                    "explains": spec["explains"],
                }
                for spec in scoring.COMPONENT_SPEC
            ],
            "flags": [
                {"key": flag, **scoring.FLAG_SPEC.get(flag, {})}
                for flag in result.fraud_flags
            ],
            "threshold": scoring.VERIFIED_THRESHOLD,
            "meets_threshold": (
                result.verified_build_score >= scoring.VERIFIED_THRESHOLD
                and not (scoring.DISQUALIFYING_FLAGS & set(result.fraud_flags))
            ),
            "repo_is_private": True,
            "generated_at": _now().isoformat(),
        }
        row.status = "fulfilled"
        row.fulfilled_at = _now()
        row.report_code = _report_code()

        from app.notifications.models import NotificationType
        from app.notifications.service import NotificationService

        NotificationService(self.db).create(
            recipient_id=row.requester_id,
            type=NotificationType.PROJECT_VERIFIED,
            title=f"Verification report ready: {row.role_title}",
            body=(
                f"Verified Build Score {result.verified_build_score}/100 on a "
                f"private repository. Report {row.report_code}."
            ),
            link=f"/verification-requests/{row.id}",
        )
        self.db.commit()
        self.db.refresh(row)
        logger.info(
            "employer_verification_fulfilled",
            extra={"request": str(row.id), "score": result.verified_build_score},
        )
        return row

    def decline(
        self, request_id: uuid.UUID, builder, note: str | None = None
    ) -> EmployerVerificationRequest:
        row = self.db.get(EmployerVerificationRequest, request_id)
        if not row:
            raise NotFoundError("Verification request")
        if row.builder_id != builder.id:
            raise ForbiddenError("This request was sent to someone else")
        if row.status != "pending":
            raise ConflictError(f"This request is already {row.status}")

        row.status = "declined"
        row.builder_note = note

        from app.notifications.models import NotificationType
        from app.notifications.service import NotificationService

        NotificationService(self.db).create(
            recipient_id=row.requester_id,
            type=NotificationType.SYSTEM,
            title="Verification request declined",
            body=note or "The builder declined this verification request.",
            link="/verification-requests",
        )
        self.db.commit()
        self.db.refresh(row)
        return row

    def get(self, request_id: uuid.UUID, user) -> EmployerVerificationRequest:
        row = (
            self.db.query(EmployerVerificationRequest)
            .options(
                joinedload(EmployerVerificationRequest.requester),
                joinedload(EmployerVerificationRequest.builder),
            )
            .filter(EmployerVerificationRequest.id == request_id)
            .first()
        )
        if not row:
            raise NotFoundError("Verification request")

        from app.users.models import UserRole

        if user.role != UserRole.ADMIN and user.id not in (row.requester_id, row.builder_id):
            raise ForbiddenError("This request is between two other people")
        return row

    def list_for_builder(self, builder_id: uuid.UUID) -> list[EmployerVerificationRequest]:
        return (
            self.db.query(EmployerVerificationRequest)
            .options(joinedload(EmployerVerificationRequest.requester))
            .filter(EmployerVerificationRequest.builder_id == builder_id)
            .order_by(EmployerVerificationRequest.created_at.desc())
            .all()
        )

    def list_for_requester(self, requester_id: uuid.UUID) -> list[EmployerVerificationRequest]:
        return (
            self.db.query(EmployerVerificationRequest)
            .options(joinedload(EmployerVerificationRequest.builder))
            .filter(EmployerVerificationRequest.requester_id == requester_id)
            .order_by(EmployerVerificationRequest.created_at.desc())
            .all()
        )
