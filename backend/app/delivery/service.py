"""Gathers a builder's delivery history from escrow data and runs the engine."""
import uuid

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.delivery.engine import DeliverySignals, DeliveryPrediction, predict
from app.users.models import BuilderReputation, User


class DeliveryService:
    def __init__(self, db: Session):
        self.db = db

    def gather(self, builder_id: uuid.UUID) -> DeliverySignals:
        from app.escrow.models import EscrowContract, Milestone

        # Milestones the builder actually worked (submitted at least once).
        milestones = (
            self.db.query(Milestone)
            .join(EscrowContract, Milestone.contract_id == EscrowContract.id)
            .filter(
                EscrowContract.builder_id == builder_id,
                Milestone.submitted_at.isnot(None),
            )
            .all()
        )

        with_deadline = 0
        on_time = 0
        turnarounds: list[float] = []
        for m in milestones:
            if m.submitted_at and m.created_at:
                turnarounds.append(max(0.0, (m.submitted_at - m.created_at).total_seconds() / 86400))
            if m.due_date and m.submitted_at:
                with_deadline += 1
                if m.submitted_at <= m.due_date:
                    on_time += 1

        avg_turnaround = sum(turnarounds) / len(turnarounds) if turnarounds else None

        rep = (
            self.db.query(BuilderReputation)
            .filter(BuilderReputation.user_id == builder_id)
            .first()
        )
        delivery_rate = None
        trust_score = 0
        avg_build_score = None
        contracts_completed = 0
        if rep:
            trust_score = rep.trust_score
            avg_build_score = rep.avg_build_score
            contracts_completed = rep.contracts_completed
            if rep.contracts_total > 0:
                delivery_rate = rep.contracts_completed / rep.contracts_total

        return DeliverySignals(
            milestones_with_deadline=with_deadline,
            on_time_count=on_time,
            avg_turnaround_days=avg_turnaround,
            contracts_completed=contracts_completed,
            delivery_rate=delivery_rate,
            trust_score=trust_score,
            avg_build_score=avg_build_score,
        )

    def predict_for(self, builder_id: uuid.UUID, promised_days: int, milestone_count: int = 1) -> DeliveryPrediction:
        builder = self.db.get(User, builder_id)
        if not builder or not builder.is_active:
            raise NotFoundError("Builder")
        if promised_days < 1 or promised_days > 365:
            raise ValidationError("promised_days must be between 1 and 365")
        signals = self.gather(builder_id)
        return predict(signals, promised_days, milestone_count)

    def stats_for(self, builder_id: uuid.UUID) -> dict:
        builder = self.db.get(User, builder_id)
        if not builder or not builder.is_active:
            raise NotFoundError("Builder")
        s = self.gather(builder_id)
        on_time_rate = (s.on_time_count / s.milestones_with_deadline) if s.milestones_with_deadline else None
        return {
            "builder_id": builder_id,
            "milestones_tracked": s.milestones_with_deadline,
            "on_time_rate": on_time_rate,
            "avg_turnaround_days": s.avg_turnaround_days,
            "contracts_completed": s.contracts_completed,
            "sample_size": s.milestones_with_deadline + s.contracts_completed,
        }
