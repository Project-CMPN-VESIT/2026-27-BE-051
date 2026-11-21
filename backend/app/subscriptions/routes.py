import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_verified_user
from app.subscriptions.service import SubscriptionService
from app.users.models import User

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


class SubscriptionRead(BaseModel):
    plan: str | None = None
    expires_at: datetime | None = None
    is_active: bool = False


@router.get("/me", response_model=SubscriptionRead)
def get_my_subscription(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = SubscriptionService(db)
    sub = svc.get_for_user(current_user.id)
    if not sub:
        return SubscriptionRead(is_active=False)
    return SubscriptionRead(
        plan=sub.plan,
        expires_at=sub.expires_at,
        is_active=SubscriptionService.is_active(sub),
    )
