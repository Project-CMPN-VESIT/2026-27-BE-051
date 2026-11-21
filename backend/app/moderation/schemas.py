import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ReportCreate(BaseModel):
    target_type: str = Field("project", pattern="^(project|user|review)$")
    target_id: str = Field(..., max_length=64)
    reason: str = Field(
        ...,
        pattern="^(plagiarism|copied_repo|fake_hackathon|spam|misleading|inappropriate|other)$",
    )
    details: str | None = Field(None, max_length=1000)


class ReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    reporter_id: uuid.UUID
    target_type: str
    target_id: str
    reason: str
    details: str | None
    status: str
    action_taken: str | None
    resolution_note: str | None
    resolved_at: datetime | None
    created_at: datetime


class ReportAdminItem(ReportRead):
    reporter_email: str | None = None
    target_title: str | None = None
    target_owner_id: uuid.UUID | None = None


class ReportResolve(BaseModel):
    status: str = Field(..., pattern="^(resolved|dismissed)$")
    action: str = Field("none", pattern="^(none|remove_target|ban_owner)$")
    note: str | None = Field(None, max_length=1000)
