import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.incubation.models import OfferStatus, OfferType


class OfferCreate(BaseModel):
    project_id: uuid.UUID
    offer_type: OfferType
    title: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=4000)
    amount_paise: int | None = Field(default=None, ge=0)
    equity_percent: int | None = Field(default=None, ge=0, le=100)


class OfferRespond(BaseModel):
    accept: bool
    note: str | None = Field(default=None, max_length=2000)


class OfferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    incubator_id: uuid.UUID
    project_id: uuid.UUID
    offer_type: OfferType
    title: str
    message: str
    amount_paise: int | None
    equity_percent: int | None
    status: OfferStatus
    response_note: str | None
    responded_at: datetime | None
    created_at: datetime


class DiscoverProject(BaseModel):
    project_id: uuid.UUID
    title: str
    repo_full_name: str
    owner_id: uuid.UUID
    owner_name: str
    owner_tier: str
    verified_build_score: int | None
    startup_potential: int | None
    stars: int
