"""Incubation offers + incubator discovery."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.incubation.models import IncubationOffer, OfferStatus
from app.incubation.schemas import OfferCreate
from app.projects.repository import ProjectRepository
from app.users.models import User

logger = get_logger("incubation")


class IncubationService:
    def __init__(self, db: Session):
        self.db = db
        self.projects = ProjectRepository(db)

    def _get_offer(self, offer_id: uuid.UUID) -> IncubationOffer:
        offer = self.db.get(IncubationOffer, offer_id)
        if not offer:
            raise NotFoundError("Offer")
        return offer

    def create_offer(self, incubator: User, data: OfferCreate) -> IncubationOffer:
        project = self.projects.get_by_id(data.project_id)
        if not project:
            raise NotFoundError("Project")
        if project.owner_id == incubator.id:
            raise ValidationError("You cannot make an offer on your own project")

        existing = (
            self.db.query(IncubationOffer)
            .filter(
                IncubationOffer.incubator_id == incubator.id,
                IncubationOffer.project_id == data.project_id,
                IncubationOffer.status == OfferStatus.PENDING,
            )
            .first()
        )
        if existing:
            raise ConflictError("You already have a pending offer on this project")

        offer = IncubationOffer(
            incubator_id=incubator.id,
            project_id=data.project_id,
            offer_type=data.offer_type,
            title=data.title,
            message=data.message,
            amount_paise=data.amount_paise,
            equity_percent=data.equity_percent,
            status=OfferStatus.PENDING,
        )
        self.db.add(offer)
        self.db.commit()
        self._notify(project.owner_id, "New offer received",
                     f"You received a {data.offer_type.value} offer: {data.title}",
                     f"/incubation")
        owner = self.db.get(User, project.owner_id)
        if owner and owner.email:
            from app.core.email import send_offer_received_email
            send_offer_received_email(owner.email, offer.title, data.offer_type.value, project.title)
        logger.info("Incubation offer created", offer_id=str(offer.id), project_id=str(data.project_id))
        return offer

    def list_received(self, owner: User) -> list[IncubationOffer]:
        """Offers on projects owned by this user."""
        owned = [p.id for p in self.projects.get_by_owner(owner.id)]
        if not owned:
            return []
        return (
            self.db.query(IncubationOffer)
            .options(joinedload(IncubationOffer.project))
            .filter(IncubationOffer.project_id.in_(owned))
            .order_by(desc(IncubationOffer.created_at))
            .all()
        )

    def list_sent(self, incubator: User) -> list[IncubationOffer]:
        return (
            self.db.query(IncubationOffer)
            .options(joinedload(IncubationOffer.project))
            .filter(IncubationOffer.incubator_id == incubator.id)
            .order_by(desc(IncubationOffer.created_at))
            .all()
        )

    def respond(self, owner: User, offer_id: uuid.UUID, accept: bool, note: str | None) -> IncubationOffer:
        offer = self._get_offer(offer_id)
        project = self.projects.get_by_id(offer.project_id)
        if not project or project.owner_id != owner.id:
            raise ForbiddenError("Only the project owner can respond to this offer")
        if offer.status != OfferStatus.PENDING:
            raise ConflictError("This offer has already been resolved")

        offer.status = OfferStatus.ACCEPTED if accept else OfferStatus.DECLINED
        offer.response_note = note
        offer.responded_at = datetime.now(timezone.utc)
        self.db.commit()
        self._notify(offer.incubator_id,
                     f"Offer {'accepted' if accept else 'declined'}",
                     f"Your offer '{offer.title}' was {'accepted' if accept else 'declined'}.",
                     "/incubation")
        incubator = self.db.get(User, offer.incubator_id)
        if incubator and incubator.email:
            from app.core.email import send_offer_response_email
            send_offer_response_email(incubator.email, offer.title, accept)
        return offer

    def withdraw(self, incubator: User, offer_id: uuid.UUID) -> IncubationOffer:
        offer = self._get_offer(offer_id)
        if offer.incubator_id != incubator.id:
            raise ForbiddenError("Not your offer")
        if offer.status != OfferStatus.PENDING:
            raise ConflictError("Only a pending offer can be withdrawn")
        offer.status = OfferStatus.WITHDRAWN
        self.db.commit()
        return offer

    def discover(self, limit: int = 20) -> list[dict]:
        """Verified projects ranked by build score, enriched with owner reputation tier."""
        from app.projects.models import Project, ProjectVerification, ProjectAnalysis
        from app.users.models import BuilderReputation, Profile

        rows = (
            self.db.query(Project, ProjectVerification, Profile, BuilderReputation, ProjectAnalysis)
            .join(ProjectVerification, ProjectVerification.project_id == Project.id)
            .join(Profile, Profile.user_id == Project.owner_id)
            .outerjoin(BuilderReputation, BuilderReputation.user_id == Project.owner_id)
            .outerjoin(ProjectAnalysis, ProjectAnalysis.project_id == Project.id)
            .filter(
                Project.is_deleted == False,  # noqa: E712
                Project.is_private == False,  # noqa: E712
                Project.is_verified == True,  # noqa: E712
            )
            .order_by(desc(ProjectVerification.verified_build_score))
            .limit(limit)
            .all()
        )
        return [
            {
                "project_id": proj.id,
                "title": proj.title,
                "repo_full_name": proj.repo_full_name,
                "owner_id": proj.owner_id,
                "owner_name": profile.display_name or "Builder",
                "owner_tier": rep.tier if rep else "newcomer",
                "verified_build_score": ver.verified_build_score,
                "startup_potential": analysis.startup_potential if analysis else None,
                "stars": proj.stars,
            }
            for proj, ver, profile, rep, analysis in rows
        ]

    def _notify(self, recipient_id: uuid.UUID, title: str, body: str, link: str) -> None:
        from app.notifications.models import NotificationType
        from app.notifications.service import NotificationService
        NotificationService(self.db).create(
            recipient_id=recipient_id, type=NotificationType.SYSTEM,
            title=title, body=body, link=link,
        )
