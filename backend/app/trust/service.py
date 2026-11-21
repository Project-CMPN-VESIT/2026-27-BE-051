"""
Trust services: purchase receipts, duplicate screening, post-purchase health.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.logging import get_logger
from app.core.time import as_utc
from app.trust.duplicate import (
    REVIEW_THRESHOLD, WITHHOLD_THRESHOLD, ProjectFingerprint, find_duplicates, verdict,
)
from app.trust.models import DuplicateFlag, MonitoredProject, TrustReceipt

logger = get_logger("trust")

# A drop this large since purchase is worth telling the buyer about. Smaller
# moves are noise — repos breathe, and a weekly email about a 2-point wobble
# trains people to ignore the alert that matters.
MATERIAL_DROP = 8


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _receipt_code() -> str:
    return f"TR-{uuid.uuid4().hex[:8].upper()}"


# ══════════════════════════════════════════════════════════════════════════════
# Trust receipts
# ══════════════════════════════════════════════════════════════════════════════

class TrustReceiptService:
    def __init__(self, db: Session):
        self.db = db

    def issue(self, payment, project) -> TrustReceipt | None:
        """Freeze the project's trust state at the moment of purchase.

        Called from payment fulfilment. Best-effort by design: a receipt that
        fails to write must not roll back a completed sale, because the buyer has
        already been charged.

        Making that true requires a SAVEPOINT. A plain `try/except` around a
        `flush()` is not enough — a failed flush poisons the whole session, so the
        caller's transaction dies anyway and every later statement raises
        `PendingRollbackError`. `begin_nested()` scopes the failure to this insert
        and leaves the surrounding sale intact.

        Identifiers are also captured *before* the attempt: once a flush has
        failed, reading `payment.id` can trigger a lazy load against the broken
        session, so an error handler that touches ORM attributes raises from
        inside the handler and masks the real cause.

        Only flushes — the caller's transaction owns the commit.
        """
        payment_id = getattr(payment, "id", None)
        project_id = getattr(project, "id", None)
        buyer_id = getattr(payment, "user_id", None)
        try:
            existing = (
                self.db.query(TrustReceipt)
                .filter(TrustReceipt.payment_id == payment.id)
                .first()
            )
            # Cashfree can replay a SUCCESS webhook. Re-issuing would overwrite a
            # receipt with a *newer* score, destroying the exact evidence the
            # receipt exists to preserve.
            if existing:
                return existing

            from app.projects.repository import ProjectRepository

            repo = ProjectRepository(self.db)
            verification = repo.get_verification(project.id) if project else None
            analysis = repo.get_analysis(project.id) if project else None

            components = None
            if verification:
                from app.verification import scoring
                components = {
                    spec["key"]: getattr(verification, spec["field"], None)
                    for spec in scoring.COMPONENT_SPEC
                }

            code_signals = None
            if analysis and analysis.repo_signals:
                keep = (
                    "file_count", "source_file_count", "test_file_count", "has_tests",
                    "has_ci", "has_docker", "has_lockfile", "has_readme",
                    "dependency_count",
                )
                code_signals = {
                    k: v for k, v in (analysis.repo_signals or {}).items() if k in keep
                }

            risk_score = risk_band = None
            try:
                from app.projects.risk import RiskService
                assessment = RiskService(self.db).assess(project.id)
                risk_score, risk_band = assessment.risk_score, assessment.band
            except Exception:
                # Risk is derived, not authoritative. Losing it costs a nice-to-have
                # column, not the receipt.
                pass

            receipt = TrustReceipt(
                payment_id=payment_id,
                project_id=project_id,
                buyer_id=payment.user_id,
                seller_id=project.owner_id,
                receipt_code=_receipt_code(),
                amount_paise=payment.amount_paise,
                platform_fee_paise=payment.platform_fee_paise,
                seller_net_paise=payment.seller_net_paise,
                sale_type=project.sale_type,
                sale_license=getattr(project, "sale_license", None),
                verified_build_score=verification.verified_build_score if verification else None,
                was_verified=bool(project.is_verified),
                confidence=verification.confidence if verification else None,
                ownership_verified=bool(verification.ownership_verified) if verification else False,
                hackathon_verified=bool(verification.hackathon_verified) if verification else False,
                components=components,
                fraud_flags=list(verification.fraud_flags or []) if verification else [],
                commits_analyzed=verification.commits_analyzed if verification else None,
                contributors_count=verification.contributors_count if verification else None,
                repo_age_days=verification.repo_age_days if verification else None,
                repo_full_name=project.repo_full_name,
                project_title=project.title,
                stars=project.stars,
                github_pushed_at=project.github_pushed_at,
                code_signals=code_signals,
                risk_score=risk_score,
                risk_band=risk_band,
                issued_at=_now(),
            )

            # Savepoint: if this insert fails, only the receipt is rolled back.
            with self.db.begin_nested():
                self.db.add(receipt)
                self.db.flush()

            # Start the health trend from this baseline.
            HealthMonitorService(self.db).enrol(
                project_id=project_id,
                watcher_id=buyer_id,
                trust_receipt_id=receipt.id,
                baseline_score=receipt.verified_build_score,
            )

            logger.info(
                "trust_receipt_issued",
                extra={
                    "receipt": receipt.receipt_code,
                    "project": str(project_id),
                    "score": receipt.verified_build_score,
                },
            )
            return receipt
        except Exception as exc:  # pragma: no cover - defensive
            # Only pre-captured plain values here — no ORM attribute access.
            logger.error(
                "trust_receipt_failed",
                extra={"payment": str(payment_id), "error": str(exc)},
            )
            return None

    def get(self, receipt_id: uuid.UUID, user) -> TrustReceipt:
        receipt = self.db.get(TrustReceipt, receipt_id)
        if not receipt:
            raise NotFoundError("Trust receipt")
        self._assert_visible(receipt, user)
        return receipt

    def get_by_code(self, code: str, user) -> TrustReceipt:
        receipt = (
            self.db.query(TrustReceipt)
            .filter(TrustReceipt.receipt_code == code.strip().upper())
            .first()
        )
        if not receipt:
            raise NotFoundError("Trust receipt")
        self._assert_visible(receipt, user)
        return receipt

    def _assert_visible(self, receipt: TrustReceipt, user) -> None:
        """Both parties to the sale and admins may read a receipt.

        The seller needs it as much as the buyer — it is the record that protects
        them from a claim the project was worse than disclosed.
        """
        from app.users.models import UserRole

        if user.role == UserRole.ADMIN:
            return
        if user.id not in (receipt.buyer_id, receipt.seller_id):
            raise ForbiddenError("This receipt belongs to another transaction")

    def for_payment(self, payment_id: uuid.UUID) -> TrustReceipt | None:
        return (
            self.db.query(TrustReceipt)
            .filter(TrustReceipt.payment_id == payment_id)
            .first()
        )

    def list_for_buyer(self, buyer_id: uuid.UUID) -> list[TrustReceipt]:
        return (
            self.db.query(TrustReceipt)
            .filter(TrustReceipt.buyer_id == buyer_id)
            .order_by(TrustReceipt.issued_at.desc())
            .all()
        )

    def list_for_contract(self, contract) -> list[TrustReceipt]:
        """Receipts that could be cited as evidence on an escrow contract.

        Escrow contracts and marketplace sales are separate rails, so this is a
        cross-domain lookup on (project, parties) rather than a FK walk.
        """
        if not contract.project_id:
            return []
        return (
            self.db.query(TrustReceipt)
            .filter(
                TrustReceipt.project_id == contract.project_id,
                TrustReceipt.buyer_id.in_([contract.client_id, contract.builder_id]),
            )
            .order_by(TrustReceipt.issued_at.desc())
            .all()
        )


# ══════════════════════════════════════════════════════════════════════════════
# Duplicate screening
# ══════════════════════════════════════════════════════════════════════════════

class DuplicateService:
    # Comparing against every project ever imported does not scale and does not
    # need to: near-duplicates of a template cluster by language and topic.
    CANDIDATE_LIMIT = 400

    def __init__(self, db: Session):
        self.db = db

    def fingerprint(self, project) -> ProjectFingerprint:
        analysis = None
        try:
            from app.projects.repository import ProjectRepository
            analysis = ProjectRepository(self.db).get_analysis(project.id)
        except Exception:
            pass

        signals = (analysis.repo_signals or {}) if analysis else {}
        deps: tuple[str, ...] = ()
        audit = (getattr(analysis, "dependency_audit", None) or {}) if analysis else {}
        if isinstance(audit, dict):
            names = audit.get("dependency_names")
            if isinstance(names, list):
                deps = tuple(str(n).lower() for n in names)

        return ProjectFingerprint(
            project_id=str(project.id),
            title=project.title or "",
            description=project.description or "",
            topics=tuple(project.topics or ()),
            primary_language=project.primary_language,
            repo_full_name=project.repo_full_name or "",
            top_level_dirs=tuple(signals.get("top_level_dirs") or ()),
            dependency_names=deps,
            file_count=signals.get("file_count"),
        )

    def _candidates(self, project) -> list[ProjectFingerprint]:
        from app.projects.models import Project

        q = (
            self.db.query(Project)
            .filter(Project.id != project.id, Project.is_deleted == False)
        )
        # Prefer same-language projects; that is where real duplicates live.
        if project.primary_language:
            q = q.filter(Project.primary_language == project.primary_language)
        rows = q.order_by(Project.created_at.desc()).limit(self.CANDIDATE_LIMIT).all()
        return [self.fingerprint(p) for p in rows]

    def screen(self, project, *, commit: bool = True) -> list[DuplicateFlag]:
        """Screen a project against existing listings and record any flags.

        Never raises into the import path. A screening failure means an unscreened
        project, which is the status quo — it must not mean a failed import.
        """
        try:
            candidate = self.fingerprint(project)
            matches = find_duplicates(candidate, self._candidates(project))
            if not matches:
                return []

            flags: list[DuplicateFlag] = []
            for match in matches:
                matched_id = uuid.UUID(match.project_id)
                existing = (
                    self.db.query(DuplicateFlag)
                    .filter(
                        DuplicateFlag.project_id == project.id,
                        DuplicateFlag.matched_project_id == matched_id,
                    )
                    .first()
                )
                if existing:
                    # Re-screening refreshes an unreviewed flag but never
                    # resurrects one an admin already dismissed.
                    if existing.status == "pending":
                        existing.similarity = match.similarity
                        existing.signals = [s.as_dict() for s in match.signals]
                        flags.append(existing)
                    continue

                flag = DuplicateFlag(
                    project_id=project.id,
                    matched_project_id=matched_id,
                    similarity=match.similarity,
                    signals=[s.as_dict() for s in match.signals],
                    status="pending",
                )
                self.db.add(flag)
                flags.append(flag)

            top = max((m.similarity for m in matches), default=0)
            decision = verdict(top)
            if decision != "clear":
                project.duplicate_status = (
                    "withheld" if decision == "withhold" else "review"
                )
                self._notify_admins(project, top)

            self.db.flush()
            if commit:
                self.db.commit()

            logger.info(
                "duplicate_screen",
                extra={
                    "project": str(project.id),
                    "matches": len(flags),
                    "top": top,
                    "verdict": decision,
                },
            )
            return flags
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning(
                "duplicate_screen_failed",
                extra={"project": str(getattr(project, "id", None)), "error": str(exc)},
            )
            try:
                self.db.rollback()
            except Exception:
                pass
            return []

    def _notify_admins(self, project, similarity: int) -> None:
        from app.notifications.models import NotificationType
        from app.notifications.service import NotificationService
        from app.users.models import User, UserRole

        admins = self.db.query(User).filter(User.role == UserRole.ADMIN).all()
        notif = NotificationService(self.db)
        for admin in admins:
            notif.create(
                recipient_id=admin.id,
                type=NotificationType.SYSTEM,
                title="Possible duplicate listing",
                body=(
                    f"'{project.title}' is {similarity}% similar to an existing "
                    "listing and is awaiting review."
                ),
                link="/admin/duplicates",
            )

    def list_pending(self) -> list[DuplicateFlag]:
        from sqlalchemy.orm import joinedload

        return (
            self.db.query(DuplicateFlag)
            .options(
                joinedload(DuplicateFlag.project),
                joinedload(DuplicateFlag.matched_project),
            )
            .filter(DuplicateFlag.status == "pending")
            .order_by(DuplicateFlag.similarity.desc())
            .all()
        )

    def list_for_project(self, project_id: uuid.UUID) -> list[DuplicateFlag]:
        from sqlalchemy.orm import joinedload

        return (
            self.db.query(DuplicateFlag)
            .options(joinedload(DuplicateFlag.matched_project))
            .filter(DuplicateFlag.project_id == project_id)
            .order_by(DuplicateFlag.similarity.desc())
            .all()
        )

    def review(
        self, flag_id: uuid.UUID, admin, *, confirm: bool, note: str | None = None
    ) -> DuplicateFlag:
        """Resolve a duplicate flag.

        Confirming keeps the listing withheld and tells the owner why. Dismissing
        releases it — and releases it fully, because a listing left in limbo after
        a human cleared it is a bug the builder cannot see or appeal.
        """
        from app.notifications.models import NotificationType
        from app.notifications.service import NotificationService
        from app.projects.models import Project

        flag = self.db.get(DuplicateFlag, flag_id)
        if not flag:
            raise NotFoundError("Duplicate flag")

        flag.status = "confirmed" if confirm else "dismissed"
        flag.reviewer_id = admin.id
        flag.review_note = note
        flag.reviewed_at = _now()

        project = self.db.get(Project, flag.project_id)
        if project:
            others = (
                self.db.query(func.count(DuplicateFlag.id))
                .filter(
                    DuplicateFlag.project_id == project.id,
                    DuplicateFlag.id != flag.id,
                    DuplicateFlag.status.in_(("pending", "confirmed")),
                )
                .scalar() or 0
            )
            if confirm:
                project.duplicate_status = "withheld"
            elif not others:
                project.duplicate_status = "clear"

            NotificationService(self.db).create(
                recipient_id=project.owner_id,
                type=NotificationType.SYSTEM,
                title=(
                    "Listing withheld as a duplicate" if confirm
                    else "Duplicate review cleared"
                ),
                body=(
                    note or (
                        "A reviewer confirmed this project substantially duplicates an "
                        "existing listing. Reply to this notice if you believe that's wrong."
                        if confirm else
                        "A reviewer looked at the similarity flag on your project and "
                        "cleared it. Your listing is fully visible."
                    )
                ),
                link=f"/projects/{project.id}",
            )

        self.db.commit()
        self.db.refresh(flag)
        return flag


# ══════════════════════════════════════════════════════════════════════════════
# Post-purchase health monitoring
# ══════════════════════════════════════════════════════════════════════════════

class HealthMonitorService:
    """Tracks whether a purchased project keeps being maintained.

    The trend is read from `score_snapshots`, which the verification engine
    already appends to on every run. This service only decides *which* projects
    get rescored, and reads the resulting history back for the buyer.
    """

    def __init__(self, db: Session):
        self.db = db

    def enrol(
        self,
        *,
        project_id: uuid.UUID,
        watcher_id: uuid.UUID,
        trust_receipt_id: uuid.UUID | None = None,
        baseline_score: int | None = None,
    ) -> MonitoredProject | None:
        try:
            existing = (
                self.db.query(MonitoredProject)
                .filter(
                    MonitoredProject.project_id == project_id,
                    MonitoredProject.watcher_id == watcher_id,
                )
                .first()
            )
            if existing:
                existing.is_active = True
                return existing

            row = MonitoredProject(
                project_id=project_id,
                watcher_id=watcher_id,
                trust_receipt_id=trust_receipt_id,
                baseline_score=baseline_score,
                is_active=True,
            )
            self.db.add(row)
            self.db.flush()
            return row
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("monitor_enrol_failed", extra={"error": str(exc)})
            return None

    def due_for_check(self, *, older_than_days: int = 7, limit: int = 200) -> list[uuid.UUID]:
        """Project ids with at least one active watcher and a stale last check."""
        cutoff = _now() - timedelta(days=older_than_days)
        rows = (
            self.db.query(MonitoredProject)
            .filter(MonitoredProject.is_active == True)
            .all()
        )
        due: list[uuid.UUID] = []
        seen: set[uuid.UUID] = set()
        for row in rows:
            if row.project_id in seen:
                continue
            if row.last_checked_at is None or as_utc(row.last_checked_at) < cutoff:
                seen.add(row.project_id)
                due.append(row.project_id)
            if len(due) >= limit:
                break
        return due

    def mark_checked(self, project_id: uuid.UUID) -> None:
        for row in (
            self.db.query(MonitoredProject)
            .filter(
                MonitoredProject.project_id == project_id,
                MonitoredProject.is_active == True,
            )
            .all()
        ):
            row.last_checked_at = _now()

    def alert_on_drop(self, project_id: uuid.UUID, new_score: int | None) -> int:
        """Notify watchers when a purchased project's score materially drops.

        Returns the number of watchers alerted. Compares against the last score
        we alerted about (falling back to the purchase baseline) so a project
        that keeps sliding raises a fresh alert per step down, but a flat score
        never re-alerts.
        """
        if new_score is None:
            return 0

        from app.notifications.models import NotificationType
        from app.notifications.service import NotificationService
        from app.projects.models import Project

        project = self.db.get(Project, project_id)
        notif = NotificationService(self.db)
        alerted = 0

        for row in (
            self.db.query(MonitoredProject)
            .filter(
                MonitoredProject.project_id == project_id,
                MonitoredProject.is_active == True,
            )
            .all()
        ):
            reference = (
                row.last_alerted_score
                if row.last_alerted_score is not None
                else row.baseline_score
            )
            if reference is None:
                row.last_alerted_score = new_score
                continue
            drop = reference - new_score
            if drop < MATERIAL_DROP:
                continue

            notif.create(
                recipient_id=row.watcher_id,
                type=NotificationType.SYSTEM,
                title=f"Health drop on {project.title if project else 'a purchased project'}",
                body=(
                    f"The Verified Build Score fell from {reference} to {new_score} "
                    f"({drop} points) since you bought it. Usually this means the "
                    "repo has gone quiet."
                ),
                link=f"/purchases/{project_id}",
            )
            row.last_alerted_score = new_score
            alerted += 1

        if alerted:
            self.db.commit()
        return alerted

    def trend(self, project_id: uuid.UUID, watcher_id: uuid.UUID) -> dict:
        """The buyer-facing health trend for one purchased project."""
        from app.growth.models import ScoreSnapshot
        from app.projects.models import Project

        row = (
            self.db.query(MonitoredProject)
            .filter(
                MonitoredProject.project_id == project_id,
                MonitoredProject.watcher_id == watcher_id,
            )
            .first()
        )
        if not row:
            raise NotFoundError("Monitored project")

        project = self.db.get(Project, project_id)
        receipt = (
            self.db.get(TrustReceipt, row.trust_receipt_id)
            if row.trust_receipt_id else None
        )

        # Only history from the purchase onwards is the buyer's business; the
        # seller's earlier score history is not part of what they bought.
        since = as_utc(receipt.issued_at if receipt else row.created_at)
        # Filtered in Python: these columns come back naive from SQLite, so a SQL
        # comparison against an aware bound value can silently match nothing.
        snapshots = [
            s for s in (
                self.db.query(ScoreSnapshot)
                .filter(ScoreSnapshot.project_id == project_id)
                .order_by(ScoreSnapshot.recorded_at.asc())
                .all()
            )
            if s.recorded_at and as_utc(s.recorded_at) >= since
        ]

        series = [
            {
                "recorded_at": as_utc(s.recorded_at).isoformat(),
                "score": s.verified_build_score,
                "is_verified": s.is_verified,
                "confidence": s.confidence,
                "components": s.components or {},
                "fraud_flags": list(s.fraud_flags or []),
            }
            for s in snapshots
        ]

        baseline = row.baseline_score
        latest = series[-1]["score"] if series else baseline
        delta = (latest - baseline) if (latest is not None and baseline is not None) else None

        direction = "unknown"
        if delta is not None:
            direction = "up" if delta >= 3 else "down" if delta <= -3 else "flat"

        return {
            "project_id": project_id,
            "project_title": project.title if project else None,
            "repo_full_name": project.repo_full_name if project else None,
            "baseline_score": baseline,
            "latest_score": latest,
            "delta": delta,
            "direction": direction,
            "readings": len(series),
            "last_checked_at": (
                as_utc(row.last_checked_at).isoformat() if row.last_checked_at else None
            ),
            "purchased_at": since.isoformat(),
            "receipt_code": receipt.receipt_code if receipt else None,
            "receipt_id": receipt.id if receipt else None,
            "series": series,
            "days_since_push": self._days_since_push(project),
        }

    @staticmethod
    def _days_since_push(project) -> int | None:
        if not project or not project.github_pushed_at:
            return None
        try:
            dt = datetime.fromisoformat(project.github_pushed_at.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return max(0, (_now() - dt).days)
        except Exception:
            return None

    def list_for_buyer(self, watcher_id: uuid.UUID) -> list[dict]:
        rows = (
            self.db.query(MonitoredProject)
            .filter(
                MonitoredProject.watcher_id == watcher_id,
                MonitoredProject.is_active == True,
            )
            .all()
        )
        out = []
        for row in rows:
            try:
                out.append(self.trend(row.project_id, watcher_id))
            except NotFoundError:
                continue
        out.sort(key=lambda t: (t["delta"] if t["delta"] is not None else 0))
        return out
