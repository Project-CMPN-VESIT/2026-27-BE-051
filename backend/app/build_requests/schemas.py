import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.users.schemas import UserPublic


class BuildRequestCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=10, max_length=5000)
    budget_paise: int = Field(..., ge=10000, le=100_000_000)  # ₹100 to ₹10,00,000
    skills: list[str] = Field(default_factory=list, max_length=12)
    timeline_days: int | None = Field(None, ge=1, le=365)


class BuildRequestUpdate(BaseModel):
    status: str = Field(..., pattern="^(completed|cancelled)$")


class BuildApplicationCreate(BaseModel):
    cover_note: str = Field(..., min_length=10, max_length=2000)
    quoted_paise: int | None = Field(None, ge=10000, le=100_000_000)
    estimated_days: int | None = Field(None, ge=1, le=365)


class BuildApplicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    request_id: uuid.UUID
    builder_id: uuid.UUID
    cover_note: str
    quoted_paise: int | None
    estimated_days: int | None
    status: str
    created_at: datetime
    builder: UserPublic | None = None


class BuildRequestListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    poster_id: uuid.UUID
    title: str
    description: str
    budget_paise: int
    skills: list[str]
    timeline_days: int | None
    status: str
    created_at: datetime
    application_count: int = 0


class BuildRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    poster_id: uuid.UUID
    title: str
    description: str
    budget_paise: int
    skills: list[str]
    timeline_days: int | None
    status: str
    assigned_builder_id: uuid.UUID | None
    completed_at: datetime | None
    created_at: datetime
    poster: UserPublic | None = None
    application_count: int = 0
    my_application: BuildApplicationRead | None = None
