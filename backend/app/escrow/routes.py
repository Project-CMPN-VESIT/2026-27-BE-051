import uuid

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_verified_user
from app.escrow.schemas import (
    ContractCreate,
    ContractDetail,
    ContractRead,
    DisputeCreate,
    DisputeRead,
    DisputeResolve,
    FundingResponse,
    MilestoneRead,
    MilestoneSubmit,
)
from app.escrow.service import EscrowService
from app.users.models import User

router = APIRouter(prefix="/escrow", tags=["escrow"])


# ── Webhook (no auth; verified via signature) ──────────────────────────────────

@router.post("/webhook", status_code=200)
async def escrow_webhook(
    request: Request,
    x_webhook_signature: str | None = Header(None, alias="x-webhook-signature"),
    db: Session = Depends(get_db),
):
    payload = await request.body()
    return EscrowService(db).handle_funding_webhook(payload, x_webhook_signature or "")


# ── Contracts ───────────────────────────────────────────────────────────────

@router.post("/contracts", response_model=ContractDetail, status_code=201)
def create_contract(
    data: ContractCreate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return EscrowService(db).create_contract(current_user, data)


@router.get("/contracts", response_model=list[ContractRead])
def list_my_contracts(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return EscrowService(db).list_contracts(current_user)


@router.get("/contracts/{contract_id}", response_model=ContractDetail)
def get_contract(
    contract_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return EscrowService(db).get_contract(contract_id, current_user)


@router.post("/contracts/{contract_id}/fund", response_model=FundingResponse)
async def fund_contract(
    contract_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return await EscrowService(db).fund_contract(current_user, contract_id)


@router.post("/contracts/{contract_id}/cancel", response_model=ContractRead)
def cancel_contract(
    contract_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return EscrowService(db).cancel_contract(current_user, contract_id)


# ── Milestones ────────────────────────────────────────────────────────────────

@router.post("/milestones/{milestone_id}/submit", response_model=MilestoneRead)
def submit_milestone(
    milestone_id: uuid.UUID,
    data: MilestoneSubmit,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return EscrowService(db).submit_milestone(current_user, milestone_id, data)


@router.post("/milestones/{milestone_id}/approve", response_model=MilestoneRead)
def approve_milestone(
    milestone_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return EscrowService(db).approve_milestone(current_user, milestone_id)


@router.post("/milestones/{milestone_id}/reject", response_model=MilestoneRead)
def reject_milestone(
    milestone_id: uuid.UUID,
    data: MilestoneSubmit,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return EscrowService(db).reject_milestone(current_user, milestone_id, data.proof_note)


# ── Disputes ────────────────────────────────────────────────────────────────

@router.post("/contracts/{contract_id}/disputes", response_model=DisputeRead, status_code=201)
def raise_dispute(
    contract_id: uuid.UUID,
    data: DisputeCreate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return EscrowService(db).raise_dispute(current_user, contract_id, data)


@router.post("/disputes/{dispute_id}/resolve", response_model=DisputeRead)
def resolve_dispute(
    dispute_id: uuid.UUID,
    data: DisputeResolve,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return EscrowService(db).resolve_dispute(current_user, dispute_id, data)
