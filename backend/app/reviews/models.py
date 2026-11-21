import enum
import uuid

from sqlalchemy import Enum, ForeignKey, Integer, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.db_types import UUIDType


class ReviewRole(str, enum.Enum):
    MENTOR = "mentor"
    FOUNDER = "founder"
    CONTRIBUTOR = "contributor"
    USER = "user"


class Review(Base):
    __tablename__ = "reviews"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    reviewer_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    reviewer_role: Mapped[ReviewRole] = mapped_column(
        Enum(ReviewRole, name="review_role"), nullable=False
    )
    # Scores 1-5
    overall_score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    code_quality: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    idea_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    market_potential: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    # Content
    headline: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_public: Mapped[bool] = mapped_column(default=True, nullable=False)

    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])  # type: ignore
    reviewer: Mapped["User"] = relationship("User", foreign_keys=[reviewer_id])  # type: ignore
