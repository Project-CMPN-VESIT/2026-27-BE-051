"""
Models backing the growth surfaces: score history, project views, saved searches
and shortlists.

These are deliberately append-only or user-scoped — none of them feed back into
scoring or reputation, so a bug here cannot corrupt a trust claim.
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, SmallInteger, String, Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.db_types import JsonB, UUIDType


class ScoreSnapshot(Base):
    """A point-in-time record of a project's Verified Build Score.

    Append-only: one row per verification run, never updated. That is what makes
    the trend graph on a profile evidence rather than decoration — the history
    cannot be rewritten to look better than it was.
    """
    __tablename__ = "score_snapshots"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    verified_build_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    confidence: Mapped[str | None] = mapped_column(String(16), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Component scores at the time, so a drop can be attributed to a cause.
    components: Mapped[dict | None] = mapped_column(JsonB, nullable=True)
    fraud_flags: Mapped[list | None] = mapped_column(JsonB, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )


class ProjectView(Base):
    """An aggregated daily view count for a project.

    Stored as a per-day counter rather than one row per hit: a demo does not need
    per-request analytics, and an unbounded event table would be the largest in
    the database within a week for no added insight.

    Viewer identity is not recorded. A coarse `viewer_kind` distinguishes an owner
    previewing their own listing from genuine outside interest, which is the only
    distinction the dashboard actually needs.
    """
    __tablename__ = "project_views"
    __table_args__ = (
        UniqueConstraint("project_id", "day", "viewer_kind", name="uq_project_view_day"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # ISO date (YYYY-MM-DD). A string keeps the unique constraint portable
    # between Postgres and the SQLite used in tests.
    day: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    # "anonymous" | "member" | "owner"
    viewer_kind: Mapped[str] = mapped_column(String(12), default="anonymous", nullable=False)
    count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class SavedSearch(Base):
    """A stored discovery query for recruiters and incubators.

    `filters` holds the same parameters the project list endpoint accepts, so a
    saved search is replayable through the normal search path rather than needing
    a parallel query implementation.
    """
    __tablename__ = "saved_searches"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    filters: Mapped[dict] = mapped_column(JsonB, nullable=False)
    # When true, new matches raise a notification.
    alerts_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # High-water mark so an alert reports only genuinely new matches.
    last_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_match_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class MentorProfile(Base):
    """A human mentor offering guidance sessions.

    Separate from `User.role == MENTOR` because being a mentor on the platform is
    an opt-in listing with its own availability and focus areas, not just a
    permission level.
    """
    __tablename__ = "mentor_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        unique=True, nullable=False, index=True,
    )
    headline: Mapped[str] = mapped_column(String(160), nullable=False)
    bio: Mapped[str] = mapped_column(Text, nullable=False)
    # What they can actually help with, e.g. ["architecture", "fundraising"].
    focus_areas: Mapped[list | None] = mapped_column(JsonB, nullable=True)
    years_experience: Mapped[int | None] = mapped_column(Integer, nullable=True)
    company: Mapped[str | None] = mapped_column(String(160), nullable=True)
    # Free sessions are the norm here; a rate of 0 or NULL means no charge.
    rate_paise_per_hour: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_accepting: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    sessions_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])  # type: ignore


class MentorSession(Base):
    """A request from a builder to a mentor.

    Deliberately has no scheduling infrastructure — a request/accept handshake
    plus an agreed note is enough to be genuinely useful, and inventing a
    calendar system would add a lot of surface for very little.
    """
    __tablename__ = "mentor_sessions"

    mentor_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    builder_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    topic: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    # pending | accepted | declined | completed | cancelled
    status: Mapped[str] = mapped_column(String(12), default="pending", nullable=False, index=True)
    mentor_reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    mentor: Mapped["User"] = relationship("User", foreign_keys=[mentor_id])  # type: ignore
    builder: Mapped["User"] = relationship("User", foreign_keys=[builder_id])  # type: ignore


class MentorChatMessage(Base):
    """One turn in the AI mentor conversation for a project.

    Persisted so the conversation survives a reload and so the model can be given
    real prior context instead of restarting cold every question.
    """
    __tablename__ = "mentor_chat_messages"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    role: Mapped[str] = mapped_column(String(10), nullable=False)  # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)


class ShortlistEntry(Base):
    """A project a recruiter or incubator has set aside, with a private note."""
    __tablename__ = "shortlist_entries"
    __table_args__ = (
        UniqueConstraint("user_id", "project_id", name="uq_shortlist_user_project"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # Private to the owner of the shortlist; never exposed to the builder.
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Free-form stage label, e.g. "screening", "contacted", "offer".
    stage: Mapped[str | None] = mapped_column(String(40), nullable=True)

    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])  # type: ignore


class BuilderActivity(Base):
    """A builder's commit-day history, and the streak derived from it.

    ## Why the raw days are stored

    A streak counter that is just an integer is unfalsifiable — nobody can check
    it, and nothing stops it being wrong forever. Storing the distinct UTC dates
    the builder committed on means the streak is recomputed from evidence every
    time, and a reader can be shown the underlying calendar.

    Dates only, deduplicated: two commits on one day are one day of activity.
    That keeps the array small (a year of daily work is 365 short strings) and
    matches how the scored `activity_consistency` component already reasons.
    """
    __tablename__ = "builder_activity"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        unique=True, nullable=False, index=True,
    )
    # Sorted list of ISO dates ("2026-08-14") the builder committed on, across
    # all their projects.
    activity_days: Mapped[list | None] = mapped_column(JsonB, nullable=True)
    # Derived, cached for cheap reads. Always recomputed from activity_days.
    current_streak_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    longest_streak_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_active_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_active_on: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Milestone thresholds reached, e.g. [7, 30]. Stored rather than derived from
    # `longest_streak_days` so an earned badge is never silently revoked when a
    # later recompute reads a shorter window of history.
    milestones: Mapped[list | None] = mapped_column(JsonB, nullable=True)
    computed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])  # type: ignore
