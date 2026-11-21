import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.dependencies import get_current_verified_user
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.messaging.models import Message, Thread
from app.notifications.models import NotificationType
from app.notifications.service import NotificationService
from app.users.models import User


# ── Schemas ───────────────────────────────────────────────────────────────────

class ThreadCreate(BaseModel):
    recipient_id: uuid.UUID
    project_id: uuid.UUID | None = None
    subject: str | None = Field(None, max_length=200)
    first_message: str = Field(..., min_length=1, max_length=3000)


class MessageCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=3000)


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    thread_id: uuid.UUID
    sender_id: uuid.UUID
    body: str
    is_read: bool
    created_at: datetime


class ThreadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    participant_a: uuid.UUID
    participant_b: uuid.UUID
    project_id: uuid.UUID | None
    subject: str | None
    created_at: datetime
    messages: list[MessageRead] = []


# ── Router ────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/messages", tags=["messaging"])


def _get_thread(thread_id: uuid.UUID, user_id: uuid.UUID, db: Session) -> Thread:
    t = db.query(Thread).filter(Thread.id == thread_id).first()
    if not t:
        raise NotFoundError("Thread")
    if t.participant_a != user_id and t.participant_b != user_id:
        raise ForbiddenError("Not a participant in this thread")
    return t


@router.get("", response_model=list[ThreadRead])
def list_threads(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Thread)
        .filter(
            or_(Thread.participant_a == current_user.id, Thread.participant_b == current_user.id),
            Thread.is_archived == False,
        )
        .options(joinedload(Thread.messages))
        .order_by(desc(Thread.updated_at))
        .all()
    )


@router.post("", response_model=ThreadRead, status_code=201)
def start_thread(
    data: ThreadCreate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    if data.recipient_id == current_user.id:
        raise ValidationError("Cannot message yourself")

    recipient = db.get(User, data.recipient_id)
    if not recipient:
        raise NotFoundError("User")

    # Check no existing open thread between these two about same project
    existing = db.query(Thread).filter(
        or_(
            (Thread.participant_a == current_user.id) & (Thread.participant_b == data.recipient_id),
            (Thread.participant_a == data.recipient_id) & (Thread.participant_b == current_user.id),
        ),
        Thread.project_id == data.project_id,
        Thread.is_archived == False,
    ).first()
    if existing:
        # Add message to existing thread instead
        msg = Message(thread_id=existing.id, sender_id=current_user.id, body=data.first_message)
        db.add(msg)
        db.commit()
        db.refresh(existing)
        return existing

    thread = Thread(
        participant_a=current_user.id,
        participant_b=data.recipient_id,
        project_id=data.project_id,
        subject=data.subject,
    )
    db.add(thread)
    db.flush()

    msg = Message(thread_id=thread.id, sender_id=current_user.id, body=data.first_message)
    db.add(msg)

    # Notify recipient
    svc = NotificationService(db)
    sender_name = current_user.profile.display_name if current_user.profile else "Someone"
    svc.create(
        recipient_id=data.recipient_id,
        type=NotificationType.NEW_MESSAGE,
        title=f"New message from {sender_name}",
        body=data.first_message[:100],
        link="/messages",
    )

    db.commit()
    db.refresh(thread)
    return thread


@router.get("/{thread_id}", response_model=ThreadRead)
def get_thread(
    thread_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    thread = _get_thread(thread_id, current_user.id, db)
    # Mark messages as read
    for msg in thread.messages:
        if msg.sender_id != current_user.id and not msg.is_read:
            msg.is_read = True
    db.commit()
    return thread


@router.post("/{thread_id}/messages", response_model=MessageRead, status_code=201)
def send_message(
    thread_id: uuid.UUID,
    data: MessageCreate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    thread = _get_thread(thread_id, current_user.id, db)
    msg = Message(thread_id=thread.id, sender_id=current_user.id, body=data.body)
    db.add(msg)

    # Notify the other participant
    other_id = thread.participant_b if thread.participant_a == current_user.id else thread.participant_a
    svc = NotificationService(db)
    sender_name = current_user.profile.display_name if current_user.profile else "Someone"
    svc.create(
        recipient_id=other_id,
        type=NotificationType.NEW_MESSAGE,
        title=f"New message from {sender_name}",
        body=data.body[:100],
        link="/messages",
    )

    db.commit()
    db.refresh(msg)
    return msg
