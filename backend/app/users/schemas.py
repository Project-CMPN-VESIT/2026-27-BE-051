import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, field_validator

from app.users.models import UserRole


class ProfileBase(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=120)
    bio: str | None = Field(None, max_length=500)
    location: str | None = Field(None, max_length=120)
    college: str | None = Field(None, max_length=200)
    graduation_year: int | None = Field(None, ge=1990, le=2035)
    linkedin_url: str | None = None
    website_url: str | None = None


class ProfileRead(ProfileBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    user_id: uuid.UUID
    github_username: str | None
    avatar_url: str | None
    created_at: datetime


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(None, min_length=1, max_length=120)
    bio: str | None = Field(None, max_length=500)
    location: str | None = None
    college: str | None = None
    graduation_year: int | None = Field(None, ge=1990, le=2035)
    linkedin_url: str | None = None
    website_url: str | None = None


class BuilderReputationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    contribution_score: int
    trust_score: int
    collab_score: int
    completion_score: int
    total_projects: int
    verified_projects: int
    contracts_completed: int = 0
    contracts_total: int = 0
    revenue_earned_paise: int = 0
    avg_build_score: int | None = None
    reputation_points: int = 0
    tier: str = "newcomer"


class ReputationDetail(BuilderReputationRead):
    """Public reputation with computed badges + delivery rate."""
    badges: list[str] = []
    delivery_rate: float | None = None
    last_computed_at: datetime | None = None


class LeaderboardEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: uuid.UUID
    display_name: str
    avatar_url: str | None = None
    college: str | None = None
    tier: str
    reputation_points: int
    verified_projects: int
    contracts_completed: int


class RoleUpdate(BaseModel):
    role: UserRole

    @field_validator("role")
    @classmethod
    def _no_self_admin(cls, v: UserRole) -> UserRole:
        if v == UserRole.ADMIN:
            raise ValueError("The admin role cannot be self-assigned")
        return v


class BuilderDirectoryEntry(BaseModel):
    user_id: uuid.UUID
    display_name: str
    avatar_url: str | None = None
    college: str | None = None
    bio: str | None = None
    role: str
    tier: str
    reputation_points: int
    trust_score: int
    verified_projects: int
    contracts_completed: int


class PayoutDetailUpdate(BaseModel):
    method: str = Field("upi", pattern="^(upi|bank)$")
    upi_id: str | None = Field(None, max_length=120)
    account_holder_name: str | None = Field(None, max_length=120)
    account_number: str | None = Field(None, max_length=34)
    ifsc: str | None = Field(None, max_length=16)
    pan: str | None = Field(None, max_length=10)

    def validate_for_method(self) -> None:
        if self.method == "upi":
            if not self.upi_id:
                raise ValueError("upi_id is required for UPI payouts")
        elif self.method == "bank":
            if not (self.account_holder_name and self.account_number and self.ifsc):
                raise ValueError("account_holder_name, account_number and ifsc are required for bank payouts")


class ContactInfo(BaseModel):
    """Builder contact details — revealed only to Pro members (or self/admin)."""
    unlocked: bool
    email: str | None = None
    github_username: str | None = None
    linkedin_url: str | None = None
    website_url: str | None = None


class PayoutDetailRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    method: str
    upi_id: str | None = None
    account_holder_name: str | None = None
    account_number_masked: str | None = None
    ifsc: str | None = None
    pan_masked: str | None = None
    is_verified: bool = False


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: str
    role: UserRole
    is_verified: bool
    is_active: bool
    totp_enabled: bool
    created_at: datetime
    profile: ProfileRead | None = None
    reputation: BuilderReputationRead | None = None


class UserPublic(BaseModel):
    """Public-facing user profile (no email)."""
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    role: UserRole
    profile: ProfileRead | None = None
    reputation: BuilderReputationRead | None = None
