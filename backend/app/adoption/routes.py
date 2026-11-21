import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.adoption.schemas import (
    AdoptionRequestCreate,
    AdoptionRequestRead,
    AdoptionResolve,
    AdoptionToggle,
)
from app.adoption.service import AdoptionService
from app.core.database import get_db
from app.core.dependencies import get_current_verified_user
from app.users.models import User

router = APIRouter(prefix="/projects", tags=["adoption"])


@router.put("/{project_id}/adoption-status")
def set_adoption_status(
    project_id: uuid.UUID,
    data: AdoptionToggle,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Owner opens (or closes) their project for adoption."""
    svc = AdoptionService(db)
    project = svc.set_open_for_adoption(project_id, current_user.id, data.is_open_for_adoption)
    return {"is_open_for_adoption": project.is_open_for_adoption}


@router.post("/{project_id}/adoption-requests", response_model=AdoptionRequestRead, status_code=201)
def request_adoption(
    project_id: uuid.UUID,
    data: AdoptionRequestCreate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Ask to take over a project and continue building it."""
    svc = AdoptionService(db)
    return svc.request_adoption(project_id, current_user.id, data)


@router.get("/{project_id}/adoption-requests", response_model=list[AdoptionRequestRead])
def list_adoption_requests(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Owner views adoption requests for their project."""
    svc = AdoptionService(db)
    return svc.list_for_project(project_id, current_user.id)


@router.get("/{project_id}/adoption-requests/mine", response_model=AdoptionRequestRead | None)
def my_adoption_request(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = AdoptionService(db)
    return svc.my_request(project_id, current_user.id)


# Resolution actions live on a sibling prefix.
action_router = APIRouter(prefix="/adoption-requests", tags=["adoption"])


@action_router.put("/{request_id}/resolve", response_model=AdoptionRequestRead)
def resolve_adoption_request(
    request_id: uuid.UUID,
    data: AdoptionResolve,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Owner approves (transferring ownership) or declines an adoption request."""
    svc = AdoptionService(db)
    return svc.resolve(request_id, current_user.id, data.approve, data.note)


@action_router.put("/{request_id}/withdraw", response_model=AdoptionRequestRead)
def withdraw_adoption_request(
    request_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = AdoptionService(db)
    return svc.withdraw(request_id, current_user.id)
