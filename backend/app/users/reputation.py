"""
Builder Reputation engine.

Turns real execution data (verified projects, escrow contract delivery, revenue)
into a single reputation score, a tier, and earned badges. The scoring functions
are pure and deterministic; ReputationService gathers the inputs from the DB and
persists the result onto BuilderReputation.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.users.models import BuilderReputation


@dataclass
class ReputationInputs:
    total_projects: int = 0
    verified_projects: int = 0
    avg_build_score: int | None = None
    contracts_total: int = 0
    contracts_completed: int = 0
    revenue_earned_paise: int = 0
    collab_score: int = 0


TIERS = ("newcomer", "rising", "trusted", "elite")


def _clamp(v: float, lo: int = 0, hi: int = 100) -> int:
    return int(max(lo, min(hi, round(v))))


def delivery_rate(inp: ReputationInputs) -> float | None:
    if inp.contracts_total <= 0:
        return None
    return inp.contracts_completed / inp.contracts_total


def verified_ratio(inp: ReputationInputs) -> float | None:
    if inp.total_projects <= 0:
        return None
    return inp.verified_projects / inp.total_projects


def compute_completion_score(inp: ReputationInputs) -> int:
    """Delivery rate as a 0-100 score; 0 when the builder has no contracts yet."""
    dr = delivery_rate(inp)
    return _clamp(dr * 100) if dr is not None else 0


def compute_trust_score(inp: ReputationInputs) -> int:
    """Blend of verified-project ratio, average build score, and delivery rate.

    Each component contributes only when its data exists, and the weights are
    renormalised over the available components so a builder isn't punished for
    simply not having escrow history yet.
    """
    components: list[tuple[float, float]] = []  # (weight, value 0..1)
    vr = verified_ratio(inp)
    if vr is not None:
        components.append((0.4, vr))
    if inp.avg_build_score is not None:
        components.append((0.35, inp.avg_build_score / 100))
    dr = delivery_rate(inp)
    if dr is not None:
        components.append((0.25, dr))
    if not components:
        return 0
    total_w = sum(w for w, _ in components)
    return _clamp(100 * sum(w * v for w, v in components) / total_w)


def compute_points(inp: ReputationInputs, trust_score: int) -> int:
    """Leaderboard score. Rewards verified builds, completed contracts, revenue,
    and trust. Revenue contributes 1 point per ₹1,000 released (revenue is in paise)."""
    return (
        inp.verified_projects * 40
        + inp.contracts_completed * 60
        + trust_score * 2
        + inp.revenue_earned_paise // 100_000
    )


def compute_tier(points: int) -> str:
    if points >= 500:
        return "elite"
    if points >= 250:
        return "trusted"
    if points >= 80:
        return "rising"
    return "newcomer"


def compute_badges(inp: ReputationInputs, tier: str, trust_score: int) -> list[str]:
    badges: list[str] = []
    if inp.verified_projects >= 1:
        badges.append("verified_builder")
    dr = delivery_rate(inp)
    if inp.contracts_completed >= 3 and dr is not None and dr >= 0.8:
        badges.append("reliable_deliverer")
    if inp.revenue_earned_paise >= 5_000_000:  # ₹50k+ earned through escrow
        badges.append("top_earner")
    if (inp.avg_build_score or 0) >= 80:
        badges.append("quality_code")
    if inp.collab_score >= 40:
        badges.append("great_collaborator")
    if tier == "elite":
        badges.append("elite")
    return badges


class ReputationService:
    """Gathers execution data from the DB and persists a recomputed reputation."""

    def __init__(self, db: Session):
        self.db = db

    def _gather(self, user_id: uuid.UUID) -> ReputationInputs:
        # Imported lazily to avoid import cycles (escrow imports users).
        from sqlalchemy import func
        from app.projects.models import Project, ProjectVerification
        from app.escrow.models import (
            EscrowContract, EscrowContractStatus, EscrowEntryType, EscrowLedgerEntry,
        )

        projects = (
            self.db.query(Project)
            .filter(Project.owner_id == user_id, Project.is_deleted == False)
            .all()
        )
        total_projects = len(projects)
        verified_projects = sum(1 for p in projects if p.is_verified)

        avg_build_score = None
        if projects:
            project_ids = [p.id for p in projects]
            avg = (
                self.db.query(func.avg(ProjectVerification.verified_build_score))
                .filter(
                    ProjectVerification.project_id.in_(project_ids),
                    ProjectVerification.verified_build_score.isnot(None),
                )
                .scalar()
            )
            if avg is not None:
                avg_build_score = int(round(float(avg)))

        contracts_total = (
            self.db.query(func.count(EscrowContract.id))
            .filter(EscrowContract.builder_id == user_id)
            .scalar()
        ) or 0
        contracts_completed = (
            self.db.query(func.count(EscrowContract.id))
            .filter(
                EscrowContract.builder_id == user_id,
                EscrowContract.status == EscrowContractStatus.COMPLETED,
            )
            .scalar()
        ) or 0

        revenue = (
            self.db.query(func.coalesce(func.sum(EscrowLedgerEntry.amount_paise), 0))
            .join(EscrowContract, EscrowLedgerEntry.contract_id == EscrowContract.id)
            .filter(
                EscrowContract.builder_id == user_id,
                EscrowLedgerEntry.entry_type == EscrowEntryType.RELEASE,
            )
            .scalar()
        ) or 0

        rep = self.db.query(BuilderReputation).filter(BuilderReputation.user_id == user_id).first()
        collab = rep.collab_score if rep else 0

        return ReputationInputs(
            total_projects=total_projects,
            verified_projects=verified_projects,
            avg_build_score=avg_build_score,
            contracts_total=int(contracts_total),
            contracts_completed=int(contracts_completed),
            revenue_earned_paise=int(revenue),
            collab_score=collab,
        )

    def recompute(self, user_id: uuid.UUID, commit: bool = True) -> BuilderReputation:
        rep = self.db.query(BuilderReputation).filter(BuilderReputation.user_id == user_id).first()
        if not rep:
            rep = BuilderReputation(user_id=user_id)
            self.db.add(rep)
            self.db.flush()

        inp = self._gather(user_id)
        trust = compute_trust_score(inp)
        points = compute_points(inp, trust)

        rep.total_projects = inp.total_projects
        rep.verified_projects = inp.verified_projects
        rep.avg_build_score = inp.avg_build_score
        rep.contracts_total = inp.contracts_total
        rep.contracts_completed = inp.contracts_completed
        rep.revenue_earned_paise = inp.revenue_earned_paise
        rep.trust_score = trust
        rep.completion_score = compute_completion_score(inp)
        rep.contribution_score = inp.verified_projects * 10 + inp.contracts_completed * 15
        rep.reputation_points = points
        rep.tier = compute_tier(points)
        rep.last_computed_at = datetime.now(timezone.utc)

        self.db.flush()
        if commit:
            self.db.commit()
        return rep

    def badges_for(self, rep: BuilderReputation) -> list[str]:
        inp = ReputationInputs(
            total_projects=rep.total_projects,
            verified_projects=rep.verified_projects,
            avg_build_score=rep.avg_build_score,
            contracts_total=rep.contracts_total,
            contracts_completed=rep.contracts_completed,
            revenue_earned_paise=rep.revenue_earned_paise,
            collab_score=rep.collab_score,
        )
        return compute_badges(inp, rep.tier, rep.trust_score)
