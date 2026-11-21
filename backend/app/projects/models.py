import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger, Boolean, DateTime, Enum, ForeignKey, Integer,
    SmallInteger, String, Text
)
from app.core.db_types import StringArray, JsonB, UUIDType
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ProjectStage(str, enum.Enum):
    IDEA = "idea"
    PROTOTYPE = "prototype"
    MVP = "mvp"
    PRODUCTION = "production"


class ProjectStatus(str, enum.Enum):
    ACTIVE = "active"
    DORMANT = "dormant"
    ARCHIVED = "archived"
    REVIVED = "revived"


class AnalysisStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Project(Base):
    __tablename__ = "projects"

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    github_repo_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True, nullable=False)
    repo_full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    homepage_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    stage: Mapped[ProjectStage] = mapped_column(
        Enum(ProjectStage, name="project_stage"), default=ProjectStage.MVP, nullable=False
    )
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus, name="project_status"), default=ProjectStatus.ACTIVE, nullable=False
    )

    # GitHub metadata (synced)
    stars: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    forks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    open_issues: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    watchers: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    primary_language: Mapped[str | None] = mapped_column(String(60), nullable=True)
    topics: Mapped[list[str]] = mapped_column(StringArray, default=list, nullable=False)
    default_branch: Mapped[str] = mapped_column(String(100), default="main", nullable=False)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    github_created_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    github_pushed_at: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Owner-reported build progress (0-100), shown on the project timeline.
    progress_percent: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)

    # Discovery flags
    is_seeking_contributors: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Owner is willing to hand the project over to someone who'll continue it.
    is_open_for_adoption: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    # Set when ownership has been transferred through an adoption.
    previous_owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    adopted_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # ── Pricing / monetisation ────────────────────────────────────────────
    is_for_sale: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    price_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)   # e.g. 99900 = ₹999
    price_label: Mapped[str | None] = mapped_column(String(100), nullable=True) # e.g. "Source code access"
    sale_type: Mapped[str | None] = mapped_column(String(40), nullable=True)   # "source_code"|"collab_access"|"custom"
    startup_report_unlocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pitch_deck_unlocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Digital delivery — PRIVATE, revealed to a buyer only after purchase.
    delivery_url: Mapped[str | None] = mapped_column(Text, nullable=True)          # download/repo/transfer link
    delivery_instructions: Mapped[str | None] = mapped_column(Text, nullable=True) # setup notes, credentials handover, etc.
    sale_license: Mapped[str | None] = mapped_column(Text, nullable=True)          # license terms shown to buyer

    # ── Duplicate screening ───────────────────────────────────────────────────
    # "clear" | "review" | "withheld". Set by the import-time similarity screen.
    # A withheld project stays fully visible to its owner and to admins — only
    # marketplace surfaces (for-sale rails, search) exclude it. Hiding a project
    # from the person who built it, over an automated guess, would be indefensible.
    duplicate_status: Mapped[str] = mapped_column(
        String(12), default="clear", nullable=False, index=True
    )

    last_synced_at: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Relationships
    owner: Mapped["User"] = relationship("User", foreign_keys=[owner_id])  # type: ignore
    analysis: Mapped["ProjectAnalysis | None"] = relationship(
        "ProjectAnalysis", back_populates="project", uselist=False, cascade="all, delete-orphan"
    )
    verification: Mapped["ProjectVerification | None"] = relationship(
        "ProjectVerification", back_populates="project", uselist=False, cascade="all, delete-orphan"
    )
    contributor_requests: Mapped[list["ContributorRequest"]] = relationship(
        "ContributorRequest", back_populates="project", cascade="all, delete-orphan"
    )
    collaborations: Mapped[list["Collaboration"]] = relationship(
        "Collaboration", back_populates="project", cascade="all, delete-orphan"
    )
    languages: Mapped[list["ProjectLanguage"]] = relationship(
        "ProjectLanguage", back_populates="project", cascade="all, delete-orphan"
    )


class ProjectLanguage(Base):
    __tablename__ = "project_languages"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    language: Mapped[str] = mapped_column(String(60), nullable=False)
    bytes_count: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    percentage: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)

    project: Mapped["Project"] = relationship("Project", back_populates="languages")


class ProjectAnalysis(Base):
    __tablename__ = "project_analyses"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        unique=True, nullable=False, index=True
    )
    status: Mapped[AnalysisStatus] = mapped_column(
        Enum(AnalysisStatus, name="analysis_status"),
        default=AnalysisStatus.PENDING,
        nullable=False,
    )

    # Scores (0-100)
    health_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    completion_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    startup_potential: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    impact_potential: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    # AI-generated content
    missing_features: Mapped[list[str]] = mapped_column(StringArray, default=list, nullable=False)
    technical_debt_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    roadmap_steps: Mapped[dict | None] = mapped_column(JsonB, nullable=True)
    # AI-identified risk areas: {"items": [{area, severity, reason}]}
    potential_bugs: Mapped[dict | None] = mapped_column(JsonB, nullable=True)
    # Hard facts read from the repo tree (tests/CI/Docker/deps/file counts).
    repo_signals: Mapped[dict | None] = mapped_column(JsonB, nullable=True)
    # Dependency + licence audit (see app/trust/dependency_audit.py).
    # Its own column rather than a key inside repo_signals because RiskService
    # whitelists repo_signals keys, and a nested payload would be silently
    # dropped on the way to the UI.
    dependency_audit: Mapped[dict | None] = mapped_column(JsonB, nullable=True)
    # True when the AI analysis was grounded in actual source files.
    code_reviewed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    contributor_recommendations: Mapped[list[str]] = mapped_column(StringArray, default=list, nullable=False)
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_used: Mapped[str | None] = mapped_column(String(100), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── AI buyer brief ────────────────────────────────────────────────────────
    # {"summary": str, "good_for": [str], "watch_outs": [str], "verdict": str}
    # Cached: generated once by the owner, then served to every viewer. Charging
    # tokens per page view would be wasteful, and a listing summary that changes
    # on each refresh is not a summary.
    buyer_brief: Mapped[dict | None] = mapped_column(JsonB, nullable=True)
    buyer_brief_model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    buyer_brief_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    project: Mapped["Project"] = relationship("Project", back_populates="analysis")


class ProjectEventType(str, enum.Enum):
    """Lifecycle events that form a project's public progress timeline."""
    CREATED = "created"
    PROGRESS_UPDATE = "progress_update"   # manual, posted by the owner
    MILESTONE = "milestone"               # manual, posted by the owner
    VERIFIED = "verified"                 # Verified Build Score computed
    HACKATHON_VERIFIED = "hackathon_verified"
    ANALYSIS_COMPLETED = "analysis_completed"
    CONTRIBUTOR_JOINED = "contributor_joined"
    ADOPTED = "adopted"                   # ownership transferred
    LISTED_FOR_SALE = "listed_for_sale"
    SOLD = "sold"
    STAGE_CHANGED = "stage_changed"


class ProjectEvent(Base):
    """A single entry on the project's progress timeline.

    Most entries are recorded automatically as the project moves through the
    platform; owners can also post manual progress updates and milestones.
    """
    __tablename__ = "project_events"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    event_type: Mapped[ProjectEventType] = mapped_column(
        Enum(ProjectEventType, name="project_event_type"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Snapshot of reported progress at the time of a manual update.
    progress_percent: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_manual: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])
    actor: Mapped["User | None"] = relationship("User", foreign_keys=[actor_id])  # type: ignore


class ProjectPitchDeck(Base):
    """AI-generated pitch deck for a project (paid SKU).

    `slides` holds a JSON list of {title, headline, bullets[], speaker_note}.
    """
    __tablename__ = "project_pitch_decks"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        unique=True, nullable=False, index=True
    )
    status: Mapped[AnalysisStatus] = mapped_column(
        Enum(AnalysisStatus, name="analysis_status"),
        default=AnalysisStatus.PENDING,
        nullable=False,
    )
    slides: Mapped[dict | None] = mapped_column(JsonB, nullable=True)
    tagline: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_used: Mapped[str | None] = mapped_column(String(100), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_at: Mapped[str | None] = mapped_column(String(32), nullable=True)

    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])


class ProjectVerification(Base):
    __tablename__ = "project_verifications"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        unique=True, nullable=False, index=True
    )
    verified_build_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    ownership_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    hackathon_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    originality_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    repo_age_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    activity_consistency: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    # ── Score breakdown ───────────────────────────────────────────────────────
    # The scoring engine computes six weighted components, a confidence level
    # and a list of fraud flags. Persisting all of them is what makes the score
    # explainable: without these columns the UI can only show the composite and
    # has to infer the rest from the prose in `notes`.
    repo_maturity_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    commit_cadence_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    contributor_authenticity_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    documentation_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    # "low" | "medium" | "high" — how much data the score is based on.
    confidence: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # Machine-readable flag identifiers, e.g. ["forked_repo", "no_commit_history"].
    fraud_flags: Mapped[list | None] = mapped_column(JsonB, nullable=True)
    # Commits sampled / contributor count, kept so the UI can cite its evidence.
    commits_analyzed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    contributors_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("users.id"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    verified_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    hackathon_proof_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="verification")


class ContributorRequestStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class ContributorRequest(Base):
    __tablename__ = "contributor_requests"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    requester_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    status: Mapped[ContributorRequestStatus] = mapped_column(
        Enum(ContributorRequestStatus, name="contributor_request_status"),
        default=ContributorRequestStatus.PENDING,
        nullable=False,
    )
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    skills_offered: Mapped[list[str]] = mapped_column(StringArray, default=list, nullable=False)
    resolved_at: Mapped[str | None] = mapped_column(String(32), nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="contributor_requests")
    requester: Mapped["User"] = relationship("User", foreign_keys=[requester_id])  # type: ignore


class Collaboration(Base):
    __tablename__ = "collaborations"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(60), default="contributor", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    project: Mapped["Project"] = relationship("Project", back_populates="collaborations")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])  # type: ignore
