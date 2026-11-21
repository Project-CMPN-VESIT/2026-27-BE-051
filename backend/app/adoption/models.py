import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from app.core.db_types import UUIDType
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

ADOPTION_STATUSES = {"pending", "approved", "rejected", "withdrawn"}


class AdoptionRequest(Base):
    """A request to take over a dormant/abandoned project and continue it.

    On approval, project ownership transfers to the requester and the previous
    owner is retained as a collaborator (so their contribution history stays).
    """
    __tablename__ = "adoption_requests"
    __table_args__ = (
        UniqueConstraint("project_id", "requester_id", name="uq_adoption_project_requester"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    requester_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # Why they want it and how they'll continue it.
    message: Mapped[str] = mapped_column(Text, nullable=False)
    continuation_plan: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(12), default="pending", nullable=False, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])  # type: ignore
    requester: Mapped["User"] = relationship("User", foreign_keys=[requester_id])  # type: ignore
