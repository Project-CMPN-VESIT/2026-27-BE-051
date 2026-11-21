import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.dependencies import get_current_verified_user
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.notifications.models import NotificationType
from app.notifications.service import NotificationService
from app.projects.models import Project
from app.reviews.models import Review, ReviewRole
from app.users.models import User, UserRole


# ── Schemas ───────────────────────────────────────────────────────────────────

class ReviewCreate(BaseModel):
    overall_score: int = Field(..., ge=1, le=5)
    code_quality: int | None = Field(None, ge=1, le=5)
    idea_score: int | None = Field(None, ge=1, le=5)
    market_potential: int | None = Field(None, ge=1, le=5)
    headline: str = Field(..., min_length=5, max_length=200)
    body: str = Field(..., min_length=20, max_length=3000)
    is_public: bool = True


class ProfileSnippet(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    display_name: str
    avatar_url: str | None = None


class ReviewerPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    profile: ProfileSnippet | None = None


class ReviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    reviewer_id: uuid.UUID
    reviewer_role: ReviewRole
    overall_score: int
    code_quality: int | None
    idea_score: int | None
    market_potential: int | None
    headline: str
    body: str
    is_public: bool
    created_at: datetime
    reviewer: ReviewerPublic | None = None


# ── Routes ────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/projects/{project_id}/reviews", tags=["reviews"])


def _get_project(project_id: uuid.UUID, db: Session) -> Project:
    p = db.query(Project).filter(Project.id == project_id, Project.is_deleted == False).first()
    if not p:
        raise NotFoundError("Project")
    return p


@router.get("", response_model=list[ReviewRead])
def list_reviews(project_id: uuid.UUID, db: Session = Depends(get_db)):
    return (
        db.query(Review)
        .options(joinedload(Review.reviewer))
        .filter(Review.project_id == project_id, Review.is_public == True)
        .order_by(desc(Review.created_at))
        .all()
    )


@router.post("", response_model=ReviewRead, status_code=201)
def create_review(
    project_id: uuid.UUID,
    data: ReviewCreate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    project = _get_project(project_id, db)

    if project.owner_id == current_user.id:
        raise ValidationError("You cannot review your own project")

    existing = db.query(Review).filter(
        Review.project_id == project_id, Review.reviewer_id == current_user.id
    ).first()
    if existing:
        raise ConflictError("You have already reviewed this project")

    role_map = {
        UserRole.MENTOR: ReviewRole.MENTOR,
        UserRole.FOUNDER: ReviewRole.FOUNDER,
        UserRole.CONTRIBUTOR: ReviewRole.CONTRIBUTOR,
    }
    reviewer_role = role_map.get(current_user.role, ReviewRole.USER)

    review = Review(
        project_id=project_id,
        reviewer_id=current_user.id,
        reviewer_role=reviewer_role,
        **data.model_dump(),
    )
    db.add(review)
    db.flush()

    # Notify project owner
    svc = NotificationService(db)
    reviewer_name = current_user.profile.display_name if current_user.profile else "Someone"
    svc.create(
        recipient_id=project.owner_id,
        type=NotificationType.NEW_REVIEW,
        title=f"New review on {project.title}",
        body=f"{reviewer_name} gave it {data.overall_score}/5 stars",
        link=f"/projects/{project_id}",
    )

    db.commit()
    db.refresh(review)
    return review


@router.delete("/{review_id}", status_code=204)
def delete_review(
    project_id: uuid.UUID,
    review_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    review = db.query(Review).filter(
        Review.id == review_id, Review.project_id == project_id
    ).first()
    if not review:
        raise NotFoundError("Review")
    if review.reviewer_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise ForbiddenError("Not your review")
    db.delete(review)
    db.commit()
