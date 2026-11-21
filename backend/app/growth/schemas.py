import uuid
from datetime import datetime

from pydantic import BaseModel


class ReferredUser(BaseModel):
    user_id: uuid.UUID
    display_name: str
    joined_at: datetime


class ReferralRead(BaseModel):
    referral_code: str
    referral_link: str
    referred_count: int
    is_campus_ambassador: bool
    recent_referrals: list[ReferredUser]


class CollegeStanding(BaseModel):
    college: str
    builder_count: int


class AmbassadorStanding(BaseModel):
    user_id: uuid.UUID
    display_name: str
    college: str | None
    referrals: int


class CampusLeaderboard(BaseModel):
    colleges: list[CollegeStanding]
    ambassadors: list[AmbassadorStanding]
