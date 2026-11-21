import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.build_requests.schemas import (
    BuildApplicationCreate,
    BuildApplicationRead,
    BuildRequestCreate,
    BuildRequestListItem,
    BuildRequestRead,
    BuildRequestUpdate,
)
from app.build_requests.service import BuildRequestService
from app.core.database import get_db
from app.core.dependencies import get_current_verified_user, get_optional_user
from app.users.models import User

router = APIRouter(prefix="/build-requests", tags=["build-requests"])


def _to_list_item(svc: BuildRequestService, req) -> BuildRequestListItem:
    item = BuildRequestListItem.model_validate(req)
    item.application_count = svc.application_count(req.id)
    return item


# ── Discovery ───────────────────────────────────────────────────────────────

@router.get("", response_model=list[BuildRequestListItem])
def list_requests(
    search: str | None = Query(None, max_length=100),
    skill: str | None = Query(None, max_length=60),
    db: Session = Depends(get_db),
):
    svc = BuildRequestService(db)
    return [_to_list_item(svc, r) for r in svc.list_open(search=search, skill=skill)]


@router.get("/mine", response_model=list[BuildRequestListItem])
def my_requests(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = BuildRequestService(db)
    return [_to_list_item(svc, r) for r in svc.list_mine(current_user.id)]


@router.get("/assigned", response_model=list[BuildRequestListItem])
def assigned_requests(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = BuildRequestService(db)
    return [_to_list_item(svc, r) for r in svc.list_assigned(current_user.id)]


@router.get("/{request_id}", response_model=BuildRequestRead)
def get_request(
    request_id: uuid.UUID,
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    svc = BuildRequestService(db)
    req = svc.get(request_id)
    out = BuildRequestRead.model_validate(req)
    out.application_count = svc.application_count(request_id)
    if current_user:
        mine = svc.my_application(request_id, current_user.id)
        if mine:
            out.my_application = BuildApplicationRead.model_validate(mine)
    return out


@router.post("", response_model=BuildRequestRead, status_code=201)
def create_request(
    data: BuildRequestCreate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = BuildRequestService(db)
    return svc.create(current_user.id, data)


@router.put("/{request_id}", response_model=BuildRequestRead)
def update_request(
    request_id: uuid.UUID,
    data: BuildRequestUpdate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = BuildRequestService(db)
    return svc.update_status(request_id, current_user.id, data.status)


# ── Applications ──────────────────────────────────────────────────────────────

@router.post("/{request_id}/applications", response_model=BuildApplicationRead, status_code=201)
def apply_to_request(
    request_id: uuid.UUID,
    data: BuildApplicationCreate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = BuildRequestService(db)
    return svc.apply(request_id, current_user.id, data)


@router.get("/{request_id}/applications", response_model=list[BuildApplicationRead])
def list_applications(
    request_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = BuildRequestService(db)
    return svc.list_applications(request_id, current_user.id)


# Applications live under a sibling prefix for accept/reject/withdraw actions.
app_router = APIRouter(prefix="/build-applications", tags=["build-requests"])


@app_router.put("/{application_id}/accept", response_model=BuildApplicationRead)
def accept_application(
    application_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = BuildRequestService(db)
    return svc.accept_application(application_id, current_user.id)


@app_router.put("/{application_id}/reject", response_model=BuildApplicationRead)
def reject_application(
    application_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = BuildRequestService(db)
    return svc.reject_application(application_id, current_user.id)


@app_router.put("/{application_id}/withdraw", response_model=BuildApplicationRead)
def withdraw_application(
    application_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = BuildRequestService(db)
    return svc.withdraw_application(application_id, current_user.id)
