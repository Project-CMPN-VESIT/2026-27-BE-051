import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ── College partners ──────────────────────────────────────────────────────────

class CollegePartnerRegisterRequest(BaseModel):
    college_name: str = Field(min_length=2, max_length=200)
    department: str | None = Field(default=None, max_length=160)
    contact_name: str | None = Field(default=None, max_length=160)
    contact_title: str | None = Field(default=None, max_length=160)
    website_url: str | None = Field(default=None, max_length=500)


class CollegePartnerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    college_name: str
    department: str | None = None
    contact_name: str | None = None
    contact_title: str | None = None
    website_url: str | None = None
    is_verified: bool
    verified_at: datetime | None = None
    notes: str | None = None
    created_at: datetime

    contact_email: str | None = None


class CollegePartnerVerifyRequest(BaseModel):
    approve: bool
    note: str | None = Field(default=None, max_length=1000)


class TopProjectRead(BaseModel):
    project_id: uuid.UUID
    title: str
    score: int | None = None
    builder_name: str
    link: str


class ScoreBandRead(BaseModel):
    band: str
    count: int


class CollegeDashboardRead(BaseModel):
    college_name: str
    department: str | None = None
    is_verified: bool = True
    students_total: int = 0
    projects_total: int = 0
    verified_projects: int = 0
    total_earned_paise: int = 0
    avg_score: int | None = None
    leaderboard_rank: int | None = None
    leaderboard_total: int = 0
    top_projects: list[TopProjectRead] = Field(default_factory=list)
    score_distribution: list[ScoreBandRead] = Field(default_factory=list)
    # Set when the cohort is too small for a derived average to be anonymous.
    cohort_too_small_for_averages: bool = False
    empty_reason: str | None = None


# ── Employer verification requests ────────────────────────────────────────────

class VerificationRequestCreate(BaseModel):
    builder_id: uuid.UUID
    role_title: str = Field(min_length=2, max_length=200)
    message: str = Field(min_length=10, max_length=2000)
    company: str | None = Field(default=None, max_length=160)
    looking_for: str | None = Field(default=None, max_length=300)


class VerificationFulfilRequest(BaseModel):
    repo_full_name: str = Field(min_length=3, max_length=200)
    note: str | None = Field(default=None, max_length=1000)


class VerificationDeclineRequest(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


class ReportComponentRead(BaseModel):
    key: str
    label: str
    weight: float
    score: int | None = None
    explains: str


class VerificationRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    requester_id: uuid.UUID
    builder_id: uuid.UUID
    role_title: str
    company: str | None = None
    message: str
    looking_for: str | None = None
    status: str
    repo_full_name: str | None = None
    builder_note: str | None = None
    report: dict | None = None
    verified_build_score: int | None = None
    report_code: str | None = None
    fulfilled_at: datetime | None = None
    expires_at: datetime | None = None
    created_at: datetime

    requester_name: str | None = None
    builder_name: str | None = None
