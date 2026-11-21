"""
Team/squad project ownership with revenue splits.

## Why a new ledger table rather than extra columns on Payment

`Payment` records one buyer paying one amount, and carries exactly two derived
numbers: `platform_fee_paise` and `seller_net_paise`. There is nowhere on that
row to express "and this net was divided three ways". Overloading it would mean
either losing per-member amounts or storing a JSON blob that no earnings query
could join against.

So a sale against a team project writes one `SaleSplit` row per member. The
existing single-owner math keeps working untouched: a project with no team rows
produces no splits, and `Project.owner_id` remains the seller of record.
"""
import uuid

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.db_types import UUIDType

# Splits are stored in basis points so a three-way even split (3333/3333/3334)
# is exactly representable. Whole percentages cannot express that without
# losing a rupee somewhere, and "somewhere" is always someone's payout.
TOTAL_BPS = 10_000


class ProjectMember(Base):
    """A co-owning builder on a team project, with their agreed revenue share.

    Separate from `Collaboration`, which records *who contributed* — a
    contributor is not automatically owed money. Membership here is an explicit
    commercial agreement, so it is created deliberately by the lead owner and
    accepted by the member.
    """
    __tablename__ = "project_members"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_member"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # Basis points of the seller's net proceeds. All active members on a project
    # must sum to exactly TOTAL_BPS — enforced in the service, since a partial
    # split silently loses money.
    revenue_share_bps: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Free-text description of what they own, e.g. "Backend + infra".
    contribution: Mapped[str | None] = mapped_column(String(200), nullable=True)
    role: Mapped[str] = mapped_column(String(40), default="co-owner", nullable=False)
    # "pending" | "accepted" | "declined" | "removed"
    status: Mapped[str] = mapped_column(
        String(12), default="pending", nullable=False, index=True
    )
    # True for the project's lead owner (Project.owner_id). Exactly one per team.
    is_lead: Mapped[bool] = mapped_column(default=False, nullable=False)
    invite_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])  # type: ignore
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])  # type: ignore


class SaleSplit(Base):
    """One member's share of one sale.

    Append-only. Written at fulfilment from the split that was in force at that
    moment, so later changes to the team agreement cannot retroactively rewrite
    who was owed what for a past sale.
    """
    __tablename__ = "sale_splits"
    __table_args__ = (
        UniqueConstraint("payment_id", "user_id", name="uq_sale_split_payment_user"),
    )

    payment_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("payments.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # The share applied, frozen at sale time.
    revenue_share_bps: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)

    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])  # type: ignore
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])  # type: ignore
