import enum
import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.db_types import UUIDType, JsonB


class NotificationType(str, enum.Enum):
    CONTRIBUTOR_REQUEST = "contributor_request"
    REQUEST_ACCEPTED = "request_accepted"
    REQUEST_REJECTED = "request_rejected"
    PROJECT_VERIFIED = "project_verified"
    NEW_REVIEW = "new_review"
    NEW_MESSAGE = "new_message"
    PAYMENT_SUCCESS = "payment_success"
    PROJECT_ACCESS_PURCHASED = "project_access_purchased"
    SYSTEM = "system"


class Notification(Base):
    __tablename__ = "notifications"

    recipient_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, name="notification_type"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    meta: Mapped[dict | None] = mapped_column(JsonB, nullable=True)

    recipient: Mapped["User"] = relationship("User", foreign_keys=[recipient_id])  # type: ignore
