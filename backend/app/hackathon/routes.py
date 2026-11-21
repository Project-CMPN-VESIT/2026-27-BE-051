import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_verified_user, require_role
from app.core.exceptions import ValidationError
from app.hackathon.schemas import ClaimCreate, ClaimRead, ClaimReview
from app.hackathon.service import HackathonService
from app.users.models import User, UserRole

router = APIRouter(prefix="/hackathons", tags=["hackathons"])


@router.post("/claims", response_model=ClaimRead, status_code=201)
def create_claim(
    data: ClaimCreate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return HackathonService(db).create_claim(current_user, data)


@router.post("/claims/{claim_id}/analyze", response_model=ClaimRead)
async def analyze_claim(
    claim_id: uuid.UUID,
    x_github_token: Annotated[str | None, Header()] = None,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    if not x_github_token:
        raise ValidationError("X-GitHub-Token header required to analyse commit timeline")
    return await HackathonService(db).analyze_claim(current_user, claim_id, x_github_token)


@router.get("/claims/{claim_id}", response_model=ClaimRead)
def get_claim(claim_id: uuid.UUID, db: Session = Depends(get_db)):
    return HackathonService(db).get_claim(claim_id)


@router.get("/projects/{project_id}/claim", response_model=ClaimRead | None)
def get_project_claim(project_id: uuid.UUID, db: Session = Depends(get_db)):
    return HackathonService(db).get_by_project(project_id)


# ── Admin review workflow ─────────────────────────────────────────────────────

@router.get("/admin/pending", response_model=list[ClaimRead])
def list_pending(
    _admin: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    return HackathonService(db).list_for_review()


@router.post("/claims/{claim_id}/review", response_model=ClaimRead)
def review_claim(
    claim_id: uuid.UUID,
    data: ClaimReview,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    return HackathonService(db).review(admin, claim_id, data.approve, data.notes)
