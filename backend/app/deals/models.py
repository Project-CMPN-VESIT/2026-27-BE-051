"""
Marketplace deal structures: price negotiation, portfolio bundles.

## Why purchase offers get their own table

`IncubationOffer` already models "an actor proposes terms on a project" and is
reused for the equity/revenue-share deal type (see `OfferType.REVENUE_SHARE`).
But it has no counter mechanism — `respond()` flips a status once and the offer
is done.

A price negotiation is a *chain*: ₹40k asked, ₹25k offered, ₹32k countered, and
either side can walk at any point. Modelling that as repeated single-shot offers
would lose the thread and make "show offer history on the listing" impossible to
answer correctly. So the negotiation is its own aggregate with an ordered set of
rounds, and each round records who moved and to what number.

The table it does NOT duplicate is `Payment`: an accepted offer produces a real
checkout at the agreed amount, it does not invent a parallel money rail.
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

# Plain strings rather than PG enums: these workflows will gain states, and every
# new enum label costs an ALTER TYPE migration on a live database.
OFFER_STATUSES = (
    "pending",      # awaiting the other side
    "countered",    # a counter is on the table
    "accepted",     # terms agreed; awaiting payment
    "declined",
    "withdrawn",
    "expired",
    "completed",    # paid for
)
OPEN_OFFER_STATUSES = ("pending", "countered")

ROUND_ACTIONS = ("offer", "counter", "accept", "decline", "withdraw")


class PurchaseOffer(Base):
    """A price negotiation between one buyer and one for-sale project.

    One row per buyer/project pair, carrying the *current* state. The history of
    how it got there lives in `rounds`.
    """
    __tablename__ = "purchase_offers"
    __table_args__ = (
        # One live negotiation per buyer per project. Without this a buyer could
        # open five offers and force the seller to track which is real.
        UniqueConstraint("project_id", "buyer_id", name="uq_purchase_offer_buyer"),
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

    # The list price when the negotiation opened, frozen so a seller can't raise
    # the sticker afterwards and make an old offer look insulting.
    list_price_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    # Buyer's opening number.
    initial_offer_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    # Amount currently on the table, whoever put it there.
    current_offer_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    # Who the ball is with: "buyer" | "seller".
    awaiting: Mapped[str] = mapped_column(String(8), default="seller", nullable=False)

    status: Mapped[str] = mapped_column(
        String(12), default="pending", nullable=False, index=True
    )
    buyer_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    seller_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Set on acceptance. The buyer checks out at exactly this number, and
    # `PaymentService` reads it rather than `project.price_paise`.
    agreed_price_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("payments.id", ondelete="SET NULL"), nullable=True,
    )

    # Offers go stale. An indefinite offer is a liability for a seller trying to
    # decide whether to accept a different one.
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])  # type: ignore
    buyer: Mapped["User"] = relationship("User", foreign_keys=[buyer_id])  # type: ignore
    seller: Mapped["User"] = relationship("User", foreign_keys=[seller_id])  # type: ignore
    rounds: Mapped[list["OfferRound"]] = relationship(
        "OfferRound", back_populates="offer",
        cascade="all, delete-orphan", order_by="OfferRound.sequence",
    )


class OfferRound(Base):
    """One move in a negotiation.

    Append-only. This is what makes "offer history" real rather than a guess
    reconstructed from the current amount.
    """
    __tablename__ = "offer_rounds"

    offer_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("purchase_offers.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    sequence: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # "buyer" | "seller"
    actor: Mapped[str] = mapped_column(String(8), nullable=False)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    # See ROUND_ACTIONS.
    action: Mapped[str] = mapped_column(String(10), nullable=False)
    amount_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)

    offer: Mapped["PurchaseOffer"] = relationship("PurchaseOffer", back_populates="rounds")


class ProjectBundle(Base):
    """Several of one builder's projects sold as a single portfolio listing.

    The use case is a recruiter or acquirer evaluating a body of work rather than
    one repo: three related projects at a combined price says more about a builder
    than any of them alone.

    Bundles do not duplicate project pricing. Each member project keeps its own
    listing; the bundle is an additional way to buy them together, and the
    combined price is validated against the sum so a "bundle" can never cost
    more than buying the parts.
    """
    __tablename__ = "project_bundles"

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(220), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    # Sum of member list prices at publish time, so the saving is verifiable
    # rather than a marketing claim.
    combined_list_price_paise: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    is_published: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )
    # Cached aggregate of member Verified Build Scores. Recomputed on publish and
    # on member change — never hand-set.
    average_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    highlights: Mapped[list | None] = mapped_column(JsonB, nullable=True)

    owner: Mapped["User"] = relationship("User", foreign_keys=[owner_id])  # type: ignore
    items: Mapped[list["BundleItem"]] = relationship(
        "BundleItem", back_populates="bundle",
        cascade="all, delete-orphan", order_by="BundleItem.sequence",
    )


class BundleItem(Base):
    """One project's membership in a bundle."""
    __tablename__ = "bundle_items"
    __table_args__ = (
        UniqueConstraint("bundle_id", "project_id", name="uq_bundle_item"),
    )

    bundle_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("project_bundles.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    sequence: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # Why this project is in the bundle, e.g. "Shows the data pipeline work".
    note: Mapped[str | None] = mapped_column(String(300), nullable=True)

    bundle: Mapped["ProjectBundle"] = relationship("ProjectBundle", back_populates="items")
    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])  # type: ignore
