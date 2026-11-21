"""
Analytics and pipeline services for the growth surfaces.

Three responsibilities:
  * recording (project views, score snapshots) — cheap, best-effort, never blocks
  * reading (builder analytics, score history)
  * recruiter pipeline (saved searches, shortlists)

Recording is deliberately fault-tolerant. A failed analytics write must never
break the request that triggered it: nobody should be unable to view a project
because a counter could not be incremented.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.growth.models import ProjectView, SavedSearch, ScoreSnapshot, ShortlistEntry

logger = get_logger("analytics")


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


# ══════════════════════════════════════════════════════════════════════════════
# Recording
# ══════════════════════════════════════════════════════════════════════════════

def record_project_view(
    db: Session,
    *,
    project_id: uuid.UUID,
    owner_id: uuid.UUID,
    viewer_id: uuid.UUID | None,
) -> None:
    """Increment today's view counter for a project.

    Never raises. Uses a per-day upsert so the table grows with days-of-history
    rather than with traffic. Owner views are counted separately so a builder
    refreshing their own listing doesn't inflate the number they're shown.
    """
    kind = (
        "owner" if viewer_id and viewer_id == owner_id
        else "member" if viewer_id
        else "anonymous"
    )
    try:
        day = _today()
        row = (
            db.query(ProjectView)
            .filter(
                ProjectView.project_id == project_id,
                ProjectView.day == day,
                ProjectView.viewer_kind == kind,
            )
            .first()
        )
        if row:
            row.count += 1
        else:
            db.add(ProjectView(
                project_id=project_id, owner_id=owner_id,
                day=day, viewer_kind=kind, count=1,
            ))
        db.commit()
    except Exception as exc:  # pragma: no cover - defensive
        # A unique-constraint race between two concurrent first-views of the day
        # lands here; the count is approximate by design and one lost increment
        # is not worth failing a page load over.
        db.rollback()
        logger.warning("view_not_recorded", extra={"project": str(project_id), "error": str(exc)})


def record_score_snapshot(
    db: Session,
    *,
    project,
    verification,
    components: dict | None = None,
    commit: bool = False,
) -> ScoreSnapshot | None:
    """Append a point-in-time record of a project's score.

    Called after each verification run. Append-only: existing rows are never
    updated, which is what makes the trend defensible.
    """
    try:
        snapshot = ScoreSnapshot(
            project_id=project.id,
            owner_id=project.owner_id,
            verified_build_score=verification.verified_build_score,
            confidence=verification.confidence,
            is_verified=bool(project.is_verified),
            components=components,
            fraud_flags=list(verification.fraud_flags or []),
            recorded_at=datetime.now(timezone.utc),
        )
        db.add(snapshot)
        db.flush()
        if commit:
            db.commit()
        return snapshot
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "snapshot_not_recorded",
            extra={"project": str(getattr(project, "id", None)), "error": str(exc)},
        )
        return None


# ══════════════════════════════════════════════════════════════════════════════
# Reading
# ══════════════════════════════════════════════════════════════════════════════

class AnalyticsService:
    def __init__(self, db: Session):
        self.db = db

    def builder_overview(self, user_id: uuid.UUID, days: int = 30) -> dict:
        """Everything the builder analytics dashboard needs, in one query set."""
        from app.escrow.models import (
            EscrowContract, EscrowEntryType, EscrowLedgerEntry,
        )
        from app.payments.models import Payment, PaymentStatus, PaymentType
        from app.projects.models import Project

        since = datetime.now(timezone.utc) - timedelta(days=days)
        since_day = since.date().isoformat()

        project_ids = [
            pid for (pid,) in self.db.query(Project.id).filter(
                Project.owner_id == user_id, Project.is_deleted == False
            )
        ]

        # ── Views, split by whether they came from outside ────────────────────
        view_rows = (
            self.db.query(ProjectView.day, ProjectView.viewer_kind, func.sum(ProjectView.count))
            .filter(ProjectView.owner_id == user_id, ProjectView.day >= since_day)
            .group_by(ProjectView.day, ProjectView.viewer_kind)
            .all()
        )
        by_day: dict[str, int] = {}
        external_total = 0
        owner_total = 0
        for day, kind, total in view_rows:
            total = int(total or 0)
            if kind == "owner":
                owner_total += total
                continue
            external_total += total
            by_day[day] = by_day.get(day, 0) + total

        views_series = self._fill_days(by_day, days)

        # ── Earnings over time ───────────────────────────────────────────────
        earnings_rows = []
        if project_ids:
            earnings_rows = (
                self.db.query(Payment.created_at, Payment.seller_net_paise)
                .filter(
                    Payment.project_id.in_(project_ids),
                    Payment.status == PaymentStatus.PAID,
                    Payment.payment_type == PaymentType.PROJECT_ACCESS,
                    Payment.created_at >= since,
                )
                .all()
            )
        earnings_by_day: dict[str, int] = {}
        for created_at, net in earnings_rows:
            if created_at is None:
                continue
            key = created_at.date().isoformat()
            earnings_by_day[key] = earnings_by_day.get(key, 0) + int(net or 0)
        earnings_series = self._fill_days(earnings_by_day, days)

        sales_total = sum(earnings_by_day.values())

        lifetime_sales = 0
        sales_count = 0
        if project_ids:
            lifetime_sales = int(
                self.db.query(func.coalesce(func.sum(Payment.seller_net_paise), 0))
                .filter(
                    Payment.project_id.in_(project_ids),
                    Payment.status == PaymentStatus.PAID,
                    Payment.payment_type == PaymentType.PROJECT_ACCESS,
                )
                .scalar() or 0
            )
            sales_count = int(
                self.db.query(func.count(Payment.id))
                .filter(
                    Payment.project_id.in_(project_ids),
                    Payment.status == PaymentStatus.PAID,
                    Payment.payment_type == PaymentType.PROJECT_ACCESS,
                )
                .scalar() or 0
            )

        # ── Escrow credited ──────────────────────────────────────────────────
        escrow_released = int(
            self.db.query(func.coalesce(func.sum(EscrowLedgerEntry.amount_paise), 0))
            .join(EscrowContract, EscrowLedgerEntry.contract_id == EscrowContract.id)
            .filter(
                EscrowContract.builder_id == user_id,
                EscrowLedgerEntry.entry_type == EscrowEntryType.RELEASE,
            )
            .scalar() or 0
        )

        # ── Inbound interest ─────────────────────────────────────────────────
        invites = self._count_invites(user_id, since)

        # ── Per-project view leaderboard ─────────────────────────────────────
        top_rows = (
            self.db.query(
                ProjectView.project_id,
                Project.title,
                func.sum(ProjectView.count).label("views"),
            )
            .join(Project, Project.id == ProjectView.project_id)
            .filter(
                ProjectView.owner_id == user_id,
                ProjectView.viewer_kind != "owner",
                ProjectView.day >= since_day,
            )
            .group_by(ProjectView.project_id, Project.title)
            .order_by(func.sum(ProjectView.count).desc())
            .limit(8)
            .all()
        )

        return {
            "window_days": days,
            "views_total": external_total,
            "views_owner_excluded": owner_total,
            "views_series": views_series,
            "earnings_window_paise": sales_total,
            "earnings_series": earnings_series,
            "lifetime_sales_paise": lifetime_sales,
            "sales_count": sales_count,
            "escrow_released_paise": escrow_released,
            "projects_total": len(project_ids),
            "top_projects": [
                {"project_id": pid, "title": title, "views": int(views or 0)}
                for pid, title, views in top_rows
            ],
            **invites,
        }

    def _count_invites(self, user_id: uuid.UUID, since: datetime) -> dict:
        """Inbound interest: offers received, adoption requests, contributor asks."""
        from app.incubation.models import IncubationOffer
        from app.messaging.models import Thread
        from app.projects.models import ContributorRequest, Project

        project_ids = [
            pid for (pid,) in self.db.query(Project.id).filter(
                Project.owner_id == user_id, Project.is_deleted == False
            )
        ]
        if not project_ids:
            return {
                "offers_received": 0, "contributor_requests": 0,
                "conversations_started": 0,
            }

        offers = int(
            self.db.query(func.count(IncubationOffer.id))
            .filter(IncubationOffer.project_id.in_(project_ids))
            .scalar() or 0
        )
        contrib = int(
            self.db.query(func.count(ContributorRequest.id))
            .filter(ContributorRequest.project_id.in_(project_ids))
            .scalar() or 0
        )
        threads = int(
            self.db.query(func.count(Thread.id))
            .filter(
                (Thread.participant_a == user_id) | (Thread.participant_b == user_id)
            )
            .scalar() or 0
        )
        return {
            "offers_received": offers,
            "contributor_requests": contrib,
            "conversations_started": threads,
        }

    @staticmethod
    def _fill_days(values: dict[str, int], days: int) -> list[dict]:
        """Dense daily series — gaps become explicit zeros.

        A sparse series makes a chart lie: three points a week apart render as a
        smooth line rather than the two idle days they actually were.
        """
        today = datetime.now(timezone.utc).date()
        out = []
        for offset in range(days - 1, -1, -1):
            day = (today - timedelta(days=offset)).isoformat()
            out.append({"day": day, "value": int(values.get(day, 0))})
        return out

    def score_history(self, project_id: uuid.UUID, limit: int = 60) -> list[ScoreSnapshot]:
        return (
            self.db.query(ScoreSnapshot)
            .filter(ScoreSnapshot.project_id == project_id)
            .order_by(ScoreSnapshot.recorded_at.asc())
            .limit(limit)
            .all()
        )

    def builder_score_history(self, user_id: uuid.UUID, limit: int = 200) -> list[ScoreSnapshot]:
        return (
            self.db.query(ScoreSnapshot)
            .filter(ScoreSnapshot.owner_id == user_id)
            .order_by(ScoreSnapshot.recorded_at.asc())
            .limit(limit)
            .all()
        )


# ══════════════════════════════════════════════════════════════════════════════
# Recruiter pipeline
# ══════════════════════════════════════════════════════════════════════════════

class PipelineService:
    """Saved searches and shortlists."""

    MAX_SAVED_SEARCHES = 25

    def __init__(self, db: Session):
        self.db = db

    # ── Saved searches ───────────────────────────────────────────────────────

    def list_searches(self, user_id: uuid.UUID) -> list[SavedSearch]:
        return (
            self.db.query(SavedSearch)
            .filter(SavedSearch.user_id == user_id)
            .order_by(SavedSearch.created_at.desc())
            .all()
        )

    def create_search(
        self, user_id: uuid.UUID, name: str, filters: dict, alerts_enabled: bool
    ) -> SavedSearch:
        from app.core.exceptions import ValidationError

        existing = (
            self.db.query(func.count(SavedSearch.id))
            .filter(SavedSearch.user_id == user_id)
            .scalar() or 0
        )
        if existing >= self.MAX_SAVED_SEARCHES:
            raise ValidationError(
                f"You can save up to {self.MAX_SAVED_SEARCHES} searches. "
                "Delete one to add another."
            )

        search = SavedSearch(
            user_id=user_id,
            name=name.strip()[:120],
            filters=filters,
            alerts_enabled=alerts_enabled,
            # Baseline the count now so the first alert reports genuinely new
            # matches rather than the entire existing result set.
            last_match_count=self._count_matches(filters),
            last_checked_at=datetime.now(timezone.utc),
        )
        self.db.add(search)
        self.db.commit()
        self.db.refresh(search)
        return search

    def update_search(
        self, user_id: uuid.UUID, search_id: uuid.UUID, **changes
    ) -> SavedSearch:
        search = self._own_search(user_id, search_id)
        for key, value in changes.items():
            if value is not None and hasattr(search, key):
                setattr(search, key, value)
        self.db.commit()
        self.db.refresh(search)
        return search

    def delete_search(self, user_id: uuid.UUID, search_id: uuid.UUID) -> None:
        self.db.delete(self._own_search(user_id, search_id))
        self.db.commit()

    def run_search(self, user_id: uuid.UUID, search_id: uuid.UUID) -> dict:
        """Execute a saved search and reset its new-match baseline."""
        search = self._own_search(user_id, search_id)
        count = self._count_matches(search.filters)
        new_matches = max(0, count - search.last_match_count)
        search.last_match_count = count
        search.last_checked_at = datetime.now(timezone.utc)
        self.db.commit()
        return {"total": count, "new_since_last_check": new_matches}

    def _own_search(self, user_id: uuid.UUID, search_id: uuid.UUID) -> SavedSearch:
        from app.core.exceptions import ForbiddenError, NotFoundError

        search = self.db.get(SavedSearch, search_id)
        if not search:
            raise NotFoundError("Saved search")
        if search.user_id != user_id:
            raise ForbiddenError("Not your saved search")
        return search

    def _count_matches(self, filters: dict) -> int:
        """Count projects matching a saved search's filters.

        Applies the same subset of filters the discovery endpoint supports.
        Unknown keys are ignored rather than raising, so a saved search created
        against an older filter set keeps working after a schema change.
        """
        from app.projects.models import Project, ProjectVerification

        q = self.db.query(func.count(Project.id)).filter(Project.is_deleted == False)

        if filters.get("verified_only"):
            q = q.filter(Project.is_verified == True)
        if filters.get("for_sale"):
            q = q.filter(Project.is_for_sale == True)
        if filters.get("seeking_contributors"):
            q = q.filter(Project.is_seeking_contributors == True)
        if language := filters.get("language"):
            q = q.filter(Project.primary_language == language)
        if stage := filters.get("stage"):
            q = q.filter(Project.stage == stage)
        if search_text := filters.get("search"):
            like = f"%{search_text}%"
            q = q.filter(Project.title.ilike(like))
        if (min_score := filters.get("min_score")) is not None:
            q = q.join(
                ProjectVerification, ProjectVerification.project_id == Project.id
            ).filter(ProjectVerification.verified_build_score >= int(min_score))
        if (max_price := filters.get("max_price_paise")) is not None:
            q = q.filter(Project.price_paise <= int(max_price))

        return int(q.scalar() or 0)

    # ── Shortlists ───────────────────────────────────────────────────────────

    def list_shortlist(self, user_id: uuid.UUID) -> list[ShortlistEntry]:
        from sqlalchemy.orm import joinedload

        return (
            self.db.query(ShortlistEntry)
            .options(joinedload(ShortlistEntry.project))
            .filter(ShortlistEntry.user_id == user_id)
            .order_by(ShortlistEntry.created_at.desc())
            .all()
        )

    def add_to_shortlist(
        self, user_id: uuid.UUID, project_id: uuid.UUID,
        note: str | None = None, stage: str | None = None,
    ) -> ShortlistEntry:
        from app.core.exceptions import NotFoundError
        from app.projects.models import Project

        project = (
            self.db.query(Project)
            .filter(Project.id == project_id, Project.is_deleted == False)
            .first()
        )
        if not project:
            raise NotFoundError("Project")

        existing = (
            self.db.query(ShortlistEntry)
            .filter(
                ShortlistEntry.user_id == user_id,
                ShortlistEntry.project_id == project_id,
            )
            .first()
        )
        # Idempotent: adding twice updates the note instead of erroring, because
        # the user's intent ("this should be on my shortlist") is already satisfied.
        if existing:
            if note is not None:
                existing.note = note
            if stage is not None:
                existing.stage = stage
            self.db.commit()
            self.db.refresh(existing)
            return existing

        entry = ShortlistEntry(
            user_id=user_id, project_id=project_id, note=note, stage=stage,
        )
        self.db.add(entry)
        self.db.commit()
        self.db.refresh(entry)
        return entry

    def update_shortlist_entry(
        self, user_id: uuid.UUID, entry_id: uuid.UUID, **changes
    ) -> ShortlistEntry:
        entry = self._own_entry(user_id, entry_id)
        for key, value in changes.items():
            if value is not None and hasattr(entry, key):
                setattr(entry, key, value)
        self.db.commit()
        self.db.refresh(entry)
        return entry

    def remove_from_shortlist(self, user_id: uuid.UUID, entry_id: uuid.UUID) -> None:
        self.db.delete(self._own_entry(user_id, entry_id))
        self.db.commit()

    def _own_entry(self, user_id: uuid.UUID, entry_id: uuid.UUID) -> ShortlistEntry:
        from app.core.exceptions import ForbiddenError, NotFoundError

        entry = self.db.get(ShortlistEntry, entry_id)
        if not entry:
            raise NotFoundError("Shortlist entry")
        if entry.user_id != user_id:
            raise ForbiddenError("Not your shortlist")
        return entry
