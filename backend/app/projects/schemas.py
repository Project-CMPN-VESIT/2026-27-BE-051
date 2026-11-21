import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.projects.models import (
    AnalysisStatus,
    ContributorRequestStatus,
    ProjectStage,
    ProjectStatus,
)
from app.trust.schemas import DependencyAuditRead
from app.users.schemas import UserPublic


class ProjectLanguageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    language: str
    bytes_count: int
    percentage: int


class ProjectAnalysisRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    status: AnalysisStatus
    health_score: int | None
    completion_score: int | None
    startup_potential: int | None
    impact_potential: int | None
    missing_features: list[str]
    technical_debt_summary: str | None
    roadmap_steps: dict | None
    contributor_recommendations: list[str]
    reasoning: str | None
    model_used: str | None
    repo_signals: dict | None = None
    code_reviewed: bool = False
    created_at: datetime
    updated_at: datetime


class ProjectVerificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    verified_build_score: int | None
    ownership_verified: bool
    hackathon_verified: bool
    originality_score: int | None
    repo_age_days: int | None
    activity_consistency: int | None
    verified_at: str | None


class ProjectCreate(BaseModel):
    github_repo_id: int
    repo_full_name: str = Field(..., max_length=200)
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)
    stage: ProjectStage = ProjectStage.MVP
    is_seeking_contributors: bool = False
    # Pricing
    is_for_sale: bool = False
    price_paise: int | None = Field(None, ge=100, le=100_000_00)  # ₹1 to ₹1,00,000
    price_label: str | None = Field(None, max_length=100)
    sale_type: str | None = Field(None, pattern="^(source_code|collab_access|custom)$")
    # Private digital-delivery fields (revealed to buyer post-purchase)
    delivery_url: str | None = Field(None, max_length=2000)
    delivery_instructions: str | None = Field(None, max_length=5000)
    sale_license: str | None = Field(None, max_length=5000)


class ProjectUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)
    stage: ProjectStage | None = None
    is_seeking_contributors: bool | None = None
    status: ProjectStatus | None = None
    # Pricing
    is_for_sale: bool | None = None
    price_paise: int | None = Field(None, ge=100, le=100_000_00)
    price_label: str | None = Field(None, max_length=100)
    sale_type: str | None = Field(None, pattern="^(source_code|collab_access|custom)$")
    # Private digital-delivery fields
    delivery_url: str | None = Field(None, max_length=2000)
    delivery_instructions: str | None = Field(None, max_length=5000)
    sale_license: str | None = Field(None, max_length=5000)


class RiskFactorRead(BaseModel):
    label: str
    points: int
    detail: str


class RiskAreaRead(BaseModel):
    area: str
    severity: str
    reason: str = ""


class CodeSignalsRead(BaseModel):
    file_count: int | None = None
    source_file_count: int | None = None
    test_file_count: int | None = None
    has_tests: bool | None = None
    has_ci: bool | None = None
    has_docker: bool | None = None
    has_lockfile: bool | None = None
    has_readme: bool | None = None
    has_license: bool | None = None
    dependency_count: int | None = None


class RiskAssessmentRead(BaseModel):
    risk_score: int
    band: str
    confidence: str
    summary: str
    factors: list[RiskFactorRead] = []
    risk_areas: list[RiskAreaRead] = []
    code_reviewed: bool = False
    code_signals: CodeSignalsRead | None = None
    # Dependency + licence audit, folded into this report rather than a separate
    # endpoint. Typed as the trust module's schema so the honesty flags
    # (`advisory_source`, `is_complete_scan`) reach the UI intact.
    dependency_audit: "DependencyAuditRead | None" = None


class TimelineEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    event_type: str
    title: str
    description: str | None
    progress_percent: int | None
    is_manual: bool
    actor_id: uuid.UUID | None
    actor_name: str | None = None
    created_at: datetime


class TimelineEventCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: str | None = Field(None, max_length=2000)
    progress_percent: int | None = Field(None, ge=0, le=100)
    is_milestone: bool = False


class ContributorMatchRead(BaseModel):
    """A ranked contributor suggestion with its score breakdown and reasons."""
    user_id: uuid.UUID
    display_name: str
    avatar_url: str | None = None
    college: str | None = None
    tier: str
    match_score: int
    skill_fit: int
    reliability: int
    track_record: int
    collaboration: int
    matched_skills: list[str] = []
    missing_skills: list[str] = []
    reasons: list[str] = []


class PitchDeckSlide(BaseModel):
    """One slide.

    `kind` selects the layout the frontend renders, and `data` carries the
    computed payload for the score/traction/ask slides. Both must be declared
    here — Pydantic drops undeclared keys, so omitting them silently flattened
    every designed slide back to a plain bullet list.
    """
    kind: str = "narrative"
    title: str
    headline: str = ""
    bullets: list[str] = []
    speaker_note: str = ""
    data: dict = {}


class PitchDeckRead(BaseModel):
    status: str
    tagline: str | None = None
    slides: list[PitchDeckSlide] = []
    model_used: str | None = None
    generated_at: str | None = None
    error_message: str | None = None


class BuyerBriefRead(BaseModel):
    """Plain-English "why buy this" brief for a listing.

    `watch_outs` is never empty by construction — a brief with only upside reads
    as an advertisement, and a buyer discounts the whole thing accordingly.
    """
    summary: str
    good_for: list[str] = []
    watch_outs: list[str] = []
    verdict: str = ""
    model_used: str | None = None
    generated_at: datetime | None = None


class ProjectDeliveryRead(BaseModel):
    """Private delivery payload — returned only to the owner or a verified buyer."""
    model_config = ConfigDict(from_attributes=True)
    delivery_url: str | None = None
    delivery_instructions: str | None = None
    sale_license: str | None = None
    has_delivery: bool = False


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    owner_id: uuid.UUID
    github_repo_id: int
    repo_full_name: str
    title: str
    description: str | None
    homepage_url: str | None
    stage: ProjectStage
    status: ProjectStatus
    stars: int
    forks: int
    open_issues: int
    primary_language: str | None
    topics: list[str]
    is_seeking_contributors: bool
    is_featured: bool
    is_verified: bool
    is_open_for_adoption: bool = False
    previous_owner_id: uuid.UUID | None = None
    adopted_at: str | None = None
    is_for_sale: bool
    price_paise: int | None
    price_label: str | None
    sale_type: str | None
    startup_report_unlocked: bool
    pitch_deck_unlocked: bool = False
    # Exposed so the owner's project page can explain a withheld listing. Public
    # readers see it too, which is fine — a withheld project is excluded from
    # discovery, so anyone with the URL already has it from the owner.
    duplicate_status: str = "clear"
    last_synced_at: str | None
    created_at: datetime
    updated_at: datetime
    owner: UserPublic | None = None
    analysis: ProjectAnalysisRead | None = None
    verification: ProjectVerificationRead | None = None
    languages: list[ProjectLanguageRead] = []


class ProjectListItem(BaseModel):
    """Lighter model for feed/list views."""
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    repo_full_name: str
    title: str
    description: str | None
    stage: ProjectStage
    status: ProjectStatus
    stars: int
    forks: int
    primary_language: str | None
    topics: list[str]
    is_seeking_contributors: bool
    is_verified: bool
    is_featured: bool
    is_open_for_adoption: bool = False
    is_for_sale: bool = False
    price_paise: int | None = None
    sale_type: str | None = None
    created_at: datetime
    health_score: int | None = None
    startup_potential: int | None = None


class ContributorRequestCreate(BaseModel):
    message: str | None = Field(None, max_length=1000)
    skills_offered: list[str] = Field(default_factory=list, max_length=10)


class ContributorRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    requester_id: uuid.UUID
    status: ContributorRequestStatus
    message: str | None
    skills_offered: list[str]
    created_at: datetime
    resolved_at: str | None
    requester: UserPublic | None = None


class ContributorRequestUpdate(BaseModel):
    status: ContributorRequestStatus


class PaginatedProjects(BaseModel):
    items: list[ProjectListItem]
    total: int
    page: int
    per_page: int
    pages: int
