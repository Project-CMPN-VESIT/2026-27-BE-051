import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from app.core.db_types import StringArray, UUIDType
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

REQUEST_STATUSES = {"open", "in_progress", "completed", "cancelled"}
APPLICATION_STATUSES = {"pending", "accepted", "rejected", "withdrawn"}


class BuildRequest(Base):
    """A paid 'build-for-me' request posted by a founder. Builders apply; the
    founder accepts one. Payment is settled off-platform (no escrow held)."""
    __tablename__ = "build_requests"

    poster_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    budget_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    skills: Mapped[list[str]] = mapped_column(StringArray, default=list, nullable=False)
    timeline_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    status: Mapped[str] = mapped_column(String(16), default="open", nullable=False, index=True)
    assigned_builder_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    poster: Mapped["User"] = relationship("User", foreign_keys=[poster_id])  # type: ignore
    applications: Mapped[list["BuildApplication"]] = relationship(
        "BuildApplication", back_populates="request", cascade="all, delete-orphan"
    )


class BuildApplication(Base):
    __tablename__ = "build_applications"
    __table_args__ = (UniqueConstraint("request_id", "builder_id", name="uq_build_app_request_builder"),)

    request_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("build_requests.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    builder_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    cover_note: Mapped[str] = mapped_column(Text, nullable=False)
    quoted_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    estimated_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="pending", nullable=False, index=True)

    request: Mapped["BuildRequest"] = relationship("BuildRequest", back_populates="applications")
    builder: Mapped["User"] = relationship("User", foreign_keys=[builder_id])  # type: ignore
