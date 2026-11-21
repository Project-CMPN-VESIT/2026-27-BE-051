import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from app.core.db_types import UUIDType
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# Plan identifiers (stored as plain strings to avoid a DB enum).
PLAN_RECRUITER_PRO = "recruiter_pro"
PLAN_INCUBATOR_PRO = "incubator_pro"
VALID_PLANS = {PLAN_RECRUITER_PRO, PLAN_INCUBATOR_PRO}


class Subscription(Base):
    """A time-boxed Pro membership. Extended on each renewal payment.

    One row per user; the `plan` reflects the most recently purchased plan.
    Both plans grant Pro benefits (currently: builder contact unlock)."""
    __tablename__ = "subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        unique=True, nullable=False, index=True,
    )
    plan: Mapped[str] = mapped_column(String(20), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("payments.id", ondelete="SET NULL"), nullable=True,
    )

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])  # type: ignore
