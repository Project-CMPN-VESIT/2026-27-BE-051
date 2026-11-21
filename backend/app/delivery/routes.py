import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_verified_user
from app.delivery.schemas import DeliveryPredictionRead, DeliveryStatsRead, PredictRequest
from app.delivery.service import DeliveryService
from app.users.models import User

router = APIRouter(prefix="/delivery", tags=["delivery"])


@router.post("/predict", response_model=DeliveryPredictionRead)
def predict_delivery(
    data: PredictRequest,
    _current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Predict on-time delivery confidence for a builder given a promised timeline."""
    svc = DeliveryService(db)
    return svc.predict_for(data.builder_id, data.promised_days, data.milestone_count)


@router.get("/builders/{builder_id}", response_model=DeliveryStatsRead)
def builder_delivery_stats(builder_id: uuid.UUID, db: Session = Depends(get_db)):
    """Public delivery-reliability summary for a builder profile."""
    svc = DeliveryService(db)
    return svc.stats_for(builder_id)
