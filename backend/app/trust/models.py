"""
Models that deepen the trust story: purchase-time trust receipts, duplicate/
plagiarism flags, and the monitored-project register behind the health trend.

The organising principle: a trust claim is only worth anything if it is
falsifiable later. So everything here is append-only or immutable-after-write.
A receipt that can be edited after a dispute opens is not evidence.
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


class TrustReceipt(Base):
    """An immutable snapshot of a project's verification state at the exact
    moment money changed hands.

    Why this exists: the Verified Build Score is a live number. It moves as the
    repo moves. That is correct for discovery and useless for a dispute — six
    weeks after a sale, neither party can prove what the buyer was actually
    shown. This row freezes it.

    Nothing here is recomputed. Every field is copied at fulfilment and then
    left alone, which is why `payment_id` is unique: a replayed Cashfree webhook
    must not be able to overwrite a receipt with a newer score.
    """
    __tablename__ = "trust_receipts"
    __table_args__ = (
        UniqueConstraint("payment_id", name="uq_trust_receipt_payment"),
    )

    payment_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("payments.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    buyer_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    seller_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Short human-quotable identifier, e.g. "TR-4F9A21C0". Printed on the
    # receipt so a buyer can cite it in a dispute without pasting a UUID.
    receipt_code: Mapped[str] = mapped_column(
        String(24), unique=True, index=True, nullable=False
    )

    # ── Frozen commercial terms ───────────────────────────────────────────────
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    platform_fee_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    seller_net_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sale_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Text, not a bounded String: this mirrors `Project.sale_license`, which is
    # Text and routinely holds a full licence paragraph. A VARCHAR(80) here
    # truncated nothing on SQLite (which ignores length limits) but raised
    # StringDataRightTruncation on Postgres — a receipt must copy the licence
    # verbatim or it is not a record of what the buyer agreed to.
    sale_license: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Frozen trust state ────────────────────────────────────────────────────
    verified_build_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    was_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    confidence: Mapped[str | None] = mapped_column(String(16), nullable=True)
    ownership_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    hackathon_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Full six-component breakdown: {"repo_maturity": 82, ...}
    components: Mapped[dict | None] = mapped_column(JsonB, nullable=True)
    fraud_flags: Mapped[list | None] = mapped_column(JsonB, nullable=True)
    commits_analyzed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    contributors_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    repo_age_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ── Frozen repo facts, so "it had tests when I bought it" is checkable ────
    repo_full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    project_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    stars: Mapped[int | None] = mapped_column(Integer, nullable=True)
    github_pushed_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Whitelisted subset of ProjectAnalysis.repo_signals.
    code_signals: Mapped[dict | None] = mapped_column(JsonB, nullable=True)
    # Risk band at purchase time, so a later "this was always broken" claim
    # can be checked against what the platform actually disclosed.
    risk_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    risk_band: Mapped[str | None] = mapped_column(String(16), nullable=True)

    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )

    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])  # type: ignore
    payment: Mapped["Payment"] = relationship("Payment", foreign_keys=[payment_id])  # type: ignore


class MonitoredProject(Base):
    """Register of projects under post-purchase health monitoring.

    A buyer's interest in a repo does not end at checkout — the thing they paid
    for can rot. This row is what makes the weekly rescore targeted instead of
    rescoring the whole catalogue.

    The trend itself is NOT stored here. It is read from `score_snapshots`,
    which the verification engine already appends to on every run. Adding a
    second history table would create two sources of truth for the same claim.
    """
    __tablename__ = "monitored_projects"
    __table_args__ = (
        UniqueConstraint("project_id", "watcher_id", name="uq_monitor_project_watcher"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # The buyer who is owed the trend. Monitoring is per-buyer because it starts
    # at their purchase date, not at the project's creation.
    watcher_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    trust_receipt_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("trust_receipts.id", ondelete="SET NULL"), nullable=True,
    )
    # Score at purchase — the baseline every later reading is compared against.
    baseline_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Set when a rescore crosses a materiality threshold, so the buyer is told
    # once rather than nagged every week about the same 2-point drift.
    last_alerted_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])  # type: ignore


class DuplicateFlagStatus(str):
    """Plain string states — see `DUPLICATE_FLAG_STATUSES`.

    Deliberately not a DB enum: this is a moderation workflow that will grow
    states, and every new PG enum label needs an ALTER TYPE migration.
    """


DUPLICATE_FLAG_STATUSES = ("pending", "confirmed", "dismissed")


class DuplicateFlag(Base):
    """A suspected substantial overlap between a newly imported project and an
    existing listing.

    Raised automatically at import. Never auto-rejects a project: a false
    positive that silently blocks a legitimate builder is far more damaging than
    a duplicate sitting in a review queue for a day, so this only gates the
    listing's *marketplace visibility* and routes to an admin.
    """
    __tablename__ = "duplicate_flags"
    __table_args__ = (
        UniqueConstraint("project_id", "matched_project_id", name="uq_duplicate_pair"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    matched_project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # 0-100. How much of the two listings look like the same work.
    similarity: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    # Which checks fired: [{"signal": "title_overlap", "detail": "...", "weight": 30}]
    signals: Mapped[list | None] = mapped_column(JsonB, nullable=True)
    status: Mapped[str] = mapped_column(
        String(12), default="pending", nullable=False, index=True
    )
    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])  # type: ignore
    matched_project: Mapped["Project"] = relationship(
        "Project", foreign_keys=[matched_project_id]
    )  # type: ignore
