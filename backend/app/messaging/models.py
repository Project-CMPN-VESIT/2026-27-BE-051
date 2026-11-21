import enum
import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.db_types import UUIDType


class Thread(Base):
    """A conversation thread between two users, optionally about a project."""
    __tablename__ = "message_threads"

    participant_a: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    participant_b: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    subject: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    messages: Mapped[list["Message"]] = relationship(
        "Message", back_populates="thread", cascade="all, delete-orphan",
        order_by="Message.created_at"
    )
    user_a: Mapped["User"] = relationship("User", foreign_keys=[participant_a])  # type: ignore
    user_b: Mapped["User"] = relationship("User", foreign_keys=[participant_b])  # type: ignore


class Message(Base):
    __tablename__ = "messages"

    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("message_threads.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    thread: Mapped["Thread"] = relationship("Thread", back_populates="messages")
    sender: Mapped["User"] = relationship("User", foreign_keys=[sender_id])  # type: ignore
