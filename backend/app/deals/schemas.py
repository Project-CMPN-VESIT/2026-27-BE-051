import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ── Purchase offers ───────────────────────────────────────────────────────────

class OfferRoundRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sequence: int
    actor: str
    action: str
    amount_paise: int | None = None
    message: str | None = None
    created_at: datetime


class PurchaseOfferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    buyer_id: uuid.UUID
    seller_id: uuid.UUID
    list_price_paise: int
    initial_offer_paise: int
    current_offer_paise: int
    awaiting: str
    status: str
    buyer_message: str | None = None
    seller_message: str | None = None
    agreed_price_paise: int | None = None
    expires_at: datetime | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    rounds: list[OfferRoundRead] = Field(default_factory=list)

    # Denormalised for display.
    project_title: str | None = None
    buyer_name: str | None = None


class OfferCreateRequest(BaseModel):
    amount_paise: int = Field(gt=0)
    message: str | None = Field(default=None, max_length=1000)


class OfferCounterRequest(BaseModel):
    amount_paise: int = Field(gt=0)
    message: str | None = Field(default=None, max_length=1000)


class OfferDeclineRequest(BaseModel):
    message: str | None = Field(default=None, max_length=1000)


class OfferSummaryRead(BaseModel):
    """Public-safe aggregate. Never names a bidder or their amount."""
    total_offers: int = 0
    open_offers: int = 0
    has_accepted: bool = False


# ── Bundles ───────────────────────────────────────────────────────────────────

class BundleItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: uuid.UUID
    sequence: int
    note: str | None = None
    title: str | None = None
    repo_full_name: str | None = None
    primary_language: str | None = None
    is_verified: bool = False
    verified_build_score: int | None = None
    price_paise: int | None = None


class BundleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    title: str
    slug: str
    description: str | None = None
    price_paise: int
    combined_list_price_paise: int
    is_published: bool
    average_score: int | None = None
    created_at: datetime
    items: list[BundleItemRead] = Field(default_factory=list)

    owner_name: str | None = None
    savings_paise: int = 0


class BundleCreateRequest(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    project_ids: list[uuid.UUID] = Field(min_length=2, max_length=8)
    price_paise: int = Field(gt=0)
    publish: bool = False


class BundlePublishRequest(BaseModel):
    publish: bool


# ── Revenue-share deals (extends the incubation offer surface) ─────────────────

class RevenueShareTerms(BaseModel):
    """Terms specific to a revenue-share offer, kept explicit so a founder sees
    the full obligation rather than just the headline amount."""
    amount_paise: int = Field(gt=0)
    revenue_share_bps: int = Field(gt=0, le=5000)          # up to 50%
    revenue_share_months: int = Field(gt=0, le=120)
    revenue_share_cap_bps: int = Field(ge=100, le=1000)    # 1.0x – 10.0x
