import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from app.core.db_types import UUIDType
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# Report reasons (project-focused, but the model is generic).
REPORT_REASONS = {
    "plagiarism",
    "copied_repo",
    "fake_hackathon",
    "spam",
    "misleading",
    "inappropriate",
    "other",
}

REPORT_STATUSES = {"open", "resolved", "dismissed"}
REPORT_ACTIONS = {"none", "remove_target", "ban_owner"}


class Report(Base):
    """A user-submitted report against a target (currently projects)."""
    __tablename__ = "reports"

    reporter_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    target_type: Mapped[str] = mapped_column(String(20), default="project", nullable=False, index=True)
    target_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(String(30), nullable=False)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(12), default="open", nullable=False, index=True)
    action_taken: Mapped[str | None] = mapped_column(String(20), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    reporter: Mapped["User"] = relationship("User", foreign_keys=[reporter_id])  # type: ignore
