import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.escrow.models import (
    DisputeStatus,
    EscrowContractStatus,
    EscrowEntryType,
    MilestoneStatus,
)


# ── Inputs ──────────────────────────────────────────────────────────────────

class MilestoneCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    amount_paise: int = Field(gt=0)
    due_date: datetime | None = None


class ContractCreate(BaseModel):
    builder_id: uuid.UUID
    project_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    commission_bps: int = Field(default=1000, ge=0, le=3000)  # cap platform fee at 30%
    milestones: list[MilestoneCreate] = Field(min_length=1)

    @field_validator("milestones")
    @classmethod
    def _at_least_one(cls, v: list[MilestoneCreate]) -> list[MilestoneCreate]:
        if not v:
            raise ValueError("A contract needs at least one milestone")
        return v


class MilestoneSubmit(BaseModel):
    proof_url: str | None = Field(default=None, max_length=2000)
    proof_note: str | None = Field(default=None, max_length=4000)


class DisputeCreate(BaseModel):
    milestone_id: uuid.UUID | None = None
    reason: str = Field(min_length=5, max_length=4000)


class DisputeResolve(BaseModel):
    resolution: DisputeStatus  # RESOLVED_RELEASE | RESOLVED_REFUND | RESOLVED_SPLIT
    note: str | None = Field(default=None, max_length=4000)


# ── Outputs ─────────────────────────────────────────────────────────────────

class MilestoneRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    sequence: int
    title: str
    description: str | None
    amount_paise: int
    status: MilestoneStatus
    proof_url: str | None
    proof_note: str | None
    due_date: datetime | None
    submitted_at: datetime | None
    approved_at: datetime | None
    released_at: datetime | None


class LedgerEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    entry_type: EscrowEntryType
    amount_paise: int
    note: str | None
    milestone_id: uuid.UUID | None
    created_at: datetime


class DisputeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    milestone_id: uuid.UUID | None
    raised_by_id: uuid.UUID
    reason: str
    status: DisputeStatus
    resolution_note: str | None
    resolved_at: datetime | None
    created_at: datetime


class ContractRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    client_id: uuid.UUID
    builder_id: uuid.UUID
    project_id: uuid.UUID | None
    title: str
    description: str | None
    total_amount_paise: int
    currency: str
    commission_bps: int
    status: EscrowContractStatus
    funded_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    milestones: list[MilestoneRead] = []


class ContractDetail(ContractRead):
    ledger_entries: list[LedgerEntryRead] = []
    disputes: list[DisputeRead] = []


class FundingResponse(BaseModel):
    contract_id: uuid.UUID
    order_id: str | None
    cf_order_token: str | None
    amount_paise: int
    dev_mode: bool = False  # True when Cashfree isn't configured and funding was simulated
