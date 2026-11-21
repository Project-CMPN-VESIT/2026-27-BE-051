"""Hackathon claim lifecycle: create, analyse (GitHub timeline), admin review."""
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.core.logging import get_logger
from app.github.service import GitHubClient
from app.hackathon.engine import HackathonSignals, compute_authenticity
from app.hackathon.models import HackathonClaim, HackathonClaimStatus
from app.hackathon.schemas import ClaimCreate
from app.projects.repository import ProjectRepository
from app.users.models import User, UserRole

logger = get_logger("hackathon")


def _parse_gh_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


class HackathonService:
    def __init__(self, db: Session):
        self.db = db
        self.projects = ProjectRepository(db)

    def _get_claim(self, claim_id: uuid.UUID) -> HackathonClaim:
        claim = self.db.get(HackathonClaim, claim_id)
        if not claim:
            raise NotFoundError("Hackathon claim")
        return claim

    def create_claim(self, user: User, data: ClaimCreate) -> HackathonClaim:
        project = self.projects.get_by_id(data.project_id)
        if not project:
            raise NotFoundError("Project")
        if project.owner_id != user.id and user.role != UserRole.ADMIN:
            raise ForbiddenError("Only the project owner can submit a hackathon claim")

        existing = (
            self.db.query(HackathonClaim)
            .filter(HackathonClaim.project_id == data.project_id)
            .first()
        )
        if existing:
            raise ConflictError("This project already has a hackathon claim")

        claim = HackathonClaim(
            project_id=data.project_id,
            claimed_by_id=user.id,
            event_name=data.event_name,
            event_url=data.event_url,
            platform=data.platform,
            event_start=data.event_start,
            event_end=data.event_end,
            proof_url=data.proof_url,
            status=HackathonClaimStatus.PENDING,
        )
        self.db.add(claim)
        self.db.commit()
        logger.info("Hackathon claim created", claim_id=str(claim.id), project_id=str(data.project_id))
        return claim

    def get_claim(self, claim_id: uuid.UUID) -> HackathonClaim:
        return self._get_claim(claim_id)

    def get_by_project(self, project_id: uuid.UUID) -> HackathonClaim | None:
        return (
            self.db.query(HackathonClaim)
            .filter(HackathonClaim.project_id == project_id)
            .first()
        )

    async def analyze_claim(self, user: User, claim_id: uuid.UUID, github_token: str) -> HackathonClaim:
        claim = self._get_claim(claim_id)
        project = self.projects.get_by_id(claim.project_id)
        if not project:
            raise NotFoundError("Project")
        if project.owner_id != user.id and user.role != UserRole.ADMIN:
            raise ForbiddenError("Only the project owner can analyse this claim")

        signals = await self._collect(github_token, project.repo_full_name, claim)
        result = compute_authenticity(signals)

        claim.authenticity_score = result.authenticity_score
        claim.verdict = result.verdict
        claim.reasoning = result.reasoning
        claim.signals = {
            "commits_in_window": result.commits_in_window,
            "commits_before_event": result.commits_before_event,
            "commits_after_event": result.commits_after_event,
            "total_commits": result.total_commits,
            "confidence": result.confidence,
            "flags": result.flags,
        }
        # Auto-flag clearly suspicious claims; otherwise mark analysed for admin sign-off.
        claim.status = (
            HackathonClaimStatus.FLAGGED
            if result.verdict == "likely_inauthentic"
            else HackathonClaimStatus.ANALYZED
        )
        self.db.commit()
        logger.info("Hackathon claim analysed", claim_id=str(claim.id),
                    score=result.authenticity_score, verdict=result.verdict)
        return claim

    async def _collect(self, github_token: str, repo_full_name: str, claim: HackathonClaim) -> HackathonSignals:
        import asyncio
        gh = GitHubClient(github_token)
        try:
            repo, commits = await asyncio.gather(
                gh.get_repo(repo_full_name),
                gh.get_commits(repo_full_name, per_page=100),
                return_exceptions=True,
            )
        except Exception as exc:  # pragma: no cover
            logger.warning("Hackathon signal collection failed", error=str(exc))
            return HackathonSignals(event_start=claim.event_start, event_end=claim.event_end, signals_available=False)

        if isinstance(repo, Exception):
            return HackathonSignals(event_start=claim.event_start, event_end=claim.event_end, signals_available=False)

        commits = commits if isinstance(commits, list) else []
        commit_dates = []
        for c in commits:
            if isinstance(c, dict):
                d = _parse_gh_dt(c.get("commit", {}).get("author", {}).get("date"))
                if d:
                    commit_dates.append(d)

        return HackathonSignals(
            event_start=claim.event_start,
            event_end=claim.event_end,
            commit_dates=commit_dates,
            repo_created_at=_parse_gh_dt(repo.get("created_at")),
            is_fork=bool(repo.get("fork", False)),
            signals_available=True,
        )

    def list_for_review(self) -> list[HackathonClaim]:
        return (
            self.db.query(HackathonClaim)
            .filter(HackathonClaim.status.in_([
                HackathonClaimStatus.ANALYZED,
                HackathonClaimStatus.FLAGGED,
                HackathonClaimStatus.PENDING,
            ]))
            .order_by(HackathonClaim.created_at.desc())
            .all()
        )

    def review(self, admin: User, claim_id: uuid.UUID, approve: bool, notes: str | None) -> HackathonClaim:
        if admin.role != UserRole.ADMIN:
            raise ForbiddenError("Only an admin can review hackathon claims")
        claim = self._get_claim(claim_id)
        if claim.status in (HackathonClaimStatus.VERIFIED, HackathonClaimStatus.REJECTED):
            raise ConflictError("This claim has already been reviewed")

        claim.status = HackathonClaimStatus.VERIFIED if approve else HackathonClaimStatus.REJECTED
        claim.reviewer_id = admin.id
        claim.review_notes = notes
        claim.reviewed_at = datetime.now(timezone.utc)

        if approve:
            verification = self.projects.get_verification(claim.project_id)
            if verification:
                self.projects.update_verification(verification, hackathon_verified=True)
            self._notify_owner(claim, approved=True)
        else:
            self._notify_owner(claim, approved=False)

        self.db.commit()
        logger.info("Hackathon claim reviewed", claim_id=str(claim.id), approved=approve)
        return claim

    def _notify_owner(self, claim: HackathonClaim, approved: bool) -> None:
        from app.notifications.models import NotificationType
        from app.notifications.service import NotificationService
        NotificationService(self.db).create(
            recipient_id=claim.claimed_by_id,
            type=NotificationType.PROJECT_VERIFIED if approved else NotificationType.SYSTEM,
            title="Hackathon claim verified" if approved else "Hackathon claim not approved",
            body=(f"'{claim.event_name}' participation was verified for your project."
                  if approved else
                  f"Your hackathon claim for '{claim.event_name}' was not approved."),
            link=f"/projects/{claim.project_id}",
        )
        owner = self.db.get(User, claim.claimed_by_id)
        if owner and owner.email:
            from app.core.email import send_hackathon_reviewed_email
            send_hackathon_reviewed_email(owner.email, claim.event_name, approved)
