import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_current_verified_user, get_optional_user
from app.core.exceptions import ForbiddenError, NotFoundError
from app.deals.schemas import (
    BundleCreateRequest, BundlePublishRequest, BundleRead, OfferCounterRequest,
    OfferCreateRequest, OfferDeclineRequest, OfferSummaryRead, PurchaseOfferRead,
)
from app.deals.service import BundleService, OfferService
from app.users.models import User, UserRole

router = APIRouter(prefix="/offers", tags=["offers"])
bundle_router = APIRouter(prefix="/bundles", tags=["bundles"])


# ── Serialisation helpers ─────────────────────────────────────────────────────

def _offer_payload(offer, db: Session) -> PurchaseOfferRead:
    from app.users.models import Profile

    buyer_name = None
    profile = (
        db.query(Profile).filter(Profile.user_id == offer.buyer_id).first()
    )
    if profile and profile.display_name:
        buyer_name = profile.display_name

    return PurchaseOfferRead(
        id=offer.id,
        project_id=offer.project_id,
        buyer_id=offer.buyer_id,
        seller_id=offer.seller_id,
        list_price_paise=offer.list_price_paise,
        initial_offer_paise=offer.initial_offer_paise,
        current_offer_paise=offer.current_offer_paise,
        awaiting=offer.awaiting,
        status=offer.status,
        buyer_message=offer.buyer_message,
        seller_message=offer.seller_message,
        agreed_price_paise=offer.agreed_price_paise,
        expires_at=offer.expires_at,
        resolved_at=offer.resolved_at,
        created_at=offer.created_at,
        rounds=list(offer.rounds or []),
        project_title=getattr(offer.project, "title", None),
        buyer_name=buyer_name,
    )


def _bundle_payload(bundle) -> BundleRead:
    items = []
    for item in bundle.items or []:
        project = item.project
        verification = getattr(project, "verification", None) if project else None
        items.append({
            "project_id": item.project_id,
            "sequence": item.sequence,
            "note": item.note,
            "title": getattr(project, "title", None),
            "repo_full_name": getattr(project, "repo_full_name", None),
            "primary_language": getattr(project, "primary_language", None),
            "is_verified": bool(getattr(project, "is_verified", False)),
            "verified_build_score": getattr(verification, "verified_build_score", None),
            "price_paise": getattr(project, "price_paise", None),
        })
    owner_profile = getattr(getattr(bundle, "owner", None), "profile", None)
    return BundleRead(
        id=bundle.id,
        owner_id=bundle.owner_id,
        title=bundle.title,
        slug=bundle.slug,
        description=bundle.description,
        price_paise=bundle.price_paise,
        combined_list_price_paise=bundle.combined_list_price_paise,
        is_published=bundle.is_published,
        average_score=bundle.average_score,
        created_at=bundle.created_at,
        items=items,
        owner_name=getattr(owner_profile, "display_name", None),
        savings_paise=max(0, (bundle.combined_list_price_paise or 0) - bundle.price_paise),
    )


# ── Offers ────────────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}", response_model=PurchaseOfferRead, status_code=201)
def make_offer(
    project_id: uuid.UUID,
    data: OfferCreateRequest,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Submit an offer below the listed price."""
    offer = OfferService(db).create(
        project_id, current_user, data.amount_paise, data.message
    )
    return _offer_payload(offer, db)


@router.get("/mine", response_model=list[PurchaseOfferRead])
def my_offers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Offers the current user has made as a buyer."""
    service = OfferService(db)
    return [_offer_payload(o, db) for o in service.list_for_buyer(current_user.id)]


@router.get("/received", response_model=list[PurchaseOfferRead])
def received_offers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Offers on the current user's own listings."""
    service = OfferService(db)
    return [_offer_payload(o, db) for o in service.list_for_seller(current_user.id)]


@router.get("/projects/{project_id}", response_model=list[PurchaseOfferRead])
def offers_on_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Full offer history for a listing.

    Seller and admin only. A competing buyer must not be able to read what
    everyone else bid — that would turn every listing into an auction the
    participants never agreed to enter.
    """
    from app.projects.repository import ProjectRepository

    project = ProjectRepository(db).get_by_id(project_id)
    if not project:
        raise NotFoundError("Project")
    if current_user.role != UserRole.ADMIN and project.owner_id != current_user.id:
        raise ForbiddenError("Only the seller can see all offers on a listing")

    return [_offer_payload(o, db) for o in OfferService(db).list_for_project(project_id)]


@router.get("/projects/{project_id}/mine", response_model=PurchaseOfferRead | None)
def my_offer_on_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    offer = OfferService(db).my_offer(project_id, current_user.id)
    return _offer_payload(offer, db) if offer else None


@router.get("/projects/{project_id}/summary", response_model=OfferSummaryRead)
def offer_summary(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User | None = Depends(get_optional_user),
):
    """Aggregate offer activity — counts only, no identities or amounts."""
    return OfferService(db).summary_for_project(project_id)


@router.post("/{offer_id}/counter", response_model=PurchaseOfferRead)
def counter_offer(
    offer_id: uuid.UUID,
    data: OfferCounterRequest,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    offer = OfferService(db).counter(
        offer_id, current_user, data.amount_paise, data.message
    )
    return _offer_payload(offer, db)


@router.post("/{offer_id}/accept", response_model=PurchaseOfferRead)
def accept_offer(
    offer_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    offer = OfferService(db).accept(offer_id, current_user)
    return _offer_payload(offer, db)


@router.post("/{offer_id}/decline", response_model=PurchaseOfferRead)
def decline_offer(
    offer_id: uuid.UUID,
    data: OfferDeclineRequest,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    offer = OfferService(db).decline(offer_id, current_user, data.message)
    return _offer_payload(offer, db)


@router.post("/{offer_id}/withdraw", response_model=PurchaseOfferRead)
def withdraw_offer(
    offer_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    offer = OfferService(db).withdraw(offer_id, current_user)
    return _offer_payload(offer, db)


# ── Bundles ───────────────────────────────────────────────────────────────────

@bundle_router.get("", response_model=list[BundleRead])
def list_bundles(
    db: Session = Depends(get_db),
    _: User | None = Depends(get_optional_user),
):
    """Published portfolio bundles. Public — this is a discovery surface."""
    return [_bundle_payload(b) for b in BundleService(db).list_published()]


@bundle_router.get("/mine", response_model=list[BundleRead])
def my_bundles(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return [_bundle_payload(b) for b in BundleService(db).list_for_owner(current_user.id)]


@bundle_router.post("", response_model=BundleRead, status_code=201)
def create_bundle(
    data: BundleCreateRequest,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    bundle = BundleService(db).create(
        current_user,
        title=data.title,
        description=data.description,
        project_ids=data.project_ids,
        price_paise=data.price_paise,
        publish=data.publish,
    )
    return _bundle_payload(BundleService(db).get(bundle.id))


@bundle_router.get("/{slug}", response_model=BundleRead)
def get_bundle(
    slug: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    bundle = BundleService(db).get_by_slug(slug)
    if not bundle.is_published:
        is_owner = current_user is not None and current_user.id == bundle.owner_id
        is_admin = current_user is not None and current_user.role == UserRole.ADMIN
        if not (is_owner or is_admin):
            raise NotFoundError("Bundle")
    return _bundle_payload(bundle)


@bundle_router.patch("/{bundle_id}/publish", response_model=BundleRead)
def publish_bundle(
    bundle_id: uuid.UUID,
    data: BundlePublishRequest,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    bundle = BundleService(db).set_published(bundle_id, current_user.id, data.publish)
    return _bundle_payload(BundleService(db).get(bundle.id))


@bundle_router.delete("/{bundle_id}", status_code=204)
def delete_bundle(
    bundle_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    BundleService(db).delete(bundle_id, current_user.id)
