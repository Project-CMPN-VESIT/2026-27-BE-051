import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.db_types import UUIDType


class OfferType(str, enum.Enum):
    INCUBATION = "incubation"     # join an incubator program
    MENTORSHIP = "mentorship"     # mentor guidance
    FUNDING = "funding"           # capital for equity
    ACQUISITION = "acquisition"   # buy the project/company
    # Capital (or work) in exchange for a cut of future revenue rather than
    # equity. Reuses this table because it is the same shape of deal — an
    # investor proposing terms on a project — and differs only in what is
    # promised back. A parallel table would duplicate the entire
    # create/respond/withdraw lifecycle to change one field.
    REVENUE_SHARE = "revenue_share"


class OfferStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    WITHDRAWN = "withdrawn"


class IncubationOffer(Base):
    __tablename__ = "incubation_offers"

    incubator_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    offer_type: Mapped[OfferType] = mapped_column(
        Enum(OfferType, name="incubation_offer_type"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    # Optional commercial terms
    amount_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    equity_percent: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0-100
    # Revenue share in basis points (500 = 5%). Basis points rather than reusing
    # `equity_percent` because revenue deals are routinely written at fractional
    # percentages — "2.5% of gross" is not expressible in whole percent, and
    # rounding someone's cut is not an acceptable modelling shortcut.
    revenue_share_bps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # How long the revenue share runs. An open-ended claim on a student's future
    # income is not a deal anyone should be able to propose by accident.
    revenue_share_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Ceiling on total repayment, expressed as a multiple of the amount advanced
    # (250 = 2.5x). Standard in revenue-based financing and the thing a founder
    # most needs to see before signing.
    revenue_share_cap_bps: Mapped[int | None] = mapped_column(Integer, nullable=True)

    status: Mapped[OfferStatus] = mapped_column(
        Enum(OfferStatus, name="incubation_offer_status"),
        default=OfferStatus.PENDING, nullable=False, index=True,
    )
    response_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(nullable=True)

    incubator: Mapped["User"] = relationship("User", foreign_keys=[incubator_id])  # type: ignore
    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])  # type: ignore
