"""Escrow state machine: contract lifecycle, funding, milestone release, disputes."""
import hashlib
import hmac
import json
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    PaymentError,
    ValidationError,
)
from app.core.logging import get_logger
from app.escrow.models import (
    Dispute,
    DisputeStatus,
    EscrowContract,
    EscrowContractStatus,
    EscrowEntryType,
    EscrowLedgerEntry,
    Milestone,
    MilestoneStatus,
)
from app.escrow.schemas import ContractCreate, DisputeCreate, DisputeResolve, MilestoneSubmit
from app.notifications.models import NotificationType
from app.notifications.service import NotificationService
from app.users.models import User, UserRole
from app.users.repository import UserRepository

settings = get_settings()
logger = get_logger("escrow")

CF_SANDBOX = "https://sandbox.cashfree.com/pg"
CF_PROD = "https://api.cashfree.com/pg"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class EscrowService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserRepository(db)
        self.notif = NotificationService(db)
        self._base_url = CF_PROD if settings.cashfree_env == "production" else CF_SANDBOX

    # ── Lookup helpers ────────────────────────────────────────────────────────

    def _get_contract(self, contract_id: uuid.UUID) -> EscrowContract:
        contract = (
            self.db.query(EscrowContract)
            .options(
                joinedload(EscrowContract.milestones),
                joinedload(EscrowContract.ledger_entries),
                joinedload(EscrowContract.disputes),
            )
            .filter(EscrowContract.id == contract_id)
            .first()
        )
        if not contract:
            raise NotFoundError("Escrow contract")
        return contract

    def _get_milestone(self, milestone_id: uuid.UUID) -> Milestone:
        m = self.db.get(Milestone, milestone_id)
        if not m:
            raise NotFoundError("Milestone")
        return m

    def _assert_party(self, contract: EscrowContract, user: User) -> None:
        if user.id not in (contract.client_id, contract.builder_id) and user.role != UserRole.ADMIN:
            raise ForbiddenError("You are not a party to this contract")

    def get_contract(self, contract_id: uuid.UUID, user: User) -> EscrowContract:
        contract = self._get_contract(contract_id)
        self._assert_party(contract, user)
        return contract

    def list_contracts(self, user: User) -> list[EscrowContract]:
        return (
            self.db.query(EscrowContract)
            .options(joinedload(EscrowContract.milestones))
            .filter(
                (EscrowContract.client_id == user.id)
                | (EscrowContract.builder_id == user.id)
            )
            .order_by(EscrowContract.created_at.desc())
            .all()
        )

    # ── Create ────────────────────────────────────────────────────────────────

    def create_contract(self, client: User, data: ContractCreate) -> EscrowContract:
        if data.builder_id == client.id:
            raise ValidationError("You cannot open an escrow contract with yourself")

        builder = self.users.get_by_id(data.builder_id)
        if not builder or not builder.is_active:
            raise ValidationError("Builder not found")

        total = sum(m.amount_paise for m in data.milestones)
        if total <= 0:
            raise ValidationError("Contract total must be greater than zero")

        contract = EscrowContract(
            client_id=client.id,
            builder_id=data.builder_id,
            project_id=data.project_id,
            title=data.title,
            description=data.description,
            total_amount_paise=total,
            commission_bps=data.commission_bps,
            status=EscrowContractStatus.AWAITING_FUNDING,
        )
        self.db.add(contract)
        self.db.flush()

        for idx, m in enumerate(data.milestones, start=1):
            self.db.add(
                Milestone(
                    contract_id=contract.id,
                    sequence=idx,
                    title=m.title,
                    description=m.description,
                    amount_paise=m.amount_paise,
                    due_date=m.due_date,
                    status=MilestoneStatus.PENDING,
                )
            )
        self.db.commit()

        self.notif.create(
            recipient_id=builder.id,
            type=NotificationType.SYSTEM,
            title="New escrow contract proposed",
            body=f"{client.email} proposed '{contract.title}' worth "
                 f"\u20b9{total / 100:.0f} across {len(data.milestones)} milestone(s)",
            link=f"/escrow/{contract.id}",
        )
        logger.info("Escrow contract created", contract_id=str(contract.id), total=total)
        return self._get_contract(contract.id)

    # ── Funding ───────────────────────────────────────────────────────────────

    def _cf_headers(self) -> dict:
        return {
            "x-client-id": settings.cashfree_app_id,
            "x-client-secret": settings.cashfree_secret_key,
            "x-api-version": "2023-08-01",
            "Content-Type": "application/json",
        }

    async def fund_contract(self, client: User, contract_id: uuid.UUID) -> dict:
        contract = self._get_contract(contract_id)
        if contract.client_id != client.id:
            raise ForbiddenError("Only the client can fund this contract")
        if contract.status != EscrowContractStatus.AWAITING_FUNDING:
            raise ConflictError(f"Contract cannot be funded from status '{contract.status.value}'")

        # Refuse to take real money we have no way to pay out. Milestone approval
        # only writes a ledger RELEASE entry; the transfer to the builder is a
        # separate, currently manual step. Collecting escrow funds without an
        # agreed settlement process would leave builders unpaid while the cash
        # sits in the platform's account.
        #
        # Keyed on the Cashfree environment, not APP_ENV: sandbox keys move no real
        # money, so a staging or UAT deployment can still exercise the full
        # lifecycle. Only live keys are gated.
        collecting_real_money = settings.cashfree_env == "production"
        if collecting_real_money and not settings.escrow_manual_settlement:
            raise PaymentError(
                "Escrow funding is disabled. Releasing a milestone records the "
                "amount owed but does not transfer it, so no payout would reach "
                "the builder. Enable ESCROW_MANUAL_SETTLEMENT once a settlement "
                "process is in place."
            )

        # Dev / showcase path: no Cashfree keys configured -> simulate funding so
        # the full lifecycle can be demonstrated end-to-end. NEVER in production:
        # simulating a real money movement without a payment rail would be a
        # serious financial-integrity bug, so we hard-fail instead.
        if not settings.cashfree_app_id:
            if settings.is_production:
                raise PaymentError(
                    "Escrow funding is not configured. Set Cashfree credentials before accepting payments."
                )
            self._mark_funded(contract)
            self.db.commit()
            logger.warning("Escrow funded in DEV mode (Cashfree not configured)", contract_id=str(contract.id))
            return {
                "contract_id": contract.id,
                "order_id": None,
                "cf_order_token": None,
                "amount_paise": contract.total_amount_paise,
                "dev_mode": True,
            }

        order_id = f"ESC-{uuid.uuid4().hex[:12].upper()}"
        cf_payload = {
            "order_id": order_id,
            "order_amount": contract.total_amount_paise / 100,
            "order_currency": contract.currency,
            "customer_details": {
                "customer_id": str(client.id),
                "customer_email": client.email,
                "customer_phone": "9999999999",
            },
            "order_meta": {
                "return_url": f"{settings.frontend_url}/escrow/{contract.id}",
                # Must be this API, not the frontend. The old string-replace of
                # port 3000->8000 silently did nothing once deployed, pointing the
                # webhook at Vercel so funding was never confirmed.
                "notify_url": f"{settings.api_base_url}/escrow/webhook",
            },
            "order_note": f"escrow:{contract.id}",
        }
        async with httpx.AsyncClient(timeout=15.0) as cli:
            resp = await cli.post(f"{self._base_url}/orders", headers=self._cf_headers(), json=cf_payload)
            if resp.status_code not in (200, 201):
                logger.error("Cashfree escrow order failed", status=resp.status_code, body=resp.text)
                raise PaymentError("Failed to create escrow funding order. Please try again.")
            cf_data = resp.json()

        contract.cf_order_id = order_id
        contract.cf_order_token = cf_data.get("payment_session_id")
        self.db.commit()
        return {
            "contract_id": contract.id,
            "order_id": order_id,
            "cf_order_token": cf_data.get("payment_session_id", ""),
            "amount_paise": contract.total_amount_paise,
            "dev_mode": False,
        }

    def _mark_funded(self, contract: EscrowContract) -> None:
        """Transition a contract to ACTIVE and move all milestones to FUNDED."""
        contract.status = EscrowContractStatus.ACTIVE
        contract.funded_at = _now()
        for m in contract.milestones:
            if m.status == MilestoneStatus.PENDING:
                m.status = MilestoneStatus.FUNDED
                self.db.add(
                    EscrowLedgerEntry(
                        contract_id=contract.id,
                        milestone_id=m.id,
                        entry_type=EscrowEntryType.FUND,
                        amount_paise=m.amount_paise,
                        note=f"Funded milestone '{m.title}'",
                    )
                )
        self.notif.create(
            recipient_id=contract.builder_id,
            type=NotificationType.PAYMENT_SUCCESS,
            title="Escrow funded \u2014 you can start work",
            body=f"'{contract.title}' is now funded. Funds are held safely in escrow.",
            link=f"/escrow/{contract.id}",
        )

    def handle_funding_webhook(self, payload: bytes, signature: str) -> dict:
        computed = hmac.new(
            settings.cashfree_secret_key.encode(), payload, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(computed, signature):
            raise ValidationError("Invalid webhook signature")

        data = json.loads(payload)
        order_id = data.get("data", {}).get("order", {}).get("order_id")
        pay_status = data.get("data", {}).get("payment", {}).get("payment_status")
        if not order_id:
            return {"status": "ignored"}

        contract = (
            self.db.query(EscrowContract)
            .options(joinedload(EscrowContract.milestones))
            .filter(EscrowContract.cf_order_id == order_id)
            .first()
        )
        if not contract:
            return {"status": "unknown_order"}

        if pay_status == "SUCCESS" and contract.status == EscrowContractStatus.AWAITING_FUNDING:
            self._mark_funded(contract)
            self.db.commit()
        return {"status": "ok"}

    # ── Milestone workflow ─────────────────────────────────────────────────────

    def submit_milestone(self, builder: User, milestone_id: uuid.UUID, data: MilestoneSubmit) -> Milestone:
        m = self._get_milestone(milestone_id)
        contract = self._get_contract(m.contract_id)
        if contract.builder_id != builder.id:
            raise ForbiddenError("Only the builder can submit work")
        if contract.status != EscrowContractStatus.ACTIVE:
            raise ConflictError("Contract is not active")
        if m.status not in (MilestoneStatus.FUNDED, MilestoneStatus.REJECTED):
            raise ConflictError(f"Milestone cannot be submitted from '{m.status.value}'")

        m.status = MilestoneStatus.SUBMITTED
        m.proof_url = data.proof_url
        m.proof_note = data.proof_note
        m.submitted_at = _now()
        self.db.commit()
        self.notif.create(
            recipient_id=contract.client_id,
            type=NotificationType.SYSTEM,
            title="Milestone submitted for review",
            body=f"'{m.title}' was submitted. Review and approve to release payment.",
            link=f"/escrow/{contract.id}",
        )
        return m

    def approve_milestone(self, client: User, milestone_id: uuid.UUID) -> Milestone:
        m = self._get_milestone(milestone_id)
        contract = self._get_contract(m.contract_id)
        if contract.client_id != client.id:
            raise ForbiddenError("Only the client can approve work")
        if m.status != MilestoneStatus.SUBMITTED:
            raise ConflictError(f"Milestone cannot be approved from '{m.status.value}'")
        m.status = MilestoneStatus.APPROVED
        m.approved_at = _now()
        self._release_milestone(contract, m)
        self.db.commit()
        return m

    def reject_milestone(self, client: User, milestone_id: uuid.UUID, note: str | None) -> Milestone:
        m = self._get_milestone(milestone_id)
        contract = self._get_contract(m.contract_id)
        if contract.client_id != client.id:
            raise ForbiddenError("Only the client can reject work")
        if m.status != MilestoneStatus.SUBMITTED:
            raise ConflictError(f"Milestone cannot be rejected from '{m.status.value}'")
        m.status = MilestoneStatus.REJECTED
        m.proof_note = (m.proof_note or "") + (f"\n[Client rejection] {note}" if note else "")
        self.db.commit()
        self.notif.create(
            recipient_id=contract.builder_id,
            type=NotificationType.SYSTEM,
            title="Milestone changes requested",
            body=f"'{m.title}' needs changes. Address the feedback and resubmit.",
            link=f"/escrow/{contract.id}",
        )
        return m

    def _release_milestone(self, contract: EscrowContract, m: Milestone) -> None:
        """Release a milestone's funds to the builder, net of platform commission."""
        commission = (m.amount_paise * contract.commission_bps) // 10000
        net = m.amount_paise - commission

        self.db.add(
            EscrowLedgerEntry(
                contract_id=contract.id, milestone_id=m.id,
                entry_type=EscrowEntryType.RELEASE, amount_paise=net,
                note=f"Approved for '{m.title}' — owed to builder, awaiting transfer",
            )
        )
        if commission > 0:
            self.db.add(
                EscrowLedgerEntry(
                    contract_id=contract.id, milestone_id=m.id,
                    entry_type=EscrowEntryType.COMMISSION, amount_paise=commission,
                    note=f"Platform commission ({contract.commission_bps / 100:.1f}%)",
                )
            )
        m.status = MilestoneStatus.RELEASED
        m.released_at = _now()
        # Deliberately left unset. payout_reference holds the identifier of a real
        # bank transfer, so it stays NULL until one exists — a NULL reference on a
        # RELEASED milestone is the queue of payouts still owed. Generating a
        # placeholder here previously made unpaid milestones look settled.
        m.payout_reference = None

        self.notif.create(
            recipient_id=contract.builder_id,
            type=NotificationType.PAYMENT_SUCCESS,
            title="Milestone approved",
            body=(
                f"\u20b9{net / 100:.0f} approved for '{m.title}' and recorded as "
                f"owed to you. You'll be notified once the transfer is made."
            ),
            link=f"/escrow/{contract.id}",
        )

        # Contract completion: every milestone released.
        if all(ms.status == MilestoneStatus.RELEASED for ms in contract.milestones):
            contract.status = EscrowContractStatus.COMPLETED
            contract.completed_at = _now()
            self._reward_completion(contract)

    def _reward_completion(self, contract: EscrowContract) -> None:
        """Feed a successful delivery into the builder's reputation (authoritative recompute)."""
        from app.users.reputation import ReputationService
        ReputationService(self.db).recompute(contract.builder_id, commit=False)
        self.notif.create(
            recipient_id=contract.builder_id,
            type=NotificationType.SYSTEM,
            title="Contract completed \U0001f389",
            body=f"'{contract.title}' is complete. Your delivery reputation improved.",
            link=f"/escrow/{contract.id}",
        )

    # ── Cancellation ────────────────────────────────────────────────────────────

    def cancel_contract(self, user: User, contract_id: uuid.UUID) -> EscrowContract:
        contract = self._get_contract(contract_id)
        if user.id != contract.client_id and user.role != UserRole.ADMIN:
            raise ForbiddenError("Only the client can cancel this contract")
        if contract.status not in (EscrowContractStatus.DRAFT, EscrowContractStatus.AWAITING_FUNDING):
            raise ConflictError("Only an unfunded contract can be cancelled")
        contract.status = EscrowContractStatus.CANCELLED
        self.db.commit()
        return contract

    # ── Disputes ────────────────────────────────────────────────────────────────

    def raise_dispute(self, user: User, contract_id: uuid.UUID, data: DisputeCreate) -> Dispute:
        contract = self._get_contract(contract_id)
        self._assert_party(contract, user)
        if contract.status not in (EscrowContractStatus.ACTIVE, EscrowContractStatus.DISPUTED):
            raise ConflictError("Only an active contract can be disputed")

        milestone = None
        if data.milestone_id:
            milestone = self._get_milestone(data.milestone_id)
            if milestone.contract_id != contract.id:
                raise ValidationError("Milestone does not belong to this contract")
            if milestone.status == MilestoneStatus.RELEASED:
                raise ConflictError("A released milestone cannot be disputed")
            milestone.status = MilestoneStatus.DISPUTED

        dispute = Dispute(
            contract_id=contract.id,
            milestone_id=data.milestone_id,
            raised_by_id=user.id,
            reason=data.reason,
            status=DisputeStatus.OPEN,
        )
        contract.status = EscrowContractStatus.DISPUTED
        self.db.add(dispute)
        self.db.commit()

        other = contract.builder_id if user.id == contract.client_id else contract.client_id
        self.notif.create(
            recipient_id=other, type=NotificationType.SYSTEM,
            title="Dispute raised on your contract",
            body=f"A dispute was opened on '{contract.title}'. Our team will review it.",
            link=f"/escrow/{contract.id}",
        )
        logger.info("Dispute raised", contract_id=str(contract.id), dispute_id=str(dispute.id))
        return dispute

    def _refund_milestone(self, contract: EscrowContract, m: Milestone, amount_paise: int, note: str) -> None:
        self.db.add(
            EscrowLedgerEntry(
                contract_id=contract.id, milestone_id=m.id,
                entry_type=EscrowEntryType.REFUND, amount_paise=amount_paise, note=note,
            )
        )
        self.notif.create(
            recipient_id=contract.client_id, type=NotificationType.PAYMENT_SUCCESS,
            title="Refund issued", body=f"\u20b9{amount_paise / 100:.0f} refunded for '{m.title}'.",
            link=f"/escrow/{contract.id}",
        )

    def resolve_dispute(self, admin: User, dispute_id: uuid.UUID, data: DisputeResolve) -> Dispute:
        if admin.role != UserRole.ADMIN:
            raise ForbiddenError("Only an admin can resolve disputes")
        dispute = self.db.get(Dispute, dispute_id)
        if not dispute:
            raise NotFoundError("Dispute")
        if dispute.status != DisputeStatus.OPEN:
            raise ConflictError("Dispute is already resolved")
        if data.resolution not in (
            DisputeStatus.RESOLVED_RELEASE, DisputeStatus.RESOLVED_REFUND, DisputeStatus.RESOLVED_SPLIT
        ):
            raise ValidationError("Invalid resolution")

        contract = self._get_contract(dispute.contract_id)
        m = self._get_milestone(dispute.milestone_id) if dispute.milestone_id else None

        if m is not None:
            if data.resolution == DisputeStatus.RESOLVED_RELEASE:
                m.status = MilestoneStatus.APPROVED
                m.approved_at = _now()
                self._release_milestone(contract, m)
            elif data.resolution == DisputeStatus.RESOLVED_REFUND:
                m.status = MilestoneStatus.REJECTED
                self._refund_milestone(contract, m, m.amount_paise, f"Dispute refund for '{m.title}'")
            else:  # RESOLVED_SPLIT
                half = m.amount_paise // 2
                commission = (half * contract.commission_bps) // 10000
                self.db.add(EscrowLedgerEntry(
                    contract_id=contract.id, milestone_id=m.id,
                    entry_type=EscrowEntryType.RELEASE, amount_paise=half - commission,
                    note=f"Split release for '{m.title}'"))
                if commission > 0:
                    self.db.add(EscrowLedgerEntry(
                        contract_id=contract.id, milestone_id=m.id,
                        entry_type=EscrowEntryType.COMMISSION, amount_paise=commission,
                        note="Platform commission (split)"))
                self._refund_milestone(contract, m, m.amount_paise - half, f"Split refund for '{m.title}'")
                m.status = MilestoneStatus.RELEASED
                m.released_at = _now()

        dispute.status = data.resolution
        dispute.resolution_note = data.note
        dispute.resolver_id = admin.id
        dispute.resolved_at = _now()

        # Recompute contract status.
        open_left = any(d.status == DisputeStatus.OPEN for d in contract.disputes if d.id != dispute.id)
        if open_left:
            contract.status = EscrowContractStatus.DISPUTED
        elif all(ms.status == MilestoneStatus.RELEASED for ms in contract.milestones):
            contract.status = EscrowContractStatus.COMPLETED
            contract.completed_at = _now()
            self._reward_completion(contract)
        else:
            contract.status = EscrowContractStatus.ACTIVE
        self.db.commit()
        logger.info("Dispute resolved", dispute_id=str(dispute.id), resolution=data.resolution.value)
        return dispute
