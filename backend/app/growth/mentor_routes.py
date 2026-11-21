"""API surface for the AI mentor and the human mentor directory."""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_verified_user
from app.core.exceptions import ForbiddenError, NotFoundError
from app.growth.mentors import (
    AIMentorService, MentorDirectoryService, weakest_components,
)
from app.users.models import User

router = APIRouter(prefix="/mentors", tags=["mentors"])


# ══════════════════════════════════════════════════════════════════════════════
# AI mentor
# ══════════════════════════════════════════════════════════════════════════════

class ChatMessageRead(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


@router.get("/ai/{project_id}/history", response_model=list[ChatMessageRead])
def mentor_history(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Prior conversation for this project. Owner only."""
    return AIMentorService(db).history(project_id, current_user)


@router.post("/ai/{project_id}/ask", response_model=ChatMessageRead)
async def mentor_ask(
    project_id: uuid.UUID,
    data: AskRequest,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Ask the AI mentor about this project, grounded in its real data."""
    return await AIMentorService(db).ask(project_id, current_user, data.question)


@router.delete("/ai/{project_id}/history", status_code=204)
def mentor_clear(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    AIMentorService(db).clear(project_id, current_user)


class ImprovementComponent(BaseModel):
    key: str
    label: str
    score: int
    weight: float
    """Composite points still recoverable from this component."""
    points_available: float
    explains: str


class ImprovementPlan(BaseModel):
    verified_build_score: int | None
    verified_threshold: int
    is_verified: bool
    points_needed: int
    """Lowest-scoring components first, weighted by what they're worth."""
    weakest: list[ImprovementComponent]
    suggested_questions: list[str]


@router.get("/ai/{project_id}/improvement-plan", response_model=ImprovementPlan)
def improvement_plan(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """What to fix, worth-most first — turns a low score into a next step.

    Deterministic: this is arithmetic over the stored components, not an AI call,
    so it works with no provider configured and always agrees with the score.
    """
    from app.projects.repository import ProjectRepository
    from app.verification import scoring

    repo = ProjectRepository(db)
    project = repo.get_by_id(project_id)
    if not project:
        raise NotFoundError("Project")
    if project.owner_id != current_user.id and current_user.role.value != "admin":
        raise ForbiddenError("You can only see the plan for your own project")

    v = repo.get_verification(project_id)
    score = v.verified_build_score if v else None
    weakest = weakest_components(db, project)

    questions = ["How do I improve my build score?"]
    if weakest:
        questions.append(f"How do I raise my {weakest[0]['label'].lower()} score?")
    if v and v.fraud_flags:
        questions.append(f"What does the {v.fraud_flags[0]} flag mean?")
    if project.is_for_sale:
        questions.append("Is my asking price reasonable?")
    else:
        questions.append("What should I price this at?")

    return ImprovementPlan(
        verified_build_score=score,
        verified_threshold=scoring.VERIFIED_THRESHOLD,
        is_verified=project.is_verified,
        points_needed=max(0, scoring.VERIFIED_THRESHOLD - (score or 0)),
        weakest=[ImprovementComponent(**c) for c in weakest[:4]],
        suggested_questions=questions[:4],
    )


# ══════════════════════════════════════════════════════════════════════════════
# Human mentor directory
# ══════════════════════════════════════════════════════════════════════════════

class MentorRead(BaseModel):
    user_id: uuid.UUID
    display_name: str
    avatar_url: str | None
    headline: str
    bio: str
    focus_areas: list[str] = []
    years_experience: int | None
    company: str | None
    rate_paise_per_hour: int | None
    is_accepting: bool
    sessions_completed: int


@router.get("", response_model=list[MentorRead])
def list_mentors(
    accepting_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    """Public mentor directory — browsable without an account."""
    out = []
    for p in MentorDirectoryService(db).list_mentors(accepting_only=accepting_only):
        profile = p.user.profile if p.user else None
        out.append(MentorRead(
            user_id=p.user_id,
            display_name=(profile.display_name if profile else None) or "Mentor",
            avatar_url=profile.avatar_url if profile else None,
            headline=p.headline,
            bio=p.bio,
            focus_areas=list(p.focus_areas or []),
            years_experience=p.years_experience,
            company=p.company,
            rate_paise_per_hour=p.rate_paise_per_hour,
            is_accepting=p.is_accepting,
            sessions_completed=p.sessions_completed,
        ))
    return out


class SessionRequest(BaseModel):
    mentor_id: uuid.UUID
    topic: str = Field(min_length=3, max_length=200)
    message: str = Field(min_length=10, max_length=4000)
    project_id: uuid.UUID | None = None


class SessionRead(BaseModel):
    id: uuid.UUID
    mentor_id: uuid.UUID
    builder_id: uuid.UUID
    project_id: uuid.UUID | None
    topic: str
    message: str
    status: str
    mentor_reply: str | None
    responded_at: datetime | None
    created_at: datetime


class SessionRespond(BaseModel):
    status: str = Field(pattern="^(accepted|declined|completed)$")
    reply: str | None = Field(default=None, max_length=4000)


@router.post("/sessions", response_model=SessionRead, status_code=201)
def request_session(
    data: SessionRequest,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return MentorDirectoryService(db).request_session(
        current_user, data.mentor_id, data.topic, data.message, data.project_id,
    )


@router.get("/sessions/mine", response_model=list[SessionRead])
def my_requests(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Requests this user has sent as a builder."""
    return MentorDirectoryService(db).for_builder(current_user.id)


@router.get("/sessions/incoming", response_model=list[SessionRead])
def incoming_requests(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Requests addressed to this user as a mentor."""
    return MentorDirectoryService(db).for_mentor(current_user.id)


@router.put("/sessions/{session_id}/respond", response_model=SessionRead)
def respond_to_session(
    session_id: uuid.UUID,
    data: SessionRespond,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return MentorDirectoryService(db).respond(
        current_user, session_id, data.status, data.reply,
    )


@router.delete("/sessions/{session_id}", status_code=204)
def withdraw_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    MentorDirectoryService(db).withdraw(current_user, session_id)
