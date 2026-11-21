import enum
import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String, Text
from app.core.db_types import UUIDType, JsonB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PaymentType(str, enum.Enum):
    PREMIUM_LISTING = "premium_listing"
    AI_AUDIT = "ai_audit"
    STARTUP_REPORT = "startup_report"
    FEATURED_PLACEMENT = "featured_placement"
    PROJECT_ACCESS = "project_access"       # builder-set price, buyer gets project access
    RECRUITER_PRO = "recruiter_pro"         # monthly recruiter membership
    INCUBATOR_PRO = "incubator_pro"         # monthly incubator membership
    PITCH_DECK = "pitch_deck"               # AI-generated pitch deck for a project


class PaymentStatus(str, enum.Enum):
    CREATED = "created"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"


# Prices in paise (INR smallest unit)
PAYMENT_PRICES: dict[PaymentType, int] = {
    PaymentType.PREMIUM_LISTING: 49900,       # ₹499
    PaymentType.AI_AUDIT: 29900,              # ₹299
    PaymentType.STARTUP_REPORT: 99900,        # ₹999
    PaymentType.FEATURED_PLACEMENT: 149900,   # ₹1499
    PaymentType.PROJECT_ACCESS: 0,            # dynamic — set from project.price_paise
    PaymentType.RECRUITER_PRO: 199900,        # ₹1999 / month
    PaymentType.INCUBATOR_PRO: 499900,        # ₹4999 / month
    PaymentType.PITCH_DECK: 49900,            # ₹499
}


class Payment(Base):
    __tablename__ = "payments"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True, index=True
    )
    order_id: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    payment_type: Mapped[PaymentType] = mapped_column(
        Enum(PaymentType, name="payment_type"), nullable=False
    )
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    # Marketplace split (populated for PROJECT_ACCESS sales at fulfilment).
    platform_fee_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    seller_net_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status"),
        default=PaymentStatus.CREATED,
        nullable=False,
    )
    cf_payment_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cf_order_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    webhook_payload: Mapped[dict | None] = mapped_column(JsonB, nullable=True)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])  # type: ignore


class ProjectAccess(Base):
    """Records which users have purchased access to a specific project."""
    __tablename__ = "project_access"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    payment_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("payments.id", ondelete="SET NULL"), nullable=True
    )
    access_type: Mapped[str] = mapped_column(String(40), default="source_code", nullable=False)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])  # type: ignore


class PayoutTransaction(Base):
    """A settlement paid out to a seller. Recorded manually by an admin after a
    real UPI/bank transfer (no on-platform automated disbursement yet)."""
    __tablename__ = "payout_transactions"

    seller_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    method: Mapped[str] = mapped_column(String(10), default="upi", nullable=False)  # upi|bank|manual
    reference: Mapped[str | None] = mapped_column(String(120), nullable=True)  # UTR / txn ref
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="completed", nullable=False)  # completed|failed
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )

    seller: Mapped["User"] = relationship("User", foreign_keys=[seller_id])  # type: ignore


class SellerPayoutDetail(Base):
    """Seller's payout/KYC details. Captured for settlement; disbursement is
    handled out-of-band (or via Cashfree Payouts once a Payouts account is live).
    No money is held on-platform."""
    __tablename__ = "seller_payout_details"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        unique=True, nullable=False, index=True,
    )
    method: Mapped[str] = mapped_column(String(10), default="upi", nullable=False)  # "upi" | "bank"
    upi_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    account_holder_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    account_number: Mapped[str | None] = mapped_column(String(34), nullable=True)
    ifsc: Mapped[str | None] = mapped_column(String(16), nullable=True)
    pan: Mapped[str | None] = mapped_column(String(10), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])  # type: ignore
