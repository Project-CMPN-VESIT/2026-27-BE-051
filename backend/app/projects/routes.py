import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_verified_user, get_optional_user
from app.projects.models import ContributorRequestStatus
from app.projects.schemas import (
    ContributorRequestCreate,
    ContributorRequestRead,
    ContributorRequestUpdate,
    PaginatedProjects,
    ProjectCreate,
    ProjectDeliveryRead,
    ProjectListItem,
    ProjectRead,
    ProjectUpdate,
    PitchDeckRead,
    BuyerBriefRead,
    ContributorMatchRead,
    TimelineEventCreate,
    TimelineEventRead,
    RiskAssessmentRead,
    RiskAreaRead,
    RiskFactorRead,
    CodeSignalsRead,
)
from app.trust.schemas import DependencyAuditRead
from app.projects.service import ProjectService
from app.users.models import User

router = APIRouter(prefix="/projects", tags=["projects"])


def _get_github_token(authorization: Annotated[str | None, Header()] = None) -> str | None:
    """Extract raw GitHub token from a custom header."""
    return None  # Placeholder — in production pass via X-GitHub-Token header


# ── Discovery ─────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedProjects)
def list_projects(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
    search: str | None = Query(None, max_length=100),
    language: str | None = None,
    stage: str | None = None,
    status: str | None = None,
    seeking_contributors: bool | None = None,
    for_sale: bool | None = None,
    sort_by: str = Query("created_at", pattern="^(created_at|stars|updated_at)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
):
    svc = ProjectService(db)
    items, total, pages = svc.list_projects(
        page=page,
        per_page=per_page,
        search=search,
        language=language,
        stage=stage,
        status=status,
        seeking_contributors=seeking_contributors,
        for_sale=for_sale,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    # Flatten analysis scores onto list items
    result = []
    for p in items:
        item = ProjectListItem.model_validate(p)
        if p.analysis:
            item.health_score = p.analysis.health_score
            item.startup_potential = p.analysis.startup_potential
        result.append(item)
    return PaginatedProjects(items=result, total=total, page=page, per_page=per_page, pages=pages)


@router.get("/trending", response_model=list[ProjectListItem])
def get_trending(db: Session = Depends(get_db)):
    svc = ProjectService(db)
    return svc.repo.get_trending()


@router.get("/high-potential", response_model=list[ProjectListItem])
def get_high_potential(db: Session = Depends(get_db)):
    svc = ProjectService(db)
    return svc.repo.get_high_potential()


@router.get("/seeking-contributors", response_model=list[ProjectListItem])
def get_seeking_contributors(db: Session = Depends(get_db)):
    svc = ProjectService(db)
    return svc.repo.get_seeking_contributors()


@router.get("/verified", response_model=list[ProjectListItem])
def get_verified(db: Session = Depends(get_db)):
    svc = ProjectService(db)
    return svc.repo.get_verified()


@router.get("/recently-revived", response_model=list[ProjectListItem])
def get_recently_revived(db: Session = Depends(get_db)):
    svc = ProjectService(db)
    return svc.repo.get_recently_revived()


@router.get("/for-sale", response_model=list[ProjectListItem])
def get_for_sale(db: Session = Depends(get_db)):
    svc = ProjectService(db)
    return svc.repo.get_for_sale()


@router.get("/mine", response_model=list[ProjectListItem])
def get_my_projects(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = ProjectService(db)
    return svc.get_my_projects(current_user.id)


# ── Single project ─────────────────────────────────────────────────────────────

@router.get("/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: uuid.UUID,
    viewer: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    svc = ProjectService(db)
    project = svc.get_project(project_id)

    # Best-effort view counter for the builder's analytics. Never raises, and the
    # owner's own views are counted separately so the figure shown to a builder
    # isn't inflated by their own refreshes.
    from app.growth.analytics import record_project_view

    record_project_view(
        db,
        project_id=project.id,
        owner_id=project.owner_id,
        viewer_id=viewer.id if viewer else None,
    )
    return project


@router.post("", response_model=ProjectRead, status_code=201)
async def import_project(
    data: ProjectCreate,
    x_github_token: Annotated[str | None, Header()] = None,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    if not x_github_token:
        from app.core.exceptions import ValidationError
        raise ValidationError("X-GitHub-Token header required to import a project")
    svc = ProjectService(db)
    return await svc.import_from_github(current_user, x_github_token, data)


@router.put("/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: uuid.UUID,
    data: ProjectUpdate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = ProjectService(db)
    return svc.update_project(project_id, current_user, data)


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = ProjectService(db)
    svc.delete_project(project_id, current_user)


@router.post("/{project_id}/sync", status_code=202)
def sync_project(
    project_id: uuid.UUID,
    x_github_token: Annotated[str | None, Header()] = None,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    if not x_github_token:
        from app.core.exceptions import ValidationError
        raise ValidationError("X-GitHub-Token header required")
    svc = ProjectService(db)
    svc.trigger_sync(project_id, current_user, x_github_token)
    return {"message": "Sync queued"}


# ── Analysis ──────────────────────────────────────────────────────────────────

@router.post("/{project_id}/analyze", status_code=202)
def trigger_analysis(
    project_id: uuid.UUID,
    x_github_token: Annotated[str | None, Header()] = None,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = ProjectService(db)
    return svc.trigger_analysis(project_id, current_user, x_github_token)


@router.get("/{project_id}/analysis/status")
def get_analysis_status(project_id: uuid.UUID, db: Session = Depends(get_db)):
    svc = ProjectService(db)
    return svc.get_analysis_status(project_id)


# ── Verification ──────────────────────────────────────────────────────────────

@router.post("/{project_id}/verify/ownership", status_code=200)
async def verify_ownership(
    project_id: uuid.UUID,
    x_github_token: Annotated[str | None, Header()] = None,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    if not x_github_token:
        from app.core.exceptions import ValidationError
        raise ValidationError("X-GitHub-Token header required")
    svc = ProjectService(db)
    return await svc.verify_ownership(project_id, current_user, x_github_token)


# ── Collaboration ─────────────────────────────────────────────────────────────

@router.post("/{project_id}/contributor-requests", response_model=ContributorRequestRead, status_code=201)
def create_contributor_request(
    project_id: uuid.UUID,
    data: ContributorRequestCreate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = ProjectService(db)
    return svc.create_contributor_request(project_id, current_user, data)


@router.get("/{project_id}/contributor-requests", response_model=list[ContributorRequestRead])
def list_contributor_requests(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = ProjectService(db)
    return svc.list_contributor_requests(project_id, current_user)


@router.put("/contributor-requests/{request_id}", response_model=ContributorRequestRead)
def resolve_contributor_request(
    request_id: uuid.UUID,
    data: ContributorRequestUpdate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = ProjectService(db)
    return svc.resolve_contributor_request(request_id, current_user, data.status)


@router.get("/{project_id}/collaborators")
def get_collaborators(project_id: uuid.UUID, db: Session = Depends(get_db)):
    svc = ProjectService(db)
    return svc.get_collaborators(project_id)


# ── Hackathon proof upload ────────────────────────────────────────────────────

import os, secrets
from fastapi import UploadFile, File

@router.post("/{project_id}/verify/hackathon", status_code=200)
async def upload_hackathon_proof(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Upload certificate/screenshot proving this was a hackathon project."""
    from app.core.config import get_settings
    from app.projects.repository import ProjectRepository
    from app.core.exceptions import ValidationError, ForbiddenError
    import boto3

    svc_settings = get_settings()
    project_repo = ProjectRepository(db)
    project = project_repo.get_by_id(project_id)
    if not project:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Project")
    if project.owner_id != current_user.id:
        raise ForbiddenError("Not your project")

    allowed = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
    if file.content_type not in allowed:
        raise ValidationError("File must be JPEG, PNG, WebP, or PDF")

    if not svc_settings.s3_access_key:
        # No S3 configured — store filename as proof URL for development
        proof_url = f"local://{file.filename}"
    else:
        ext = file.filename.rsplit(".", 1)[-1] if "." in (file.filename or "") else "bin"
        key = f"hackathon-proofs/{project_id}/{secrets.token_hex(8)}.{ext}"
        s3 = boto3.client(
            "s3",
            endpoint_url=svc_settings.s3_endpoint_url or None,
            aws_access_key_id=svc_settings.s3_access_key,
            aws_secret_access_key=svc_settings.s3_secret_key,
        )
        contents = await file.read()
        s3.put_object(Bucket=svc_settings.s3_bucket_name, Key=key, Body=contents, ContentType=file.content_type)
        proof_url = f"s3://{svc_settings.s3_bucket_name}/{key}"

    verification = project_repo.get_verification(project_id)
    if verification:
        project_repo.update_verification(verification, hackathon_proof_url=proof_url)
    db.commit()
    return {"proof_url": proof_url, "message": "Uploaded — pending admin review"}


# ── Project access check ──────────────────────────────────────────────────────

@router.get("/{project_id}/access")
def check_project_access(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Check if the current user has purchased access to this project."""
    from app.payments.models import ProjectAccess
    has_access = db.query(ProjectAccess).filter(
        ProjectAccess.project_id == project_id,
        ProjectAccess.user_id == current_user.id,
    ).first() is not None
    return {"has_access": has_access}


def _event_to_read(e) -> TimelineEventRead:
    actor_name = None
    if e.actor is not None:
        profile = getattr(e.actor, "profile", None)
        actor_name = (
            profile.display_name if profile and profile.display_name
            else e.actor.email.split("@")[0]
        )
    return TimelineEventRead(
        id=e.id,
        event_type=e.event_type.value if hasattr(e.event_type, "value") else str(e.event_type),
        title=e.title,
        description=e.description,
        progress_percent=e.progress_percent,
        is_manual=e.is_manual,
        actor_id=e.actor_id,
        actor_name=actor_name,
        created_at=e.created_at,
    )


@router.get("/{project_id}/risk", response_model=RiskAssessmentRead)
def get_project_risk(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Bug-risk assessment: deterministic score plus AI-identified risk areas."""
    from app.projects.risk import RiskService
    a = RiskService(db).assess(project_id)
    return RiskAssessmentRead(
        risk_score=a.risk_score,
        band=a.band,
        confidence=a.confidence,
        summary=a.summary,
        factors=[RiskFactorRead(**f.__dict__) for f in a.factors],
        risk_areas=[RiskAreaRead(**r) for r in a.risk_areas if isinstance(r, dict) and r.get("area")],
        code_reviewed=a.code_reviewed,
        code_signals=CodeSignalsRead(**a.code_signals) if a.code_signals else None,
        dependency_audit=(
            DependencyAuditRead(**a.dependency_audit)
            if a.dependency_audit and a.dependency_audit.get("scanned")
            else None
        ),
    )


@router.get("/{project_id}/timeline", response_model=list[TimelineEventRead])
def get_project_timeline(
    project_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Public progress timeline for a project."""
    from app.projects.timeline import TimelineService
    events = TimelineService(db).list_events(project_id, limit=limit)
    return [_event_to_read(e) for e in events]


@router.post("/{project_id}/timeline", response_model=TimelineEventRead, status_code=201)
def add_timeline_update(
    project_id: uuid.UUID,
    data: TimelineEventCreate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Owner or collaborator posts a progress update / milestone."""
    from app.projects.timeline import TimelineService
    event = TimelineService(db).add_update(
        project_id,
        current_user.id,
        title=data.title,
        description=data.description,
        progress_percent=data.progress_percent,
        is_milestone=data.is_milestone,
        is_admin=current_user.role.value == "admin",
    )
    db.refresh(event)
    return _event_to_read(event)


@router.delete("/timeline/{event_id}", status_code=204)
def delete_timeline_event(
    event_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Remove a manual timeline entry."""
    from app.projects.timeline import TimelineService
    TimelineService(db).delete_event(
        event_id, current_user.id, is_admin=current_user.role.value == "admin"
    )


@router.get("/{project_id}/contributor-matches", response_model=list[ContributorMatchRead])
def get_contributor_matches(
    project_id: uuid.UUID,
    limit: int = Query(10, ge=1, le=30),
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Ranked contributor suggestions for a project (owner or admin only)."""
    from app.projects.matching import ContributorMatchingService
    matches = ContributorMatchingService(db).find_matches(project_id, current_user, limit=limit)
    return [ContributorMatchRead(**m.__dict__) for m in matches]


# ── AI buyer brief ────────────────────────────────────────────────────────────

@router.get("/{project_id}/buyer-brief", response_model=BuyerBriefRead | None)
def get_buyer_brief(project_id: uuid.UUID, db: Session = Depends(get_db)):
    """Public: the cached plain-English "why buy this" brief, if one exists.

    Returns null rather than 404 when absent — the UI treats "no brief yet" as a
    normal state for a listing, not an error.
    """
    from app.core.exceptions import NotFoundError
    from app.projects.repository import ProjectRepository

    repo = ProjectRepository(db)
    if not repo.get_by_id(project_id):
        raise NotFoundError("Project")
    analysis = repo.get_analysis(project_id)
    if not analysis or not analysis.buyer_brief:
        return None

    brief = analysis.buyer_brief
    return BuyerBriefRead(
        summary=brief.get("summary", ""),
        good_for=brief.get("good_for", []),
        watch_outs=brief.get("watch_outs", []),
        verdict=brief.get("verdict", ""),
        model_used=analysis.buyer_brief_model,
        generated_at=analysis.buyer_brief_at,
    )


@router.post("/{project_id}/buyer-brief/generate", response_model=BuyerBriefRead)
async def generate_buyer_brief(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Generate the buyer brief. Owner or admin only — it costs tokens.

    Grounded in the verification result so the brief cannot contradict the score
    shown beside it on the listing.
    """
    from datetime import datetime, timezone

    from app.ai.service import AIAnalysisService, AIUnavailableError
    from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
    from app.projects.repository import ProjectRepository

    repo = ProjectRepository(db)
    project = repo.get_by_id(project_id)
    if not project:
        raise NotFoundError("Project")
    is_admin = current_user.role.value == "admin"
    if project.owner_id != current_user.id and not is_admin:
        raise ForbiddenError("Only the project owner can generate the buyer brief")

    svc = AIAnalysisService()
    if not svc.available:
        raise ValidationError(
            "AI is not configured on this deployment, so a brief can't be "
            "generated. Set an OpenRouter or Gemini API key to enable it."
        )

    verification = repo.get_verification(project_id)
    analysis = repo.get_analysis(project_id)

    # Deliberately no live README fetch. It would need a GitHub token this route
    # doesn't have, and everything load-bearing for a buyer's brief — the score,
    # its components, the flags, the confidence — is already on the verification
    # row. Adding a network dependency that can only degrade the result is not
    # worth the extra context.
    readme = None

    try:
        brief = await svc.why_buy_summary(
            title=project.title,
            repo_full_name=project.repo_full_name,
            description=project.description,
            readme=readme,
            languages=[l.language for l in (project.languages or [])],
            topics=list(project.topics or []),
            verified_build_score=verification.verified_build_score if verification else None,
            is_verified=project.is_verified,
            confidence=verification.confidence if verification else None,
            fraud_flags=list((verification.fraud_flags if verification else None) or []),
            commits_analyzed=verification.commits_analyzed if verification else None,
            contributors_count=verification.contributors_count if verification else None,
            repo_age_days=verification.repo_age_days if verification else None,
            price_paise=project.price_paise,
            analysis_summary=(analysis.reasoning if analysis else None),
        )
    except AIUnavailableError as exc:
        raise ValidationError(str(exc)) from exc
    except Exception as exc:
        raise ValidationError(f"Couldn't generate the brief: {exc}") from exc

    repo.update_analysis(
        analysis,
        buyer_brief={
            "summary": brief["summary"],
            "good_for": brief["good_for"],
            "watch_outs": brief["watch_outs"],
            "verdict": brief["verdict"],
        },
        buyer_brief_model=brief["model_used"],
        buyer_brief_at=datetime.now(timezone.utc),
    )
    db.commit()

    return BuyerBriefRead(
        summary=brief["summary"],
        good_for=brief["good_for"],
        watch_outs=brief["watch_outs"],
        verdict=brief["verdict"],
        model_used=brief["model_used"],
        generated_at=analysis.buyer_brief_at,
    )


@router.get("/{project_id}/pitch-deck", response_model=PitchDeckRead | None)
def get_pitch_deck(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Public: fetch a generated pitch deck (it's a marketing asset)."""
    from app.projects.pitchdeck import PitchDeckService
    rec = PitchDeckService(db).get_record(project_id)
    if not rec:
        return None
    return PitchDeckRead(
        status=rec.status.value,
        tagline=rec.tagline,
        slides=(rec.slides or {}).get("slides", []),
        model_used=rec.model_used,
        generated_at=rec.generated_at,
        error_message=rec.error_message,
    )


@router.post("/{project_id}/pitch-deck/generate", response_model=PitchDeckRead)
async def generate_pitch_deck(
    project_id: uuid.UUID,
    x_github_token: Annotated[str | None, Header()] = None,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Owner generates (or regenerates) the AI pitch deck. Requires purchase."""
    from app.projects.pitchdeck import PitchDeckService
    rec = await PitchDeckService(db).generate(
        project_id,
        current_user.id,
        is_admin=current_user.role.value == "admin",
        github_token=x_github_token,
    )
    return PitchDeckRead(
        status=rec.status.value,
        tagline=rec.tagline,
        slides=(rec.slides or {}).get("slides", []),
        model_used=rec.model_used,
        generated_at=rec.generated_at,
        error_message=rec.error_message,
    )


class SlideRefine(BaseModel):
    instruction: str = Field(min_length=3, max_length=500)


@router.post("/{project_id}/pitch-deck/slides/{slide_index}/refine",
             response_model=PitchDeckRead)
async def refine_pitch_deck_slide(
    project_id: uuid.UUID,
    slide_index: int,
    data: SlideRefine,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Rewrite one narrative slide from a plain-English instruction.

    Refuses on computed slides (score, traction): those are built from database
    rows, and letting an instruction like "make this more impressive" touch them
    would turn verifiable evidence back into marketing copy.
    """
    from app.projects.pitchdeck import PitchDeckService

    rec = await PitchDeckService(db).refine_slide(
        project_id,
        current_user.id,
        slide_index,
        data.instruction,
        is_admin=current_user.role.value == "admin",
    )
    return PitchDeckRead(
        status=rec.status.value,
        tagline=rec.tagline,
        slides=(rec.slides or {}).get("slides", []),
        model_used=rec.model_used,
        generated_at=rec.generated_at,
        error_message=rec.error_message,
    )


@router.get("/{project_id}/pitch-deck/export.md")
def export_pitch_deck_markdown(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Markdown export, for pasting into an email or a doc.

    Public, like the deck itself — it's a marketing asset, and a deck nobody can
    forward is not much use to the builder.
    """
    from fastapi.responses import PlainTextResponse

    from app.core.exceptions import NotFoundError as _NF
    from app.projects.deck_builder import deck_as_markdown
    from app.projects.pitchdeck import PitchDeckService
    from app.projects.repository import ProjectRepository as _PR

    project = _PR(db).get_by_id(project_id)
    if not project:
        raise _NF("Project")

    rec = PitchDeckService(db).get_record(project_id)
    slides = (rec.slides or {}).get("slides", []) if rec else []
    if not slides:
        raise _NF("Pitch deck")

    slug = project.repo_full_name.replace("/", "-")
    return PlainTextResponse(
        deck_as_markdown(project, rec.tagline if rec else None, slides),
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{slug}-pitch-deck.md"',
        },
    )


@router.get("/{project_id}/delivery", response_model=ProjectDeliveryRead)
def get_project_delivery(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Return the private delivery payload (download link, setup notes, license).

    Only the project owner, an admin, or a user who has purchased access may view it.
    """
    from app.core.exceptions import ForbiddenError, NotFoundError
    from app.payments.models import ProjectAccess
    from app.projects.repository import ProjectRepository

    project = ProjectRepository(db).get_by_id(project_id)
    if not project:
        raise NotFoundError("Project")

    is_owner = project.owner_id == current_user.id
    is_admin = current_user.role.value == "admin"
    has_access = db.query(ProjectAccess).filter(
        ProjectAccess.project_id == project_id,
        ProjectAccess.user_id == current_user.id,
    ).first() is not None

    if not (is_owner or is_admin or has_access):
        raise ForbiddenError("Purchase this project to view its delivery details")

    return ProjectDeliveryRead(
        delivery_url=project.delivery_url,
        delivery_instructions=project.delivery_instructions,
        sale_license=project.sale_license,
        has_delivery=bool(project.delivery_url or project.delivery_instructions),
    )
