import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.subscriptions.models import Subscription

settings = get_settings()


class SubscriptionService:
    def __init__(self, db: Session):
        self.db = db

    def get_for_user(self, user_id: uuid.UUID) -> Subscription | None:
        return (
            self.db.query(Subscription)
            .filter(Subscription.user_id == user_id)
            .first()
        )

    @staticmethod
    def is_active(sub: Subscription | None) -> bool:
        if not sub:
            return False
        expires = sub.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return expires > datetime.now(timezone.utc)

    def has_active(self, user_id: uuid.UUID) -> bool:
        return self.is_active(self.get_for_user(user_id))

    def grant_or_extend(
        self,
        user_id: uuid.UUID,
        plan: str,
        payment_id: uuid.UUID | None = None,
        days: int | None = None,
    ) -> Subscription:
        """Create a subscription or extend an active one by `days`.

        If the current subscription is still active, the new period stacks onto
        the existing expiry; otherwise it starts now.
        """
        days = days or settings.subscription_days
        now = datetime.now(timezone.utc)
        sub = self.get_for_user(user_id)
        if sub:
            base = sub.expires_at
            if base.tzinfo is None:
                base = base.replace(tzinfo=timezone.utc)
            start = base if base > now else now
            sub.expires_at = start + timedelta(days=days)
            sub.plan = plan
            if payment_id:
                sub.payment_id = payment_id
        else:
            sub = Subscription(
                user_id=user_id,
                plan=plan,
                expires_at=now + timedelta(days=days),
                payment_id=payment_id,
            )
            self.db.add(sub)
        self.db.flush()
        return sub
