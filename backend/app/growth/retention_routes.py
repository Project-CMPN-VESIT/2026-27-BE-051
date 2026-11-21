"""
Retention surfaces: commit streaks and the weekly digest preview.
"""
import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_optional_user
from app.growth.digest import DigestService
from app.growth.streaks import StreakService
from app.users.models import User

router = APIRouter(prefix="/retention", tags=["retention"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class MilestoneRead(BaseModel):
    days: int
    label: str = ""
    blurb: str = ""


class StreakRead(BaseModel):
    current_streak_days: int = 0
    longest_streak_days: int = 0
    total_active_days: int = 0
    last_active_on: str | None = None
    milestones: list[int] = Field(default_factory=list)
    milestone_details: list[MilestoneRead] = Field(default_factory=list)
    is_live: bool = False
    next_milestone: int | None = None
    computed_at: str | None = None
    # False when we have no commit-day history for this builder. The UI must say
    # "not tracked yet" rather than render a confident zero.
    has_data: bool = False


class CalendarDay(BaseModel):
    day: str
    active: bool


class StreakLeaderRead(BaseModel):
    user_id: uuid.UUID
    display_name: str
    current_streak_days: int
    longest_streak_days: int
    last_active_on: str | None = None


class DigestItemRead(BaseModel):
    title: str | None = None
    detail: str | None = None
    link: str | None = None
    project_id: uuid.UUID | None = None
    score: int | None = None
    delta: int | None = None
    direction: str | None = None
    views: int | None = None
    status: str | None = None
    kind: str | None = None


class DigestSectionRead(BaseModel):
    key: str
    title: str
    items: list[DigestItemRead] = Field(default_factory=list)


class DigestRead(BaseModel):
    window_days: int
    generated_at: str
    item_count: int
    is_worth_sending: bool
    sections: list[DigestSectionRead] = Field(default_factory=list)


# ── Streaks ───────────────────────────────────────────────────────────────────

@router.get("/streak", response_model=StreakRead)
def my_streak(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return StreakService(db).get(current_user.id)


@router.get("/streak/calendar", response_model=list[CalendarDay])
def my_streak_calendar(
    weeks: int = Query(default=26, ge=4, le=52),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return StreakService(db).calendar(current_user.id, weeks=weeks)


@router.get("/streak/users/{user_id}", response_model=StreakRead)
def user_streak(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User | None = Depends(get_optional_user),
):
    """A builder's streak. Public — it appears on their public profile."""
    return StreakService(db).get(user_id)


@router.get("/streak/users/{user_id}/calendar", response_model=list[CalendarDay])
def user_streak_calendar(
    user_id: uuid.UUID,
    weeks: int = Query(default=26, ge=4, le=52),
    db: Session = Depends(get_db),
    _: User | None = Depends(get_optional_user),
):
    return StreakService(db).calendar(user_id, weeks=weeks)


@router.get("/streak/leaderboard", response_model=list[StreakLeaderRead])
def streak_leaderboard(
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    _: User | None = Depends(get_optional_user),
):
    return StreakService(db).leaderboard(limit=limit)


# ── Digest ────────────────────────────────────────────────────────────────────

@router.get("/digest", response_model=DigestRead)
def digest_preview(
    days: int = Query(default=7, ge=1, le=30),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Exactly what this week's digest email would contain.

    The same payload the emailer renders, so what a user sees here is what they
    receive — not a separate approximation that can drift.
    """
    return DigestService(db).build_digest(current_user, days=days)
