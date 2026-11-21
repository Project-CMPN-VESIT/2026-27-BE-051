import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_verified_user
from app.incubation.schemas import DiscoverProject, OfferCreate, OfferRead, OfferRespond
from app.incubation.service import IncubationService
from app.users.models import User

router = APIRouter(prefix="/incubation", tags=["incubation"])


@router.get("/discover", response_model=list[DiscoverProject])
def discover(limit: int = 20, db: Session = Depends(get_db)):
    return IncubationService(db).discover(min(max(limit, 1), 50))


@router.post("/offers", response_model=OfferRead, status_code=201)
def create_offer(
    data: OfferCreate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return IncubationService(db).create_offer(current_user, data)


@router.get("/offers/received", response_model=list[OfferRead])
def received_offers(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return IncubationService(db).list_received(current_user)


@router.get("/offers/sent", response_model=list[OfferRead])
def sent_offers(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return IncubationService(db).list_sent(current_user)


@router.post("/offers/{offer_id}/respond", response_model=OfferRead)
def respond_offer(
    offer_id: uuid.UUID,
    data: OfferRespond,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return IncubationService(db).respond(current_user, offer_id, data.accept, data.note)


@router.post("/offers/{offer_id}/withdraw", response_model=OfferRead)
def withdraw_offer(
    offer_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return IncubationService(db).withdraw(current_user, offer_id)
