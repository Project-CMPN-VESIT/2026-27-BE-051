import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.hackathon.models import HackathonClaimStatus, HackathonPlatform


class ClaimCreate(BaseModel):
    project_id: uuid.UUID
    event_name: str = Field(min_length=1, max_length=200)
    event_url: str | None = Field(default=None, max_length=2000)
    platform: HackathonPlatform = HackathonPlatform.OTHER
    event_start: datetime
    event_end: datetime
    proof_url: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _check_window(self):
        if self.event_end < self.event_start:
            raise ValueError("event_end must be on or after event_start")
        return self


class ClaimReview(BaseModel):
    approve: bool
    notes: str | None = Field(default=None, max_length=2000)


class ClaimRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    claimed_by_id: uuid.UUID
    event_name: str
    event_url: str | None
    platform: HackathonPlatform
    event_start: datetime
    event_end: datetime
    proof_url: str | None
    status: HackathonClaimStatus
    authenticity_score: int | None
    verdict: str | None
    signals: dict | None
    reasoning: str | None
    review_notes: str | None
    reviewed_at: datetime | None
    created_at: datetime
