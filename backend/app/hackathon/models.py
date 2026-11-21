import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.db_types import UUIDType, JsonB


class HackathonClaimStatus(str, enum.Enum):
    PENDING = "pending"        # created, not yet analysed
    ANALYZED = "analyzed"      # engine ran, awaiting admin decision
    VERIFIED = "verified"      # admin confirmed authentic
    REJECTED = "rejected"      # admin rejected
    FLAGGED = "flagged"        # engine flagged as suspicious


class HackathonPlatform(str, enum.Enum):
    DEVFOLIO = "devfolio"
    UNSTOP = "unstop"
    MLH = "mlh"
    OTHER = "other"


class HackathonClaim(Base):
    __tablename__ = "hackathon_claims"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        unique=True, nullable=False, index=True,
    )
    claimed_by_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )

    event_name: Mapped[str] = mapped_column(String(200), nullable=False)
    event_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    platform: Mapped[HackathonPlatform] = mapped_column(
        Enum(HackathonPlatform, name="hackathon_platform"),
        default=HackathonPlatform.OTHER, nullable=False,
    )
    event_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    event_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    proof_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[HackathonClaimStatus] = mapped_column(
        Enum(HackathonClaimStatus, name="hackathon_claim_status"),
        default=HackathonClaimStatus.PENDING, nullable=False, index=True,
    )
    authenticity_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    verdict: Mapped[str | None] = mapped_column(String(30), nullable=True)
    signals: Mapped[dict | None] = mapped_column(JsonB, nullable=True)
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)

    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])  # type: ignore
