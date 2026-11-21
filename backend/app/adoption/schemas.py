import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.users.schemas import UserPublic


class AdoptionRequestCreate(BaseModel):
    message: str = Field(..., min_length=20, max_length=2000)
    continuation_plan: str | None = Field(None, max_length=2000)


class AdoptionRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    requester_id: uuid.UUID
    message: str
    continuation_plan: str | None
    status: str
    resolution_note: str | None
    resolved_at: datetime | None
    created_at: datetime
    requester: UserPublic | None = None


class AdoptionResolve(BaseModel):
    approve: bool
    note: str | None = Field(None, max_length=1000)


class AdoptionToggle(BaseModel):
    is_open_for_adoption: bool
