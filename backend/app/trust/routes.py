import uuid

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.trust.schemas import (
    DuplicateFlagRead, DuplicateReviewRequest, HealthTrendRead, TrustReceiptRead,
)
from app.trust.service import DuplicateService, HealthMonitorService, TrustReceiptService
from app.users.models import User, UserRole

router = APIRouter(prefix="/trust", tags=["trust"])


# ── Trust receipts ────────────────────────────────────────────────────────────

@router.get("/receipts", response_model=list[TrustReceiptRead])
def list_my_receipts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every trust receipt from the current user's purchases."""
    return TrustReceiptService(db).list_for_buyer(current_user.id)


@router.get("/receipts/{receipt_id}", response_model=TrustReceiptRead)
def get_receipt(
    receipt_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return TrustReceiptService(db).get(receipt_id, current_user)


@router.get("/receipts/by-code/{code}", response_model=TrustReceiptRead)
def get_receipt_by_code(
    code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Look up a receipt by its printed code, e.g. when citing it in a dispute."""
    return TrustReceiptService(db).get_by_code(code, current_user)


# ── Post-purchase health ──────────────────────────────────────────────────────

@router.get("/purchases", response_model=list[HealthTrendRead])
def list_purchase_health(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Health trends for everything the current user has bought."""
    return HealthMonitorService(db).list_for_buyer(current_user.id)


@router.get("/purchases/{project_id}", response_model=HealthTrendRead)
def get_purchase_health(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return HealthMonitorService(db).trend(project_id, current_user.id)


@router.post("/purchases/{project_id}/recheck", status_code=202)
def recheck_purchase_health(
    project_id: uuid.UUID,
    x_github_token: str | None = Header(default=None, alias="X-GitHub-Token"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rescore a purchased project now instead of waiting for the weekly run.

    Confirms the caller is actually watching this project before queueing work —
    otherwise this is a free way to make the platform hammer GitHub.
    """
    HealthMonitorService(db).trend(project_id, current_user.id)  # raises if not watching

    from app.tasks.trust_tasks import rescore_single_project

    task = rescore_single_project.delay(str(project_id), x_github_token)
    return {"task_id": task.id, "status": "queued"}


# ── Duplicate review (admin) ──────────────────────────────────────────────────

def _flag_payload(flag) -> DuplicateFlagRead:
    matched = flag.matched_project
    owner_name = None
    if matched is not None and getattr(matched, "owner", None) is not None:
        profile = getattr(matched.owner, "profile", None)
        owner_name = getattr(profile, "display_name", None)
    return DuplicateFlagRead(
        id=flag.id,
        project_id=flag.project_id,
        matched_project_id=flag.matched_project_id,
        similarity=flag.similarity,
        signals=flag.signals or [],
        status=flag.status,
        review_note=flag.review_note,
        reviewed_at=flag.reviewed_at,
        created_at=flag.created_at,
        project_title=getattr(flag.project, "title", None),
        matched_project_title=getattr(matched, "title", None),
        matched_repo_full_name=getattr(matched, "repo_full_name", None),
        matched_owner_name=owner_name,
    )


@router.get("/duplicates", response_model=list[DuplicateFlagRead])
def list_duplicate_flags(
    _: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    return [_flag_payload(f) for f in DuplicateService(db).list_pending()]


@router.post("/duplicates/{flag_id}/review", response_model=DuplicateFlagRead)
def review_duplicate_flag(
    flag_id: uuid.UUID,
    data: DuplicateReviewRequest,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    flag = DuplicateService(db).review(
        flag_id, admin, confirm=data.confirm, note=data.note
    )
    return _flag_payload(flag)


@router.get("/projects/{project_id}/duplicates", response_model=list[DuplicateFlagRead])
def list_project_duplicates(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Similarity flags on one project.

    Visible to the project's owner and to admins. A builder whose listing is held
    back is entitled to see exactly what it was matched against and why —
    withholding a listing without telling the owner the reason is not moderation,
    it's a black box.
    """
    from app.core.exceptions import ForbiddenError
    from app.projects.repository import ProjectRepository

    project = ProjectRepository(db).get_by_id(project_id)
    if not project:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Project")
    if current_user.role != UserRole.ADMIN and project.owner_id != current_user.id:
        raise ForbiddenError("Only the owner can see similarity flags for a project")

    return [_flag_payload(f) for f in DuplicateService(db).list_for_project(project_id)]
