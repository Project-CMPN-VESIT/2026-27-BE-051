import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TeamMemberInput(BaseModel):
    user_id: uuid.UUID
    revenue_share_bps: int = Field(ge=0, le=10_000)
    contribution: str | None = Field(default=None, max_length=200)
    role: str | None = Field(default=None, max_length=40)


class TeamSetRequest(BaseModel):
    """The complete roster in one call.

    Whole-roster replacement rather than incremental edits, because shares must
    always total 100% — an add-one-member endpoint has no valid intermediate state.
    """
    members: list[TeamMemberInput] = Field(min_length=1, max_length=8)


class TeamMemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    revenue_share_bps: int
    contribution: str | None = None
    role: str
    status: str
    is_lead: bool
    created_at: datetime

    display_name: str | None = None
    avatar_url: str | None = None
    github_username: str | None = None


class TeamRead(BaseModel):
    project_id: uuid.UUID
    is_team_project: bool = False
    members: list[TeamMemberRead] = Field(default_factory=list)
    total_bps: int = 0
    # True when accepted shares don't yet total 100% — the roster is agreed on
    # paper but not everyone has confirmed, so sale distribution would be partial.
    is_fully_accepted: bool = False


class TeamRespondRequest(BaseModel):
    accept: bool


class SplitItemRead(BaseModel):
    project_id: uuid.UUID
    project_title: str | None = None
    amount_paise: int
    revenue_share_bps: int
    is_lead: bool = False
    created_at: datetime


class MemberEarningsRead(BaseModel):
    total_paise: int = 0
    sales_count: int = 0
    items: list[SplitItemRead] = Field(default_factory=list)
