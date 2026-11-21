"""
Escrow + milestone domain.

Money flow (all amounts in paise, INR smallest unit):

    client funds contract  ─▶ funds held in escrow (EscrowContract.status = ACTIVE)
    builder submits proof  ─▶ Milestone.SUBMITTED
    client approves        ─▶ Milestone.APPROVED
    platform releases      ─▶ builder net = amount - commission ; Milestone.RELEASED
    all milestones released─▶ EscrowContract.COMPLETED

Disputes branch off from a submitted/approved milestone and are resolved by an
admin (release to builder, refund to client, or split).

Actual bank disbursement to the builder is NOT implemented. There is no Cashfree
Payouts (or equivalent) integration in this codebase. "Release" means: the ledger
records the net amount as owed to the builder and the milestone moves to RELEASED.
The transfer itself happens out of band.

Consequences worth knowing before enabling this with live keys:

  * Milestone.payout_reference stays NULL until a real transfer is made. A
    RELEASED milestone with a NULL reference is money still owed — that set is
    effectively the outstanding payout queue.
  * Escrow funding is refused in production unless settings.escrow_manual_settlement
    is true, so the platform cannot collect client funds it has no way to disburse.

The escrow accounting is authoritative; a payout rail can be wired on top.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.db_types import UUIDType


class EscrowContractStatus(str, enum.Enum):
    DRAFT = "draft"                  # being defined by client/builder
    AWAITING_FUNDING = "awaiting_funding"  # proposed; waiting for client to fund
    ACTIVE = "active"               # funded; work in progress
    COMPLETED = "completed"         # all milestones released
    DISPUTED = "disputed"           # at least one open dispute
    CANCELLED = "cancelled"         # cancelled before funding
    REFUNDED = "refunded"           # funds returned to client


class MilestoneStatus(str, enum.Enum):
    PENDING = "pending"       # defined, not yet funded
    FUNDED = "funded"         # money held in escrow for this milestone
    SUBMITTED = "submitted"   # builder submitted proof of work
    APPROVED = "approved"     # client approved; awaiting release
    RELEASED = "released"     # funds released to builder
    REJECTED = "rejected"     # client rejected submission
    DISPUTED = "disputed"     # under dispute


class EscrowEntryType(str, enum.Enum):
    FUND = "fund"             # client -> escrow
    RELEASE = "release"       # escrow -> builder (net)
    COMMISSION = "commission" # escrow -> platform
    REFUND = "refund"         # escrow -> client


class DisputeStatus(str, enum.Enum):
    OPEN = "open"
    RESOLVED_RELEASE = "resolved_release"   # funds went to builder
    RESOLVED_REFUND = "resolved_refund"     # funds returned to client
    RESOLVED_SPLIT = "resolved_split"       # split between parties


class EscrowContract(Base):
    __tablename__ = "escrow_contracts"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    builder_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    total_amount_paise: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    # Platform commission in basis points (1000 = 10%).
    commission_bps: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)

    status: Mapped[EscrowContractStatus] = mapped_column(
        Enum(EscrowContractStatus, name="escrow_contract_status"),
        default=EscrowContractStatus.DRAFT,
        nullable=False,
        index=True,
    )

    # Cashfree funding order
    cf_order_id: Mapped[str | None] = mapped_column(String(100), unique=True, index=True, nullable=True)
    cf_order_token: Mapped[str | None] = mapped_column(Text, nullable=True)

    funded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    client: Mapped["User"] = relationship("User", foreign_keys=[client_id])  # type: ignore
    builder: Mapped["User"] = relationship("User", foreign_keys=[builder_id])  # type: ignore
    milestones: Mapped[list["Milestone"]] = relationship(
        "Milestone", back_populates="contract",
        cascade="all, delete-orphan", order_by="Milestone.sequence",
    )
    ledger_entries: Mapped[list["EscrowLedgerEntry"]] = relationship(
        "EscrowLedgerEntry", back_populates="contract", cascade="all, delete-orphan"
    )
    disputes: Mapped[list["Dispute"]] = relationship(
        "Dispute", back_populates="contract", cascade="all, delete-orphan"
    )


class Milestone(Base):
    __tablename__ = "escrow_milestones"

    contract_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("escrow_contracts.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)

    status: Mapped[MilestoneStatus] = mapped_column(
        Enum(MilestoneStatus, name="milestone_status"),
        default=MilestoneStatus.PENDING,
        nullable=False,
        index=True,
    )

    proof_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    proof_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payout_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)

    contract: Mapped["EscrowContract"] = relationship("EscrowContract", back_populates="milestones")


class EscrowLedgerEntry(Base):
    __tablename__ = "escrow_ledger_entries"

    contract_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("escrow_contracts.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    milestone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("escrow_milestones.id", ondelete="SET NULL"), nullable=True
    )
    entry_type: Mapped[EscrowEntryType] = mapped_column(
        Enum(EscrowEntryType, name="escrow_entry_type"), nullable=False
    )
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    contract: Mapped["EscrowContract"] = relationship("EscrowContract", back_populates="ledger_entries")


class Dispute(Base):
    __tablename__ = "escrow_disputes"

    contract_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("escrow_contracts.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    milestone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("escrow_milestones.id", ondelete="SET NULL"), nullable=True
    )
    raised_by_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional citation of the trust receipt issued at purchase. Escrow contracts
    # and marketplace sales are separate rails, so this is evidence a party chose
    # to attach, not an enforced parent — hence nullable with SET NULL.
    trust_receipt_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("trust_receipts.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[DisputeStatus] = mapped_column(
        Enum(DisputeStatus, name="dispute_status"),
        default=DisputeStatus.OPEN,
        nullable=False,
        index=True,
    )
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolver_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    contract: Mapped["EscrowContract"] = relationship("EscrowContract", back_populates="disputes")
