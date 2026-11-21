from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_verified_user
from app.growth.schemas import CampusLeaderboard, ReferralRead
from app.growth.service import GrowthService
from app.users.models import User

router = APIRouter(prefix="/growth", tags=["growth"])


@router.get("/referral", response_model=ReferralRead)
def my_referral(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return GrowthService(db).get_referral(current_user)


@router.post("/ambassador/apply", response_model=ReferralRead)
def apply_ambassador(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return GrowthService(db).apply_ambassador(current_user)


@router.get("/leaderboard/campus", response_model=CampusLeaderboard)
def campus_leaderboard(db: Session = Depends(get_db)):
    return GrowthService(db).campus_leaderboard()
