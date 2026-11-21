import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_current_verified_user
from app.users.models import User
from app.users.schemas import (
    BuilderDirectoryEntry,
    ContactInfo,
    LeaderboardEntry,
    PayoutDetailRead,
    PayoutDetailUpdate,
    ProfileUpdate,
    ReputationDetail,
    RoleUpdate,
    UserPublic,
    UserRead,
)
from app.users.service import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)):
    """The caller's own record. Deliberately *not* behind the verified-user guard.

    Registration issues a session before the email is confirmed, so when
    verification is required this endpoint is the only way the client can tell
    "your token is bad" (401) apart from "your email isn't confirmed yet"
    (is_verified=false). Gating it on verification returned 403 to a user who had
    just signed up successfully, and the frontend — unable to resolve an
    identity — fell back to rendering the signed-out navbar on their dashboard.

    No exposure: the response is the caller's own row, and `is_verified` is part
    of it. Every endpoint that *acts* stays behind get_current_verified_user.
    """
    return current_user


@router.put("/me/profile", response_model=UserRead)
def update_my_profile(
    data: ProfileUpdate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = UserService(db)
    return svc.update_profile(current_user.id, data)


@router.post("/me/reputation/recompute", response_model=ReputationDetail)
def recompute_my_reputation(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    svc = UserService(db)
    return svc.recompute_reputation(current_user.id)


def _mask_tail(value: str | None, keep: int = 4) -> str | None:
    if not value:
        return None
    if len(value) <= keep:
        return "•" * len(value)
    return "•" * (len(value) - keep) + value[-keep:]


def _payout_to_read(detail) -> PayoutDetailRead:
    return PayoutDetailRead(
        method=detail.method,
        upi_id=detail.upi_id,
        account_holder_name=detail.account_holder_name,
        account_number_masked=_mask_tail(detail.account_number),
        ifsc=detail.ifsc,
        pan_masked=_mask_tail(detail.pan),
        is_verified=detail.is_verified,
    )


@router.get("/me/payout-details", response_model=PayoutDetailRead | None)
def get_my_payout_details(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Return the seller's saved payout/KYC details (sensitive fields masked)."""
    from app.payments.models import SellerPayoutDetail
    detail = (
        db.query(SellerPayoutDetail)
        .filter(SellerPayoutDetail.user_id == current_user.id)
        .first()
    )
    return _payout_to_read(detail) if detail else None


@router.put("/me/payout-details", response_model=PayoutDetailRead)
def upsert_my_payout_details(
    data: PayoutDetailUpdate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Create or update the seller's payout/KYC details.

    Data is stored for settlement only — no money is held on-platform and
    disbursement is handled out-of-band until a Cashfree Payouts account is live.
    Editing details resets verification to pending.
    """
    from app.core.exceptions import ValidationError
    from app.payments.models import SellerPayoutDetail

    try:
        data.validate_for_method()
    except ValueError as exc:
        raise ValidationError(str(exc))

    detail = (
        db.query(SellerPayoutDetail)
        .filter(SellerPayoutDetail.user_id == current_user.id)
        .first()
    )
    if not detail:
        detail = SellerPayoutDetail(user_id=current_user.id)
        db.add(detail)

    detail.method = data.method
    detail.upi_id = data.upi_id
    detail.account_holder_name = data.account_holder_name
    detail.account_number = data.account_number
    detail.ifsc = data.ifsc.upper() if data.ifsc else None
    detail.pan = data.pan.upper() if data.pan else None
    detail.is_verified = False  # re-verify after any change
    db.commit()
    db.refresh(detail)
    return _payout_to_read(detail)


@router.put("/me/role", response_model=UserRead)
def update_my_role(
    data: RoleUpdate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Self-serve mode switch (build / hire / invest). Admin cannot be self-assigned."""
    svc = UserService(db)
    return svc.set_role(current_user.id, data.role)


# Literal path declared BEFORE /{user_id} so it isn't captured as a UUID param.
@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def get_leaderboard(limit: int = 20, db: Session = Depends(get_db)):
    svc = UserService(db)
    return svc.get_leaderboard(min(max(limit, 1), 100))


@router.get("/directory", response_model=list[BuilderDirectoryEntry])
def builder_directory(
    search: str | None = None,
    limit: int = 30,
    db: Session = Depends(get_db),
):
    svc = UserService(db)
    return svc.list_builders(search=search, limit=min(max(limit, 1), 60))


@router.get("/{user_id}", response_model=UserPublic)
def get_public_profile(user_id: uuid.UUID, db: Session = Depends(get_db)):
    svc = UserService(db)
    return svc.get_public_profile(user_id)


@router.get("/{user_id}/reputation", response_model=ReputationDetail)
def get_user_reputation(user_id: uuid.UUID, db: Session = Depends(get_db)):
    svc = UserService(db)
    return svc.get_reputation_detail(user_id)


@router.get("/{user_id}/contact", response_model=ContactInfo)
def get_user_contact(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Reveal a builder's contact details — Pro members, self, or admin only."""
    from app.core.exceptions import NotFoundError
    from app.subscriptions.service import SubscriptionService

    svc = UserService(db)
    target = svc.get_public_profile(user_id)

    is_self = current_user.id == user_id
    is_admin = current_user.role.value == "admin"
    is_pro = SubscriptionService(db).has_active(current_user.id)

    if not (is_self or is_admin or is_pro):
        return ContactInfo(unlocked=False)

    profile = target.profile
    return ContactInfo(
        unlocked=True,
        email=target.email,
        github_username=profile.github_username if profile else None,
        linkedin_url=profile.linkedin_url if profile else None,
        website_url=profile.website_url if profile else None,
    )
