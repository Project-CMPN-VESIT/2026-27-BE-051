"""API surface for builder analytics, score history, saved searches and shortlists."""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_verified_user
from app.core.exceptions import ForbiddenError, NotFoundError
from app.growth.analytics import AnalyticsService, PipelineService
from app.projects.models import Project
from app.users.models import User

analytics_router = APIRouter(prefix="/analytics", tags=["analytics"])
pipeline_router = APIRouter(tags=["pipeline"])


# ══════════════════════════════════════════════════════════════════════════════
# Builder analytics
# ══════════════════════════════════════════════════════════════════════════════

class SeriesPoint(BaseModel):
    day: str
    value: int


class TopProject(BaseModel):
    project_id: uuid.UUID
    title: str
    views: int


class BuilderAnalytics(BaseModel):
    window_days: int
    views_total: int
    """Owner's own views, excluded from views_total so the number means something."""
    views_owner_excluded: int
    views_series: list[SeriesPoint]
    earnings_window_paise: int
    earnings_series: list[SeriesPoint]
    lifetime_sales_paise: int
    sales_count: int
    escrow_released_paise: int
    projects_total: int
    offers_received: int
    contributor_requests: int
    conversations_started: int
    top_projects: list[TopProject]


@analytics_router.get("/me", response_model=BuilderAnalytics)
def my_analytics(
    days: int = Query(30, ge=7, le=90),
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Views, inbound interest and earnings over time for the signed-in builder."""
    return AnalyticsService(db).builder_overview(current_user.id, days=days)


# ══════════════════════════════════════════════════════════════════════════════
# Score history
# ══════════════════════════════════════════════════════════════════════════════

class ScoreSnapshotRead(BaseModel):
    recorded_at: datetime
    verified_build_score: int | None
    confidence: str | None
    is_verified: bool
    fraud_flags: list[str] = []


@analytics_router.get(
    "/projects/{project_id}/score-history",
    response_model=list[ScoreSnapshotRead],
)
def project_score_history(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Append-only score history for a project.

    Public, like the score itself: a trend that only the owner can see is not
    evidence to anyone else.
    """
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.is_deleted == False)
        .first()
    )
    if not project:
        raise NotFoundError("Project")

    return [
        ScoreSnapshotRead(
            recorded_at=s.recorded_at,
            verified_build_score=s.verified_build_score,
            confidence=s.confidence,
            is_verified=s.is_verified,
            fraud_flags=list(s.fraud_flags or []),
        )
        for s in AnalyticsService(db).score_history(project_id)
    ]


@analytics_router.get("/builders/{user_id}/score-history", response_model=list[ScoreSnapshotRead])
def builder_score_history(user_id: uuid.UUID, db: Session = Depends(get_db)):
    """Every score snapshot across a builder's projects, oldest first."""
    return [
        ScoreSnapshotRead(
            recorded_at=s.recorded_at,
            verified_build_score=s.verified_build_score,
            confidence=s.confidence,
            is_verified=s.is_verified,
            fraud_flags=list(s.fraud_flags or []),
        )
        for s in AnalyticsService(db).builder_score_history(user_id)
    ]


# ══════════════════════════════════════════════════════════════════════════════
# Saved searches
# ══════════════════════════════════════════════════════════════════════════════

class SearchFilters(BaseModel):
    """The subset of discovery filters a saved search can express."""
    search: str | None = Field(default=None, max_length=100)
    language: str | None = Field(default=None, max_length=60)
    stage: str | None = Field(default=None, max_length=20)
    verified_only: bool = False
    for_sale: bool = False
    seeking_contributors: bool = False
    min_score: int | None = Field(default=None, ge=0, le=100)
    max_price_paise: int | None = Field(default=None, ge=0)


class SavedSearchCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    filters: SearchFilters
    alerts_enabled: bool = False


class SavedSearchUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    alerts_enabled: bool | None = None


class SavedSearchRead(BaseModel):
    id: uuid.UUID
    name: str
    filters: dict
    alerts_enabled: bool
    last_checked_at: datetime | None
    last_match_count: int
    created_at: datetime


def _require_pipeline_role(user: User) -> None:
    """Saved searches and shortlists are a hiring/funding tool.

    Gated by role rather than plan: a builder has no use for a candidate
    pipeline, and offering it to them would clutter the product rather than
    upsell it.
    """
    if user.role.value not in ("founder", "incubator", "mentor", "admin"):
        raise ForbiddenError(
            "Saved searches and shortlists are available to founder, "
            "incubator and mentor accounts. You can switch mode in Settings."
        )


@pipeline_router.get("/saved-searches", response_model=list[SavedSearchRead])
def list_saved_searches(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    _require_pipeline_role(current_user)
    return PipelineService(db).list_searches(current_user.id)


@pipeline_router.post("/saved-searches", response_model=SavedSearchRead, status_code=201)
def create_saved_search(
    data: SavedSearchCreate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    _require_pipeline_role(current_user)
    return PipelineService(db).create_search(
        current_user.id,
        name=data.name,
        filters=data.filters.model_dump(exclude_none=True),
        alerts_enabled=data.alerts_enabled,
    )


@pipeline_router.put("/saved-searches/{search_id}", response_model=SavedSearchRead)
def update_saved_search(
    search_id: uuid.UUID,
    data: SavedSearchUpdate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    _require_pipeline_role(current_user)
    return PipelineService(db).update_search(
        current_user.id, search_id,
        name=data.name, alerts_enabled=data.alerts_enabled,
    )


@pipeline_router.delete("/saved-searches/{search_id}", status_code=204)
def delete_saved_search(
    search_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    _require_pipeline_role(current_user)
    PipelineService(db).delete_search(current_user.id, search_id)


class SearchRunResult(BaseModel):
    total: int
    new_since_last_check: int


@pipeline_router.post("/saved-searches/{search_id}/run", response_model=SearchRunResult)
def run_saved_search(
    search_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Re-run a saved search and report how many matches are new."""
    _require_pipeline_role(current_user)
    return PipelineService(db).run_search(current_user.id, search_id)


# ══════════════════════════════════════════════════════════════════════════════
# Shortlists
# ══════════════════════════════════════════════════════════════════════════════

class ShortlistProject(BaseModel):
    id: uuid.UUID
    title: str
    repo_full_name: str
    is_verified: bool
    is_for_sale: bool
    price_paise: int | None
    primary_language: str | None


class ShortlistEntryRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    note: str | None
    stage: str | None
    created_at: datetime
    project: ShortlistProject | None


class ShortlistCreate(BaseModel):
    project_id: uuid.UUID
    note: str | None = Field(default=None, max_length=2000)
    stage: str | None = Field(default=None, max_length=40)


class ShortlistUpdate(BaseModel):
    note: str | None = Field(default=None, max_length=2000)
    stage: str | None = Field(default=None, max_length=40)


def _serialise_entry(entry) -> ShortlistEntryRead:
    p = entry.project
    return ShortlistEntryRead(
        id=entry.id,
        project_id=entry.project_id,
        note=entry.note,
        stage=entry.stage,
        created_at=entry.created_at,
        project=ShortlistProject(
            id=p.id, title=p.title, repo_full_name=p.repo_full_name,
            is_verified=p.is_verified, is_for_sale=p.is_for_sale,
            price_paise=p.price_paise, primary_language=p.primary_language,
        ) if p else None,
    )


@pipeline_router.get("/shortlist", response_model=list[ShortlistEntryRead])
def list_shortlist(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    _require_pipeline_role(current_user)
    return [_serialise_entry(e) for e in PipelineService(db).list_shortlist(current_user.id)]


@pipeline_router.post("/shortlist", response_model=ShortlistEntryRead, status_code=201)
def add_shortlist(
    data: ShortlistCreate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    _require_pipeline_role(current_user)
    entry = PipelineService(db).add_to_shortlist(
        current_user.id, data.project_id, note=data.note, stage=data.stage,
    )
    return _serialise_entry(entry)


@pipeline_router.put("/shortlist/{entry_id}", response_model=ShortlistEntryRead)
def update_shortlist(
    entry_id: uuid.UUID,
    data: ShortlistUpdate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    _require_pipeline_role(current_user)
    entry = PipelineService(db).update_shortlist_entry(
        current_user.id, entry_id, note=data.note, stage=data.stage,
    )
    return _serialise_entry(entry)


@pipeline_router.delete("/shortlist/{entry_id}", status_code=204)
def remove_shortlist(
    entry_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    _require_pipeline_role(current_user)
    PipelineService(db).remove_from_shortlist(current_user.id, entry_id)
