from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_verified_user
from app.payments.schemas import (
    CreateOrderRequest,
    CreateOrderResponse,
    PaymentRead,
    SellerEarnings,
    SettlementItem,
)
from app.payments.service import PaymentService
from app.users.models import User

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/create-order", response_model=CreateOrderResponse, status_code=201)
async def create_order(
    data: CreateOrderRequest,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = PaymentService(db)
    return await svc.create_order(current_user, data)


@router.post("/webhook", status_code=200)
async def cashfree_webhook(
    request: Request,
    x_webhook_signature: str | None = Header(None, alias="x-webhook-signature"),
    x_webhook_timestamp: str | None = Header(None, alias="x-webhook-timestamp"),
    db: Session = Depends(get_db),
):
    payload = await request.body()
    signature = x_webhook_signature or ""
    svc = PaymentService(db)
    return svc.handle_webhook(payload, signature, x_webhook_timestamp or "")


@router.get("/history", response_model=list[PaymentRead])
def get_payment_history(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = PaymentService(db)
    return svc.get_payment_history(current_user.id)


@router.get("/earnings", response_model=SellerEarnings)
def get_seller_earnings(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Marketplace earnings for the current user as a seller."""
    svc = PaymentService(db)
    return svc.get_seller_earnings(current_user.id)


@router.get("/settlements", response_model=list[SettlementItem])
def get_my_settlements(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Payout settlements the current user has received."""
    svc = PaymentService(db)
    return svc.list_settlements(current_user.id)
