from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_verified_user
from app.moderation.schemas import ReportCreate, ReportRead
from app.moderation.service import ModerationService
from app.users.models import User

router = APIRouter(prefix="/reports", tags=["moderation"])


@router.post("", response_model=ReportRead, status_code=201)
def create_report(
    data: ReportCreate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Report a project (or other target) for moderation review."""
    svc = ModerationService(db)
    return svc.create_report(current_user.id, data)
