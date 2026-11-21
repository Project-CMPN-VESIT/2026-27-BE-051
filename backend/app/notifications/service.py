import uuid
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.notifications.models import Notification, NotificationType


class NotificationService:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        recipient_id: uuid.UUID,
        type: NotificationType,
        title: str,
        body: str | None = None,
        link: str | None = None,
        meta: dict | None = None,
    ) -> Notification:
        n = Notification(
            recipient_id=recipient_id,
            type=type,
            title=title,
            body=body,
            link=link,
            meta=meta,
        )
        self.db.add(n)
        self.db.flush()
        return n

    def list_for_user(
        self, user_id: uuid.UUID, unread_only: bool = False, limit: int = 30
    ) -> list[Notification]:
        q = self.db.query(Notification).filter(Notification.recipient_id == user_id)
        if unread_only:
            q = q.filter(Notification.is_read == False)
        return q.order_by(desc(Notification.created_at)).limit(limit).all()

    def unread_count(self, user_id: uuid.UUID) -> int:
        return (
            self.db.query(Notification)
            .filter(Notification.recipient_id == user_id, Notification.is_read == False)
            .count()
        )

    def mark_read(self, notification_id: uuid.UUID, user_id: uuid.UUID) -> None:
        n = (
            self.db.query(Notification)
            .filter(Notification.id == notification_id, Notification.recipient_id == user_id)
            .first()
        )
        if n:
            n.is_read = True
            self.db.flush()

    def mark_all_read(self, user_id: uuid.UUID) -> None:
        self.db.query(Notification).filter(
            Notification.recipient_id == user_id, Notification.is_read == False
        ).update({"is_read": True})
        self.db.flush()

    def delete(self, notification_id: uuid.UUID, user_id: uuid.UUID) -> None:
        self.db.query(Notification).filter(
            Notification.id == notification_id, Notification.recipient_id == user_id
        ).delete()
        self.db.flush()
