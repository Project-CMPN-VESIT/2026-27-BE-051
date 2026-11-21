"""
Public discovery aids: comparison and related projects.

Public because both are pre-purchase evaluation tools. Requiring a login to
compare two listings would put a wall in front of exactly the moment a visitor is
deciding whether this platform is worth signing up for.
"""
import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_optional_user
from app.projects.discovery import DiscoveryService
from app.users.models import User

router = APIRouter(prefix="/discovery", tags=["discovery"])


class ComponentSpecRead(BaseModel):
    key: str
    label: str
    weight: float
    explains: str


class ComparisonComponentRead(BaseModel):
    key: str
    label: str
    weight: float
    score: int | None = None


class ComparisonProjectRead(BaseModel):
    project_id: uuid.UUID
    title: str
    repo_full_name: str | None = None
    primary_language: str | None = None
    topics: list[str] = Field(default_factory=list)
    stage: str | None = None
    is_verified: bool = False
    verified_build_score: int | None = None
    confidence: str | None = None
    fraud_flags: list[str] = Field(default_factory=list)
    commits_analyzed: int | None = None
    contributors_count: int | None = None
    repo_age_days: int | None = None
    components: list[ComparisonComponentRead] = Field(default_factory=list)
    stars: int = 0
    forks: int = 0
    open_issues: int = 0
    is_for_sale: bool = False
    price_paise: int | None = None
    health_score: int | None = None
    completion_score: int | None = None
    has_tests: bool = False
    has_ci: bool = False
    dependency_count: int | None = None
    licence_class: str | None = None


class ComparisonRead(BaseModel):
    component_spec: list[ComponentSpecRead] = Field(default_factory=list)
    projects: list[ComparisonProjectRead] = Field(default_factory=list)
    component_leaders: dict[str, uuid.UUID | None] = Field(default_factory=dict)
    overall_leader: uuid.UUID | None = None
    threshold: int = 70


class SimilarProjectRead(BaseModel):
    project_id: uuid.UUID
    title: str
    repo_full_name: str | None = None
    primary_language: str | None = None
    stage: str | None = None
    is_verified: bool = False
    verified_build_score: int | None = None
    is_for_sale: bool = False
    price_paise: int | None = None
    stars: int = 0
    match_score: int = 0
    reasons: list[str] = Field(default_factory=list)


@router.get("/compare", response_model=ComparisonRead)
def compare_projects(
    ids: list[uuid.UUID] = Query(alias="id", min_length=2, max_length=3),
    db: Session = Depends(get_db),
    _: User | None = Depends(get_optional_user),
):
    """Side-by-side score breakdowns for two or three listings."""
    return DiscoveryService(db).compare(ids)


@router.get("/projects/{project_id}/similar", response_model=list[SimilarProjectRead])
def similar_projects(
    project_id: uuid.UUID,
    limit: int = Query(default=6, ge=1, le=12),
    db: Session = Depends(get_db),
    _: User | None = Depends(get_optional_user),
):
    """Related listings, each with the reason it matched."""
    return DiscoveryService(db).similar(project_id, limit=limit)
