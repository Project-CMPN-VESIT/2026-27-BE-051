"""
College partner (faculty / placement cell) accounts.

## Scope of what an institution can see

Aggregate only. A partner sees counts, totals and their campus leaderboard
position — the same shape of data the public campus leaderboard already exposes,
scoped to their own students.

They do NOT get a roster of named students with private detail attached. The
students on this platform did not sign up to have their college given a
surveillance dashboard over them, and a faculty account that could read a
student's offers, earnings breakdown or private messages would be a serious
privacy failure dressed up as a feature. Individual student rows appear only
where that student's profile is already public.

Membership is derived from `Profile.college`, which students fill in themselves.
That means a student controls whether they are counted at all — leaving the field
blank keeps them out of their institution's aggregate entirely.
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.db_types import JsonB, UUIDType


class CollegePartner(Base):
    """An institution with a faculty/placement account on the platform."""
    __tablename__ = "college_partners"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_college_partner_user"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # Must match `Profile.college` for students to be counted. Stored normalised
    # (lowercased, trimmed) in `college_key` so "IIT Bombay" and "iit bombay"
    # resolve to the same institution.
    college_name: Mapped[str] = mapped_column(String(200), nullable=False)
    college_key: Mapped[str] = mapped_column(
        String(200), nullable=False, index=True
    )
    department: Mapped[str | None] = mapped_column(String(160), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    contact_title: Mapped[str | None] = mapped_column(String(160), nullable=True)
    website_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # An unverified partner sees nothing. Anyone can claim to be faculty at any
    # institution, so the aggregate stays locked until an admin confirms it.
    is_verified: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verified_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])  # type: ignore


class EmployerVerificationRequest(Base):
    """A recruiter asking a builder to verify a specific private repository.

    Exists because hiring signal and marketplace listing are different needs. A
    candidate's strongest work is often a private repo they have no intention of
    selling, and requiring them to list it publicly to prove it is real is a
    non-starter.

    The builder holds all the power here: the request is an ask, the repo stays
    private, and the resulting trust report is released to the recruiter only when
    the builder runs it and shares it. Nothing is verified without the builder
    initiating it with their own GitHub token.
    """
    __tablename__ = "employer_verification_requests"

    requester_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    builder_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # The recruiter names a role, not a repo — they don't know what's in the
    # builder's private account. The builder chooses which repo answers it.
    role_title: Mapped[str] = mapped_column(String(200), nullable=False)
    company: Mapped[str | None] = mapped_column(String(160), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional hint, e.g. "something with real backend work".
    looking_for: Mapped[str | None] = mapped_column(String(300), nullable=True)

    # "pending" | "fulfilled" | "declined" | "withdrawn" | "expired"
    status: Mapped[str] = mapped_column(
        String(12), default="pending", nullable=False, index=True
    )

    # ── The builder's response ───────────────────────────────────────────────
    # Filled in when the builder runs a verification against a repo of their
    # choosing. `repo_full_name` is visible to the recruiter; nothing else about
    # the account is.
    repo_full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    builder_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Full standalone trust report: score, six components, flags, evidence counts.
    # Snapshotted rather than referenced, because the repo is private and the
    # recruiter must be able to read the report without any access to it.
    report: Mapped[dict | None] = mapped_column(JsonB, nullable=True)
    verified_build_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fulfilled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Short shareable code so a report can be cited in an ATS or email thread.
    report_code: Mapped[str | None] = mapped_column(
        String(24), unique=True, index=True, nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    requester: Mapped["User"] = relationship("User", foreign_keys=[requester_id])  # type: ignore
    builder: Mapped["User"] = relationship("User", foreign_keys=[builder_id])  # type: ignore
