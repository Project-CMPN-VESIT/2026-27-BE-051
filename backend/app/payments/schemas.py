import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.payments.models import PaymentStatus, PaymentType


class CreateOrderRequest(BaseModel):
    payment_type: PaymentType
    project_id: uuid.UUID | None = None


class CreateOrderResponse(BaseModel):
    order_id: str
    cf_order_token: str
    amount_paise: int
    currency: str
    payment_type: PaymentType


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    order_id: str
    payment_type: PaymentType
    amount_paise: int
    currency: str
    status: PaymentStatus
    created_at: datetime


class SaleItem(BaseModel):
    """A single completed project sale from the seller's perspective."""
    payment_id: uuid.UUID
    project_id: uuid.UUID | None
    project_title: str
    buyer_name: str
    amount_paise: int
    platform_fee_paise: int
    seller_net_paise: int
    created_at: datetime


class SellerEarnings(BaseModel):
    """Aggregated marketplace earnings for a seller."""
    total_sales: int
    gross_paise: int
    platform_fee_paise: int
    net_paise: int
    # Amount already settled (paid out) to the seller.
    settled_paise: int
    # net - settled (never negative): the amount still owed to the seller.
    pending_payout_paise: int
    payout_configured: bool
    payout_verified: bool
    sales: list[SaleItem]


class SettlementItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    amount_paise: int
    method: str
    reference: str | None
    note: str | None
    status: str
    created_at: datetime


class SettlementCreate(BaseModel):
    amount_paise: int = Field(..., ge=100)
    method: str = Field("upi", pattern="^(upi|bank|manual)$")
    reference: str | None = Field(None, max_length=120)
    note: str | None = Field(None, max_length=500)
