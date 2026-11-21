import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ── Trust receipts ────────────────────────────────────────────────────────────

class TrustReceiptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    receipt_code: str
    payment_id: uuid.UUID
    project_id: uuid.UUID
    buyer_id: uuid.UUID
    seller_id: uuid.UUID

    amount_paise: int
    platform_fee_paise: int | None = None
    seller_net_paise: int | None = None
    sale_type: str | None = None
    sale_license: str | None = None

    verified_build_score: int | None = None
    was_verified: bool = False
    confidence: str | None = None
    ownership_verified: bool = False
    hackathon_verified: bool = False
    components: dict = Field(default_factory=dict)
    fraud_flags: list = Field(default_factory=list)
    commits_analyzed: int | None = None
    contributors_count: int | None = None
    repo_age_days: int | None = None

    repo_full_name: str | None = None
    project_title: str | None = None
    stars: int | None = None
    github_pushed_at: str | None = None
    code_signals: dict = Field(default_factory=dict)
    risk_score: int | None = None
    risk_band: str | None = None

    issued_at: datetime


# ── Health monitoring ─────────────────────────────────────────────────────────

class HealthReading(BaseModel):
    recorded_at: str
    score: int | None = None
    is_verified: bool = False
    confidence: str | None = None
    components: dict = Field(default_factory=dict)
    fraud_flags: list = Field(default_factory=list)


class HealthTrendRead(BaseModel):
    project_id: uuid.UUID
    project_title: str | None = None
    repo_full_name: str | None = None
    baseline_score: int | None = None
    latest_score: int | None = None
    delta: int | None = None
    direction: str = "unknown"
    readings: int = 0
    last_checked_at: str | None = None
    purchased_at: str
    receipt_code: str | None = None
    receipt_id: uuid.UUID | None = None
    days_since_push: int | None = None
    series: list[HealthReading] = Field(default_factory=list)


# ── Duplicate flags ───────────────────────────────────────────────────────────

class DuplicateSignalRead(BaseModel):
    signal: str
    weight: int
    detail: str


class DuplicateFlagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    matched_project_id: uuid.UUID
    similarity: int
    signals: list[DuplicateSignalRead] = Field(default_factory=list)
    status: str
    review_note: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime

    project_title: str | None = None
    matched_project_title: str | None = None
    matched_repo_full_name: str | None = None
    matched_owner_name: str | None = None


class DuplicateReviewRequest(BaseModel):
    confirm: bool
    note: str | None = Field(default=None, max_length=1000)


# ── Dependency audit (surfaced inside the risk report) ────────────────────────

class DependencyFindingRead(BaseModel):
    package: str
    version: str | None = None
    kind: str
    severity: str
    detail: str
    licence: str | None = None
    licence_class: str | None = None
    advisory_id: str | None = None
    fixed_in: str | None = None
    replacement: str | None = None


class DependencyAuditRead(BaseModel):
    scanned: bool = False
    dependencies_scanned: int = 0
    manifests_read: list[str] = Field(default_factory=list)
    findings: list[DependencyFindingRead] = Field(default_factory=list)
    licence_summary: dict = Field(default_factory=dict)
    project_licence: str | None = None
    project_licence_class: str = "unknown"
    counts: dict = Field(default_factory=dict)
    # Carried through so the UI can state the limits of the scan rather than
    # implying a clean result means a clean project.
    advisory_source: str | None = None
    is_complete_scan: bool = False
