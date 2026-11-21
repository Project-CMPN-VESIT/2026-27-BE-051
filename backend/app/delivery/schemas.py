import uuid

from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    builder_id: uuid.UUID
    promised_days: int = Field(ge=1, le=365)
    milestone_count: int = Field(default=1, ge=1, le=50)


class DeliveryPredictionRead(BaseModel):
    completion_probability: int
    confidence: int
    delay_risk: str
    realistic_timeline_days: int
    promised_days: int
    sample_size: int
    rationale: str


class DeliveryStatsRead(BaseModel):
    builder_id: uuid.UUID
    milestones_tracked: int
    on_time_rate: float | None
    avg_turnaround_days: float | None
    contracts_completed: int
    sample_size: int
