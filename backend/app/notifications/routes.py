import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_verified_user
from app.notifications.models import NotificationType
from app.notifications.service import NotificationService
from app.users.models import User


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    type: NotificationType
    title: str
    body: str | None
    link: str | None
    is_read: bool
    created_at: datetime


class UnreadCountResponse(BaseModel):
    count: int


router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationRead])
def list_notifications(
    unread_only: bool = False,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = NotificationService(db)
    return svc.list_for_user(current_user.id, unread_only=unread_only)


@router.get("/unread-count", response_model=UnreadCountResponse)
def unread_count(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = NotificationService(db)
    return {"count": svc.unread_count(current_user.id)}


@router.put("/{notification_id}/read", status_code=204)
def mark_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = NotificationService(db)
    svc.mark_read(notification_id, current_user.id)
    db.commit()


@router.put("/mark-all-read", status_code=204)
def mark_all_read(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = NotificationService(db)
    svc.mark_all_read(current_user.id)
    db.commit()


@router.delete("/{notification_id}", status_code=204)
def delete_notification(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = NotificationService(db)
    svc.delete(notification_id, current_user.id)
    db.commit()
