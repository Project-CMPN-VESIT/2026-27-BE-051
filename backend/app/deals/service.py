"""
Purchase-offer negotiation and portfolio bundles.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import (
    ConflictError, ForbiddenError, NotFoundError, ValidationError,
)
from app.core.logging import get_logger
from app.core.time import as_utc, is_expired
from app.deals.models import (
    OPEN_OFFER_STATUSES, BundleItem, OfferRound, ProjectBundle, PurchaseOffer,
)

logger = get_logger("deals")

# An offer this far below asking is not a negotiation, it's noise. Sellers who
# get lowballed stop reading their offers, which breaks the feature for everyone.
MIN_OFFER_FRACTION = 0.30
OFFER_TTL_DAYS = 14
MAX_ROUNDS = 10
MIN_BUNDLE_ITEMS = 2
MAX_BUNDLE_ITEMS = 8


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return slug[:180] or "bundle"


class OfferService:
    def __init__(self, db: Session):
        self.db = db

    # ── Creation ─────────────────────────────────────────────────────────────

    def create(
        self,
        project_id: uuid.UUID,
        buyer,
        amount_paise: int,
        message: str | None = None,
    ) -> PurchaseOffer:
        from app.projects.repository import ProjectRepository

        project = ProjectRepository(self.db).get_by_id(project_id)
        if not project:
            raise NotFoundError("Project")
        if not project.is_for_sale or not project.price_paise:
            raise ValidationError("This project is not for sale")
        if project.owner_id == buyer.id:
            raise ValidationError("You cannot make an offer on your own project")

        from app.payments.models import ProjectAccess
        already = (
            self.db.query(ProjectAccess)
            .filter(
                ProjectAccess.project_id == project_id,
                ProjectAccess.user_id == buyer.id,
            )
            .first()
        )
        if already:
            raise ConflictError("You already own access to this project")

        list_price = project.price_paise
        if amount_paise <= 0:
            raise ValidationError("Enter an offer amount")
        if amount_paise >= list_price:
            raise ValidationError(
                "That's at or above the asking price — use Buy now instead of "
                "making an offer."
            )
        floor = int(list_price * MIN_OFFER_FRACTION)
        if amount_paise < floor:
            raise ValidationError(
                f"Offers below ₹{floor / 100:.0f} "
                f"({int(MIN_OFFER_FRACTION * 100)}% of the asking price) aren't accepted "
                "on this listing."
            )

        existing = (
            self.db.query(PurchaseOffer)
            .filter(
                PurchaseOffer.project_id == project_id,
                PurchaseOffer.buyer_id == buyer.id,
            )
            .first()
        )
        if existing:
            if existing.status in OPEN_OFFER_STATUSES:
                raise ConflictError(
                    "You already have an open offer on this project. Update or "
                    "withdraw it first."
                )
            if existing.status in ("accepted", "completed"):
                raise ConflictError("This offer was already accepted")
            # A declined/withdrawn/expired negotiation can be reopened, which is
            # what a real marketplace allows — circumstances change.
            existing.status = "pending"
            existing.awaiting = "seller"
            existing.list_price_paise = list_price
            existing.initial_offer_paise = amount_paise
            existing.current_offer_paise = amount_paise
            existing.buyer_message = message
            existing.seller_message = None
            existing.agreed_price_paise = None
            existing.resolved_at = None
            existing.expires_at = _now() + timedelta(days=OFFER_TTL_DAYS)
            offer = existing
        else:
            offer = PurchaseOffer(
                project_id=project_id,
                buyer_id=buyer.id,
                seller_id=project.owner_id,
                list_price_paise=list_price,
                initial_offer_paise=amount_paise,
                current_offer_paise=amount_paise,
                awaiting="seller",
                status="pending",
                buyer_message=message,
                expires_at=_now() + timedelta(days=OFFER_TTL_DAYS),
            )
            self.db.add(offer)

        self.db.flush()
        self._add_round(offer, "buyer", buyer.id, "offer", amount_paise, message)

        discount = 100 - int(amount_paise * 100 / list_price)
        self._notify(
            offer.seller_id,
            f"Offer on {project.title}",
            f"₹{amount_paise / 100:.0f} offered ({discount}% below your "
            f"₹{list_price / 100:.0f} asking price).",
            f"/projects/{project_id}#offers",
        )
        self.db.commit()
        self.db.refresh(offer)
        logger.info(
            "offer_created",
            extra={"project": str(project_id), "amount": amount_paise},
        )
        return offer

    def _add_round(
        self,
        offer: PurchaseOffer,
        actor: str,
        actor_id: uuid.UUID | None,
        action: str,
        amount_paise: int | None,
        message: str | None,
    ) -> OfferRound:
        next_seq = (
            self.db.query(func.coalesce(func.max(OfferRound.sequence), 0))
            .filter(OfferRound.offer_id == offer.id)
            .scalar() or 0
        ) + 1
        row = OfferRound(
            offer_id=offer.id,
            sequence=next_seq,
            actor=actor,
            actor_id=actor_id,
            action=action,
            amount_paise=amount_paise,
            message=message,
        )
        self.db.add(row)
        self.db.flush()
        return row

    # ── Responding ───────────────────────────────────────────────────────────

    def _load(self, offer_id: uuid.UUID) -> PurchaseOffer:
        offer = (
            self.db.query(PurchaseOffer)
            .options(joinedload(PurchaseOffer.rounds), joinedload(PurchaseOffer.project))
            .filter(PurchaseOffer.id == offer_id)
            .first()
        )
        if not offer:
            raise NotFoundError("Offer")
        return offer

    def _assert_open(self, offer: PurchaseOffer) -> None:
        if offer.status not in OPEN_OFFER_STATUSES:
            raise ConflictError(f"This offer is already {offer.status}")
        # `as_utc` because SQLite returns these columns naive, and comparing a
        # naive value against an aware now() raises rather than returning False.
        if is_expired(offer.expires_at):
            offer.status = "expired"
            offer.resolved_at = _now()
            self.db.commit()
            raise ConflictError("This offer has expired")

    def counter(
        self, offer_id: uuid.UUID, user, amount_paise: int, message: str | None = None
    ) -> PurchaseOffer:
        """Counter with a different number. Either side may counter."""
        offer = self._load(offer_id)
        self._assert_open(offer)

        is_seller = user.id == offer.seller_id
        is_buyer = user.id == offer.buyer_id
        if not (is_seller or is_buyer):
            raise ForbiddenError("This isn't your negotiation")

        side = "seller" if is_seller else "buyer"
        if offer.awaiting != side:
            raise ConflictError(
                "It's the other party's turn to respond — you can't counter your "
                "own counter."
            )

        if len(offer.rounds) >= MAX_ROUNDS:
            raise ConflictError(
                "This negotiation has gone back and forth too many times. "
                "Accept, decline, or message directly."
            )

        if amount_paise <= 0:
            raise ValidationError("Enter a counter amount")
        if amount_paise > offer.list_price_paise:
            raise ValidationError(
                "A counter cannot exceed the original asking price of "
                f"₹{offer.list_price_paise / 100:.0f}."
            )
        if is_seller and amount_paise <= offer.current_offer_paise:
            raise ValidationError(
                "Your counter should be above the buyer's current offer. To take "
                "their number, accept it instead."
            )
        if is_buyer and amount_paise >= offer.current_offer_paise:
            raise ValidationError(
                "Your counter should be below the seller's current number. To take "
                "it, accept instead."
            )

        offer.current_offer_paise = amount_paise
        offer.status = "countered"
        offer.awaiting = "buyer" if is_seller else "seller"
        if is_seller:
            offer.seller_message = message
        else:
            offer.buyer_message = message
        # Every move restarts the clock; otherwise a long negotiation dies mid-way.
        offer.expires_at = _now() + timedelta(days=OFFER_TTL_DAYS)

        self._add_round(offer, side, user.id, "counter", amount_paise, message)

        recipient = offer.buyer_id if is_seller else offer.seller_id
        title = offer.project.title if offer.project else "a project"
        self._notify(
            recipient,
            f"Counter-offer on {title}",
            f"₹{amount_paise / 100:.0f} is now on the table.",
            f"/projects/{offer.project_id}#offers",
        )
        self.db.commit()
        self.db.refresh(offer)
        return offer

    def accept(self, offer_id: uuid.UUID, user) -> PurchaseOffer:
        """Accept the amount currently on the table.

        Acceptance agrees a price; it does not move money. The buyer then checks
        out at `agreed_price_paise`. Keeping those separate means a seller
        accepting an offer never creates a charge the buyer hasn't authorised.
        """
        offer = self._load(offer_id)
        self._assert_open(offer)

        is_seller = user.id == offer.seller_id
        is_buyer = user.id == offer.buyer_id
        if not (is_seller or is_buyer):
            raise ForbiddenError("This isn't your negotiation")

        side = "seller" if is_seller else "buyer"
        if offer.awaiting != side:
            raise ConflictError("You've already moved — it's the other side's turn")

        offer.status = "accepted"
        offer.agreed_price_paise = offer.current_offer_paise
        offer.awaiting = "buyer"  # the buyer must now pay
        offer.resolved_at = _now()
        self._add_round(offer, side, user.id, "accept", offer.current_offer_paise, None)

        title = offer.project.title if offer.project else "a project"
        amount = offer.agreed_price_paise / 100
        if is_seller:
            self._notify(
                offer.buyer_id,
                f"Offer accepted: {title}",
                f"The seller accepted ₹{amount:.0f}. Complete checkout to receive "
                "delivery details.",
                f"/projects/{offer.project_id}/checkout?offer={offer.id}",
            )
        else:
            self._notify(
                offer.seller_id,
                f"Your counter was accepted: {title}",
                f"The buyer accepted ₹{amount:.0f} and can now pay.",
                f"/projects/{offer.project_id}#offers",
            )

        # Other open negotiations on the same project are now stale. Telling
        # those buyers is better than leaving them waiting on a sold project.
        self._notify_others_stale(offer)

        self.db.commit()
        self.db.refresh(offer)
        logger.info(
            "offer_accepted",
            extra={"offer": str(offer.id), "amount": offer.agreed_price_paise},
        )
        return offer

    def _notify_others_stale(self, accepted: PurchaseOffer) -> None:
        others = (
            self.db.query(PurchaseOffer)
            .filter(
                PurchaseOffer.project_id == accepted.project_id,
                PurchaseOffer.id != accepted.id,
                PurchaseOffer.status.in_(OPEN_OFFER_STATUSES),
            )
            .all()
        )
        title = accepted.project.title if accepted.project else "A project"
        for other in others:
            self._notify(
                other.buyer_id,
                f"Another offer was accepted on {title}",
                "Your offer is still open in case the sale doesn't complete, but "
                "the seller has agreed terms with another buyer.",
                f"/projects/{accepted.project_id}",
            )

    def decline(
        self, offer_id: uuid.UUID, user, message: str | None = None
    ) -> PurchaseOffer:
        offer = self._load(offer_id)
        self._assert_open(offer)

        is_seller = user.id == offer.seller_id
        if not (is_seller or user.id == offer.buyer_id):
            raise ForbiddenError("This isn't your negotiation")

        offer.status = "declined"
        offer.resolved_at = _now()
        if is_seller:
            offer.seller_message = message
        self._add_round(
            offer, "seller" if is_seller else "buyer", user.id, "decline", None, message
        )

        title = offer.project.title if offer.project else "a project"
        self._notify(
            offer.buyer_id if is_seller else offer.seller_id,
            f"Offer declined on {title}",
            message or "The other party declined this offer.",
            f"/projects/{offer.project_id}",
        )
        self.db.commit()
        self.db.refresh(offer)
        return offer

    def withdraw(self, offer_id: uuid.UUID, user) -> PurchaseOffer:
        offer = self._load(offer_id)
        if user.id != offer.buyer_id:
            raise ForbiddenError("Only the buyer can withdraw their offer")
        if offer.status not in OPEN_OFFER_STATUSES:
            raise ConflictError(f"This offer is already {offer.status}")

        offer.status = "withdrawn"
        offer.resolved_at = _now()
        self._add_round(offer, "buyer", user.id, "withdraw", None, None)
        title = offer.project.title if offer.project else "a project"
        self._notify(
            offer.seller_id,
            f"Offer withdrawn on {title}",
            "The buyer withdrew their offer.",
            f"/projects/{offer.project_id}#offers",
        )
        self.db.commit()
        self.db.refresh(offer)
        return offer

    def mark_completed(self, offer: PurchaseOffer, payment_id: uuid.UUID) -> None:
        offer.status = "completed"
        offer.payment_id = payment_id
        self.db.flush()

    # ── Reading ──────────────────────────────────────────────────────────────

    def accepted_for_buyer(
        self, project_id: uuid.UUID, buyer_id: uuid.UUID
    ) -> PurchaseOffer | None:
        """An accepted offer this buyer may now pay for.

        Read by the payment validator to price the order, which is why it filters
        on status strictly — a pending offer must never set a checkout amount.
        """
        return (
            self.db.query(PurchaseOffer)
            .filter(
                PurchaseOffer.project_id == project_id,
                PurchaseOffer.buyer_id == buyer_id,
                PurchaseOffer.status == "accepted",
                PurchaseOffer.agreed_price_paise.isnot(None),
            )
            .first()
        )

    def list_for_project(self, project_id: uuid.UUID) -> list[PurchaseOffer]:
        return (
            self.db.query(PurchaseOffer)
            .options(joinedload(PurchaseOffer.rounds), joinedload(PurchaseOffer.buyer))
            .filter(PurchaseOffer.project_id == project_id)
            .order_by(PurchaseOffer.created_at.desc())
            .all()
        )

    def list_for_buyer(self, buyer_id: uuid.UUID) -> list[PurchaseOffer]:
        return (
            self.db.query(PurchaseOffer)
            .options(joinedload(PurchaseOffer.rounds), joinedload(PurchaseOffer.project))
            .filter(PurchaseOffer.buyer_id == buyer_id)
            .order_by(PurchaseOffer.created_at.desc())
            .all()
        )

    def list_for_seller(self, seller_id: uuid.UUID) -> list[PurchaseOffer]:
        return (
            self.db.query(PurchaseOffer)
            .options(joinedload(PurchaseOffer.rounds), joinedload(PurchaseOffer.project))
            .filter(PurchaseOffer.seller_id == seller_id)
            .order_by(PurchaseOffer.created_at.desc())
            .all()
        )

    def my_offer(
        self, project_id: uuid.UUID, buyer_id: uuid.UUID
    ) -> PurchaseOffer | None:
        return (
            self.db.query(PurchaseOffer)
            .options(joinedload(PurchaseOffer.rounds))
            .filter(
                PurchaseOffer.project_id == project_id,
                PurchaseOffer.buyer_id == buyer_id,
            )
            .first()
        )

    def summary_for_project(self, project_id: uuid.UUID) -> dict:
        """Aggregate offer activity, safe to show publicly.

        Exposes counts and the best *open* offer but never who made it — a
        competing buyer's identity and exact number is not public information,
        and leaking it turns a marketplace into an auction nobody consented to.
        """
        rows = (
            self.db.query(PurchaseOffer.status, PurchaseOffer.current_offer_paise)
            .filter(PurchaseOffer.project_id == project_id)
            .all()
        )
        open_amounts = [
            amount for status, amount in rows if status in OPEN_OFFER_STATUSES
        ]
        return {
            "total_offers": len(rows),
            "open_offers": len(open_amounts),
            "has_accepted": any(s in ("accepted", "completed") for s, _ in rows),
        }

    def _notify(self, recipient_id: uuid.UUID, title: str, body: str, link: str) -> None:
        from app.notifications.models import NotificationType
        from app.notifications.service import NotificationService

        try:
            NotificationService(self.db).create(
                recipient_id=recipient_id,
                type=NotificationType.SYSTEM,
                title=title, body=body, link=link,
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("offer_notify_failed", extra={"error": str(exc)})

    def expire_stale(self) -> int:
        """Mark timed-out negotiations expired. Driven by the beat schedule.

        The date filter is applied in Python rather than SQL because SQLite
        stores these columns naive; a SQL comparison against an aware value
        silently matches nothing there while working on Postgres, which is the
        worst kind of bug — one that only appears in production.
        """
        candidates = (
            self.db.query(PurchaseOffer)
            .filter(
                PurchaseOffer.status.in_(OPEN_OFFER_STATUSES),
                PurchaseOffer.expires_at.isnot(None),
            )
            .all()
        )
        rows = [o for o in candidates if is_expired(o.expires_at)]
        for offer in rows:
            offer.status = "expired"
            offer.resolved_at = _now()
        if rows:
            self.db.commit()
        return len(rows)


# ══════════════════════════════════════════════════════════════════════════════
# Bundles
# ══════════════════════════════════════════════════════════════════════════════

class BundleService:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        owner,
        title: str,
        description: str | None,
        project_ids: list[uuid.UUID],
        price_paise: int,
        publish: bool = False,
    ) -> ProjectBundle:
        from app.projects.models import Project, ProjectVerification

        if len(project_ids) < MIN_BUNDLE_ITEMS:
            raise ValidationError(
                f"A bundle needs at least {MIN_BUNDLE_ITEMS} projects — otherwise "
                "it's just a listing."
            )
        if len(project_ids) > MAX_BUNDLE_ITEMS:
            raise ValidationError(f"A bundle can hold at most {MAX_BUNDLE_ITEMS} projects")
        if len(set(project_ids)) != len(project_ids):
            raise ValidationError("The same project is listed twice")

        projects = (
            self.db.query(Project)
            .filter(Project.id.in_(project_ids), Project.is_deleted == False)
            .all()
        )
        if len(projects) != len(project_ids):
            raise ValidationError("One or more of those projects could not be found")

        for project in projects:
            if project.owner_id != owner.id:
                raise ForbiddenError(
                    "You can only bundle projects you own"
                )

        combined = sum(p.price_paise or 0 for p in projects)
        if price_paise <= 0:
            raise ValidationError("Set a bundle price")
        if combined and price_paise > combined:
            raise ValidationError(
                f"A bundle priced above the ₹{combined / 100:.0f} sum of its parts "
                "gives a buyer no reason to take it. Price it at or below that."
            )

        scores = [
            score
            for (score,) in self.db.query(ProjectVerification.verified_build_score)
            .filter(
                ProjectVerification.project_id.in_(project_ids),
                ProjectVerification.verified_build_score.isnot(None),
            )
            .all()
        ] if project_ids else []

        slug = self._unique_slug(_slugify(title))
        bundle = ProjectBundle(
            owner_id=owner.id,
            title=title.strip()[:200],
            slug=slug,
            description=(description or None),
            price_paise=price_paise,
            combined_list_price_paise=combined,
            is_published=publish,
            average_score=int(round(sum(scores) / len(scores))) if scores else None,
        )
        self.db.add(bundle)
        self.db.flush()

        order = {pid: i for i, pid in enumerate(project_ids)}
        for project in sorted(projects, key=lambda p: order.get(p.id, 0)):
            self.db.add(BundleItem(
                bundle_id=bundle.id,
                project_id=project.id,
                sequence=order.get(project.id, 0) + 1,
            ))

        self.db.commit()
        self.db.refresh(bundle)
        logger.info(
            "bundle_created",
            extra={"bundle": str(bundle.id), "items": len(projects)},
        )
        return bundle

    def _unique_slug(self, base: str) -> str:
        slug = base
        suffix = 2
        while (
            self.db.query(func.count(ProjectBundle.id))
            .filter(ProjectBundle.slug == slug)
            .scalar() or 0
        ) > 0:
            slug = f"{base}-{suffix}"
            suffix += 1
        return slug

    def get(self, bundle_id: uuid.UUID) -> ProjectBundle:
        bundle = (
            self.db.query(ProjectBundle)
            .options(
                joinedload(ProjectBundle.items).joinedload(BundleItem.project),
                joinedload(ProjectBundle.owner),
            )
            .filter(ProjectBundle.id == bundle_id)
            .first()
        )
        if not bundle:
            raise NotFoundError("Bundle")
        return bundle

    def get_by_slug(self, slug: str) -> ProjectBundle:
        bundle = (
            self.db.query(ProjectBundle)
            .options(
                joinedload(ProjectBundle.items).joinedload(BundleItem.project),
                joinedload(ProjectBundle.owner),
            )
            .filter(ProjectBundle.slug == slug)
            .first()
        )
        if not bundle:
            raise NotFoundError("Bundle")
        return bundle

    def list_published(self, limit: int = 24) -> list[ProjectBundle]:
        return (
            self.db.query(ProjectBundle)
            .options(joinedload(ProjectBundle.items).joinedload(BundleItem.project))
            .filter(ProjectBundle.is_published == True)
            .order_by(ProjectBundle.average_score.desc().nullslast())
            .limit(limit)
            .all()
        )

    def list_for_owner(self, owner_id: uuid.UUID) -> list[ProjectBundle]:
        return (
            self.db.query(ProjectBundle)
            .options(joinedload(ProjectBundle.items).joinedload(BundleItem.project))
            .filter(ProjectBundle.owner_id == owner_id)
            .order_by(ProjectBundle.created_at.desc())
            .all()
        )

    def set_published(
        self, bundle_id: uuid.UUID, owner_id: uuid.UUID, published: bool
    ) -> ProjectBundle:
        bundle = self.get(bundle_id)
        if bundle.owner_id != owner_id:
            raise ForbiddenError("Not your bundle")
        if published and len(bundle.items) < MIN_BUNDLE_ITEMS:
            raise ValidationError(
                f"A bundle needs at least {MIN_BUNDLE_ITEMS} projects to publish"
            )
        bundle.is_published = published
        self.db.commit()
        self.db.refresh(bundle)
        return bundle

    def delete(self, bundle_id: uuid.UUID, owner_id: uuid.UUID) -> None:
        bundle = self.get(bundle_id)
        if bundle.owner_id != owner_id:
            raise ForbiddenError("Not your bundle")
        self.db.delete(bundle)
        self.db.commit()
