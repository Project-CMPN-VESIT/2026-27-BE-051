import base64
import hashlib
import hmac
import json
from decimal import Decimal, InvalidOperation
import uuid
from datetime import datetime, timedelta, timezone

import httpx

from app.core.config import get_settings
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    PaymentError,
    ValidationError,
)
from app.core.logging import get_logger
from app.payments.models import PAYMENT_PRICES, Payment, PaymentStatus, PaymentType
from app.payments.schemas import CreateOrderRequest, CreateOrderResponse
from app.projects.models import ProjectStatus
from app.projects.repository import ProjectRepository
from app.users.models import User
from sqlalchemy.orm import Session

settings = get_settings()
logger = get_logger("payments")

CF_SANDBOX = "https://sandbox.cashfree.com/pg"
CF_PROD = "https://api.cashfree.com/pg"

# ── Purchase rules ────────────────────────────────────────────────────────────
# Types that apply to one specific project, so project_id is mandatory.
# Without this, _fulfill_payment silently returns and the buyer gets nothing.
PROJECT_SCOPED_TYPES = {
    PaymentType.PROJECT_ACCESS,
    PaymentType.AI_AUDIT,
    PaymentType.STARTUP_REPORT,
    PaymentType.FEATURED_PLACEMENT,
    PaymentType.PITCH_DECK,
}

# Project add-ons only the owner may buy for their own listing.
OWNER_ONLY_TYPES = {
    PaymentType.AI_AUDIT,
    PaymentType.STARTUP_REPORT,
    PaymentType.FEATURED_PLACEMENT,
    PaymentType.PITCH_DECK,
}

# PREMIUM_LISTING has no branch in _fulfill_payment, so a purchase would take
# money and deliver nothing. Blocked until it has a defined benefit.
UNAVAILABLE_TYPES = {PaymentType.PREMIUM_LISTING}

# Window in which an unpaid order is resumed rather than duplicated.
PENDING_ORDER_REUSE_MINUTES = 15


class PaymentService:
    def __init__(self, db: Session):
        self.db = db
        self._base_url = CF_PROD if settings.cashfree_env == "production" else CF_SANDBOX

    def _cf_headers(self) -> dict:
        return {
            "x-client-id": settings.cashfree_app_id,
            "x-client-secret": settings.cashfree_secret_key,
            "x-api-version": "2023-08-01",
            "Content-Type": "application/json",
        }

    def _validate_order(self, user: User, data: CreateOrderRequest) -> int:
        """Reject an order before money changes hands, and return the amount.

        Every rule here exists because breaking it either charges a user twice
        for something they already own, or takes payment for something the
        fulfilment step cannot deliver.
        """
        from app.projects.repository import ProjectRepository

        ptype = data.payment_type

        if ptype in UNAVAILABLE_TYPES:
            raise ValidationError(
                "This product is not currently available for purchase"
            )

        if ptype in PROJECT_SCOPED_TYPES and not data.project_id:
            raise ValidationError("Select a project before continuing to payment")

        project = None
        if data.project_id:
            project = ProjectRepository(self.db).get_by_id(data.project_id)
            if not project:
                raise NotFoundError("Project")
            if project.status == ProjectStatus.ARCHIVED:
                raise ValidationError(
                    "This project is archived and cannot be purchased against"
                )

        # Owner-only add-ons: nobody should be able to buy an upgrade that
        # applies to someone else's listing.
        if ptype in OWNER_ONLY_TYPES:
            if project is None:
                raise ValidationError("Select a project before continuing to payment")
            if project.owner_id != user.id:
                raise ForbiddenError(
                    "Only the project owner can purchase this for their project"
                )

        # Already-unlocked guards — these are one-time unlocks, not renewals.
        if ptype == PaymentType.STARTUP_REPORT and project.startup_report_unlocked:
            raise ConflictError(
                "The startup report for this project is already unlocked"
            )
        if ptype == PaymentType.PITCH_DECK and project.pitch_deck_unlocked:
            raise ConflictError(
                "The pitch deck for this project is already unlocked"
            )
        if ptype == PaymentType.FEATURED_PLACEMENT and project.is_featured:
            raise ConflictError("This project is already featured")

        if ptype == PaymentType.PROJECT_ACCESS:
            if not project.is_for_sale or not project.price_paise:
                raise ValidationError("This project is not for sale")
            if project.owner_id == user.id:
                raise ValidationError("You cannot buy your own project")
            from app.payments.models import ProjectAccess
            already = (
                self.db.query(ProjectAccess)
                .filter(
                    ProjectAccess.project_id == data.project_id,
                    ProjectAccess.user_id == user.id,
                )
                .first()
            )
            if already:
                raise ConflictError("You already have access to this project")

            # A negotiated price wins over the sticker price. Read from the
            # accepted offer rather than trusting a client-supplied amount —
            # otherwise anyone could post their own discount.
            from app.deals.service import OfferService
            accepted = OfferService(self.db).accepted_for_buyer(
                data.project_id, user.id
            )
            if accepted and accepted.agreed_price_paise:
                return accepted.agreed_price_paise
            return project.price_paise

        amount_paise = PAYMENT_PRICES.get(ptype)
        if not amount_paise:
            raise ValidationError(f"Unknown payment type: {ptype.value}")
        return amount_paise

    def _reusable_pending_order(
        self, user: User, data: CreateOrderRequest
    ) -> Payment | None:
        """Find a recent unpaid order for the same thing.

        Double-clicking "Buy now" should not open two Cashfree orders for one
        purchase. We resume the existing session if it is recent enough to
        still be valid at Cashfree.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=PENDING_ORDER_REUSE_MINUTES)
        q = self.db.query(Payment).filter(
            Payment.user_id == user.id,
            Payment.payment_type == data.payment_type,
            Payment.status == PaymentStatus.CREATED,
            Payment.created_at >= cutoff,
            Payment.cf_order_token.isnot(None),
        )
        if data.project_id:
            q = q.filter(Payment.project_id == data.project_id)
        else:
            q = q.filter(Payment.project_id.is_(None))
        return q.order_by(Payment.created_at.desc()).first()

    async def create_order(
        self, user: User, data: CreateOrderRequest
    ) -> CreateOrderResponse:
        amount_paise = self._validate_order(user, data)

        existing = self._reusable_pending_order(user, data)
        if existing and existing.amount_paise == amount_paise:
            logger.info(
                "Reusing pending payment order",
                order_id=existing.order_id,
                type=data.payment_type.value,
            )
            return CreateOrderResponse(
                order_id=existing.order_id,
                cf_order_token=existing.cf_order_token or "",
                amount_paise=existing.amount_paise,
                currency=existing.currency,
                payment_type=existing.payment_type,
            )

        order_id = f"CB-{uuid.uuid4().hex[:12].upper()}"
        amount_inr = amount_paise / 100

        cf_payload = {
            "order_id": order_id,
            "order_amount": amount_inr,
            "order_currency": "INR",
            "customer_details": {
                "customer_id": str(user.id),
                "customer_email": user.email,
                "customer_phone": "9999999999",  # Required by Cashfree — collect in profile
            },
            "order_meta": {
                "return_url": f"{settings.frontend_url}/payment/status?order_id={order_id}",
                # Must point at the PUBLIC API host, not the frontend. Derived from
                # API_BASE_URL so it is correct in every environment.
                "notify_url": f"{settings.api_base_url.rstrip('/')}/payments/webhook",
            },
            "order_note": data.payment_type.value,
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self._base_url}/orders",
                headers=self._cf_headers(),
                json=cf_payload,
            )
            if resp.status_code not in (200, 201):
                logger.error("Cashfree order creation failed", status=resp.status_code, body=resp.text)
                raise PaymentError("Failed to create payment order. Please try again.")
            cf_data = resp.json()

        # Persist payment record
        payment = Payment(
            user_id=user.id,
            project_id=data.project_id,
            order_id=order_id,
            payment_type=data.payment_type,
            amount_paise=amount_paise,
            status=PaymentStatus.CREATED,
            cf_order_token=cf_data.get("payment_session_id"),
        )
        self.db.add(payment)
        self.db.commit()
        logger.info("Payment order created", order_id=order_id, type=data.payment_type.value)

        return CreateOrderResponse(
            order_id=order_id,
            cf_order_token=cf_data.get("payment_session_id", ""),
            amount_paise=amount_paise,
            currency="INR",
            payment_type=data.payment_type,
        )

    def handle_webhook(self, payload: bytes, signature: str, timestamp: str = "") -> dict:
        """Verify Cashfree webhook signature and process payment update."""
        # Cashfree signs the exact raw body prefixed by x-webhook-timestamp and
        # sends the HMAC-SHA256 digest as Base64. Parsing/re-serializing JSON
        # before verification changes the signed bytes and breaks authenticity.
        if not timestamp or not signature or not settings.cashfree_secret_key:
            raise ValidationError("Invalid webhook signature")
        signed_payload = timestamp.encode("utf-8") + payload
        digest = hmac.new(
            settings.cashfree_secret_key.encode("utf-8"),
            signed_payload,
            hashlib.sha256,
        ).digest()
        computed = base64.b64encode(digest).decode("ascii")

        if not hmac.compare_digest(computed, signature):
            raise ValidationError("Invalid webhook signature")

        try:
            data = json.loads(payload)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ValidationError("Invalid webhook payload") from None
        if not isinstance(data, dict):
            raise ValidationError("Invalid webhook payload")
        event = data.get("data")
        if not isinstance(event, dict):
            raise ValidationError("Invalid webhook payload")
        order = event.get("order")
        payment_event = event.get("payment")
        if not isinstance(order, dict) or not isinstance(payment_event, dict):
            raise ValidationError("Invalid webhook payload")
        order_id = order.get("order_id")
        cf_payment_id = payment_event.get("cf_payment_id")
        payment_status = payment_event.get("payment_status")

        if not order_id:
            return {"status": "ignored"}

        payment = (
            self.db.query(Payment)
            .filter(Payment.order_id == order_id)
            .with_for_update()
            .first()
        )
        if not payment:
            logger.warning("Webhook for unknown order", order_id=order_id)
            return {"status": "unknown_order"}

        # Validate the provider's order amount and currency against the
        # authoritative record before granting access or activating a plan.
        if payment_status == "SUCCESS":
            try:
                order_amount = Decimal(str(order["order_amount"])) * 100
                if not order_amount.is_finite() or order_amount != order_amount.to_integral_value():
                    raise InvalidOperation
                order_amount_paise = int(order_amount)
            except (KeyError, InvalidOperation, TypeError, ValueError):
                raise ValidationError("Webhook order amount is invalid") from None
            if order.get("order_currency") != payment.currency or order_amount_paise != payment.amount_paise:
                raise ValidationError("Webhook order amount does not match the payment")

        if payment.status == PaymentStatus.PAID:
            # Cashfree retries delivery. A later failed event also must not
            # downgrade a successfully fulfilled payment.
            self.db.commit()
            return {"status": "already_processed"}

        if payment_status == "SUCCESS":
            payment.status = PaymentStatus.PAID
            payment.cf_payment_id = cf_payment_id
            payment.webhook_payload = data
            self._fulfill_payment(payment)
        elif payment_status in ("FAILED", "USER_DROPPED"):
            payment.status = PaymentStatus.FAILED
            payment.webhook_payload = data

        self.db.commit()
        logger.info("Webhook processed", order_id=order_id, status=payment_status)
        return {"status": "ok"}

    def _fulfill_payment(self, payment: Payment) -> None:
        """Unlock paid features based on payment type."""
        from app.notifications.models import NotificationType
        from app.notifications.service import NotificationService
        notif_svc = NotificationService(self.db)

        if payment.payment_type == PaymentType.PROJECT_ACCESS and payment.project_id:
            from app.payments.models import ProjectAccess
            from app.projects.repository import ProjectRepository
            project = ProjectRepository(self.db).get_by_id(payment.project_id)

            # Record marketplace split: platform commission + seller net.
            bps = max(0, min(10000, settings.commission_bps))
            platform_fee = (payment.amount_paise * bps) // 10000
            seller_net = payment.amount_paise - platform_fee
            payment.platform_fee_paise = platform_fee
            payment.seller_net_paise = seller_net

            access = ProjectAccess(
                user_id=payment.user_id,
                project_id=payment.project_id,
                payment_id=payment.id,
                access_type=project.sale_type or "source_code" if project else "source_code",
            )
            self.db.add(access)
            self.db.flush()

            # Freeze the trust state the buyer actually paid against. Must happen
            # here, inside the fulfilment transaction, because the score is live —
            # by tomorrow there is no way to reconstruct what was on screen today.
            receipt = None
            if project:
                from app.trust.service import TrustReceiptService
                receipt = TrustReceiptService(self.db).issue(payment, project)

            # Distribute the sale across co-owners when the project is team-owned.
            # A single seller_net on the Payment row cannot express N payees, so
            # the split lives in its own ledger.
            if project:
                from app.teams.service import TeamService
                TeamService(self.db).record_sale_splits(payment, project, seller_net)

            # Close out a negotiated offer, if this purchase settles one.
            try:
                from app.deals.service import OfferService
                offers = OfferService(self.db)
                accepted = offers.accepted_for_buyer(payment.project_id, payment.user_id)
                if accepted:
                    offers.mark_completed(accepted, payment.id)
            except Exception:
                # The sale is done and access is granted; a stale offer status is
                # cosmetic and must not fail fulfilment.
                pass

            if project:
                from app.projects.models import ProjectEventType
                from app.projects.timeline import record_event
                record_event(
                    self.db, project.id, ProjectEventType.SOLD,
                    "Project sold",
                    f"Purchased for ₹{payment.amount_paise / 100:.0f} through CodeBazaar",
                )
            # Notify buyer
            notif_svc.create(
                recipient_id=payment.user_id,
                type=NotificationType.PROJECT_ACCESS_PURCHASED,
                title="Project access granted",
                body=(
                    f"You now have access to {project.title if project else 'the project'}. "
                    + (
                        f"Trust receipt {receipt.receipt_code} records the verification "
                        "state at purchase. "
                        if receipt else ""
                    )
                    + "Delivery details are on the project page."
                ),
                link=f"/projects/{payment.project_id}",
            )
            # Notify seller — show net payout after commission
            if project:
                notif_svc.create(
                    recipient_id=project.owner_id,
                    type=NotificationType.PAYMENT_SUCCESS,
                    title=f"Sale: {project.title}",
                    body=(
                        f"₹{payment.amount_paise / 100:.0f} sale · "
                        f"platform fee ₹{platform_fee / 100:.0f} · "
                        f"you earn ₹{seller_net / 100:.0f}. "
                        f"Add payout details in Settings to receive it."
                    ),
                    link=f"/projects/{payment.project_id}",
                )
            return

        if payment.payment_type in (PaymentType.RECRUITER_PRO, PaymentType.INCUBATOR_PRO):
            from app.subscriptions.models import PLAN_INCUBATOR_PRO, PLAN_RECRUITER_PRO
            from app.subscriptions.service import SubscriptionService
            plan = (
                PLAN_RECRUITER_PRO
                if payment.payment_type == PaymentType.RECRUITER_PRO
                else PLAN_INCUBATOR_PRO
            )
            sub = SubscriptionService(self.db).grant_or_extend(
                payment.user_id, plan, payment_id=payment.id
            )
            notif_svc.create(
                recipient_id=payment.user_id,
                type=NotificationType.PAYMENT_SUCCESS,
                title="Pro membership active",
                body=f"Your {plan.replace('_', ' ').title()} is active until "
                f"{sub.expires_at.strftime('%d %b %Y')}.",
                link="/pricing",
            )
            return

        if not payment.project_id:
            return

        project_repo = ProjectRepository(self.db)
        project = project_repo.get_by_id(payment.project_id)
        if not project:
            return

        if payment.payment_type == PaymentType.FEATURED_PLACEMENT:
            project_repo.update(project, is_featured=True)
            notif_svc.create(
                recipient_id=project.owner_id,
                type=NotificationType.PAYMENT_SUCCESS,
                title="Your project is now featured",
                body=f"{project.title} is featured on the home page",
                link=f"/projects/{payment.project_id}",
            )
        elif payment.payment_type == PaymentType.AI_AUDIT:
            from app.tasks.analysis_tasks import run_project_analysis
            run_project_analysis.delay(str(payment.project_id))
        elif payment.payment_type == PaymentType.STARTUP_REPORT:
            project_repo.update(project, startup_report_unlocked=True)
            notif_svc.create(
                recipient_id=payment.user_id,
                type=NotificationType.PAYMENT_SUCCESS,
                title="Startup report unlocked",
                body=f"Full startup readiness report for {project.title} is ready",
                link=f"/projects/{payment.project_id}",
            )
        elif payment.payment_type == PaymentType.PITCH_DECK:
            project_repo.update(project, pitch_deck_unlocked=True)
            notif_svc.create(
                recipient_id=payment.user_id,
                type=NotificationType.PAYMENT_SUCCESS,
                title="Pitch deck unlocked",
                body=f"Generate your AI pitch deck for {project.title} now",
                link=f"/projects/{payment.project_id}",
            )

    def get_payment_history(self, user_id: uuid.UUID) -> list[Payment]:
        return (
            self.db.query(Payment)
            .filter(Payment.user_id == user_id)
            .order_by(Payment.created_at.desc())
            .all()
        )

    def get_seller_earnings(self, seller_id: uuid.UUID):
        """Aggregate completed project sales where this user is the project owner."""
        from app.payments.models import SellerPayoutDetail
        from app.payments.schemas import SaleItem, SellerEarnings
        from app.projects.models import Project
        from app.users.models import Profile, User

        rows = (
            self.db.query(Payment, Project, Profile, User.email)
            .join(Project, Payment.project_id == Project.id)
            .join(User, Payment.user_id == User.id)
            .outerjoin(Profile, Profile.user_id == User.id)
            .filter(
                Project.owner_id == seller_id,
                Payment.payment_type == PaymentType.PROJECT_ACCESS,
                Payment.status == PaymentStatus.PAID,
            )
            .order_by(Payment.created_at.desc())
            .all()
        )

        sales: list[SaleItem] = []
        gross = fee = net = 0
        for payment, project, profile, email in rows:
            amount = payment.amount_paise or 0
            # Older sales (before commission was recorded) fall back to full amount as net.
            p_fee = payment.platform_fee_paise if payment.platform_fee_paise is not None else 0
            s_net = payment.seller_net_paise if payment.seller_net_paise is not None else amount
            gross += amount
            fee += p_fee
            net += s_net
            buyer_name = (profile.display_name if profile and profile.display_name else None) or (
                email.split("@")[0] if email else "Buyer"
            )
            sales.append(
                SaleItem(
                    payment_id=payment.id,
                    project_id=payment.project_id,
                    project_title=project.title if project else "Project",
                    buyer_name=buyer_name,
                    amount_paise=amount,
                    platform_fee_paise=p_fee,
                    seller_net_paise=s_net,
                    created_at=payment.created_at,
                )
            )

        payout = (
            self.db.query(SellerPayoutDetail)
            .filter(SellerPayoutDetail.user_id == seller_id)
            .first()
        )

        settled = self._settled_total(seller_id)

        return SellerEarnings(
            total_sales=len(sales),
            gross_paise=gross,
            platform_fee_paise=fee,
            net_paise=net,
            settled_paise=settled,
            pending_payout_paise=max(0, net - settled),
            payout_configured=payout is not None,
            payout_verified=bool(payout and payout.is_verified),
            sales=sales,
        )

    def _net_total(self, seller_id: uuid.UUID) -> int:
        """Total net earnings owed to a seller across all completed sales."""
        from app.projects.models import Project

        rows = (
            self.db.query(Payment.amount_paise, Payment.seller_net_paise)
            .join(Project, Payment.project_id == Project.id)
            .filter(
                Project.owner_id == seller_id,
                Payment.payment_type == PaymentType.PROJECT_ACCESS,
                Payment.status == PaymentStatus.PAID,
            )
            .all()
        )
        return sum(
            (net if net is not None else (amount or 0)) for amount, net in rows
        )

    def _settled_total(self, seller_id: uuid.UUID) -> int:
        from sqlalchemy import func
        from app.payments.models import PayoutTransaction

        total = (
            self.db.query(func.coalesce(func.sum(PayoutTransaction.amount_paise), 0))
            .filter(
                PayoutTransaction.seller_id == seller_id,
                PayoutTransaction.status == "completed",
            )
            .scalar()
        )
        return int(total or 0)

    def get_outstanding(self, seller_id: uuid.UUID) -> int:
        """Amount still owed to a seller (net earnings minus completed settlements)."""
        return max(0, self._net_total(seller_id) - self._settled_total(seller_id))

    def list_settlements(self, seller_id: uuid.UUID):
        from app.payments.models import PayoutTransaction
        return (
            self.db.query(PayoutTransaction)
            .filter(PayoutTransaction.seller_id == seller_id)
            .order_by(PayoutTransaction.created_at.desc())
            .all()
        )

    def record_settlement(
        self,
        seller_id: uuid.UUID,
        amount_paise: int,
        method: str,
        reference: str | None,
        note: str | None,
        admin_id: uuid.UUID,
    ):
        """Record a manual settlement paid to a seller. Cannot exceed the
        outstanding balance."""
        from app.payments.models import PayoutTransaction
        from app.notifications.models import NotificationType
        from app.notifications.service import NotificationService

        outstanding = self.get_outstanding(seller_id)
        if amount_paise > outstanding:
            raise ValidationError(
                f"Amount exceeds outstanding balance (₹{outstanding / 100:.0f})"
            )

        txn = PayoutTransaction(
            seller_id=seller_id,
            amount_paise=amount_paise,
            method=method,
            reference=reference,
            note=note,
            status="completed",
            created_by_id=admin_id,
        )
        self.db.add(txn)
        self.db.flush()

        NotificationService(self.db).create(
            recipient_id=seller_id,
            type=NotificationType.PAYMENT_SUCCESS,
            title="Payout settled",
            body=f"₹{amount_paise / 100:.0f} has been paid out to you"
            + (f" (ref {reference})" if reference else ""),
            link="/earnings",
        )
        self.db.commit()
        self.db.refresh(txn)
        return txn
