import uuid
from datetime import datetime, timezone

from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from app.adoption.models import AdoptionRequest
from app.adoption.schemas import AdoptionRequestCreate
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.core.logging import get_logger
from app.projects.models import ProjectStatus
from app.projects.repository import ProjectRepository

logger = get_logger("adoption")


class AdoptionService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ProjectRepository(db)

    # ── Owner controls ────────────────────────────────────────────────────────

    def set_open_for_adoption(
        self, project_id: uuid.UUID, owner_id: uuid.UUID, is_open: bool
    ):
        project = self._owned(project_id, owner_id)
        project.is_open_for_adoption = is_open
        self.db.commit()
        self.db.refresh(project)
        return project

    # ── Requests ──────────────────────────────────────────────────────────────

    def request_adoption(
        self, project_id: uuid.UUID, requester_id: uuid.UUID, data: AdoptionRequestCreate
    ) -> AdoptionRequest:
        project = self.repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project")
        if project.owner_id == requester_id:
            raise ValidationError("You already own this project")
        if not project.is_open_for_adoption:
            raise ValidationError("This project is not open for adoption")

        existing = (
            self.db.query(AdoptionRequest)
            .filter(
                AdoptionRequest.project_id == project_id,
                AdoptionRequest.requester_id == requester_id,
            )
            .first()
        )
        if existing:
            if existing.status == "pending":
                raise ConflictError("You already have a pending adoption request")
            # Allow re-applying after a previous rejection/withdrawal.
            existing.status = "pending"
            existing.message = data.message
            existing.continuation_plan = data.continuation_plan
            existing.resolved_at = None
            existing.resolution_note = None
            req = existing
        else:
            req = AdoptionRequest(
                project_id=project_id,
                requester_id=requester_id,
                message=data.message,
                continuation_plan=data.continuation_plan,
                status="pending",
            )
            self.db.add(req)

        self.db.commit()
        self.db.refresh(req)

        self._notify(
            project.owner_id,
            "New adoption request",
            f"Someone wants to take over '{project.title}' and continue it.",
            f"/projects/{project_id}",
        )
        return req

    def list_for_project(
        self, project_id: uuid.UUID, owner_id: uuid.UUID
    ) -> list[AdoptionRequest]:
        self._owned(project_id, owner_id)
        return (
            self.db.query(AdoptionRequest)
            .options(joinedload(AdoptionRequest.requester))
            .filter(AdoptionRequest.project_id == project_id)
            .order_by(desc(AdoptionRequest.created_at))
            .all()
        )

    def my_request(
        self, project_id: uuid.UUID, requester_id: uuid.UUID
    ) -> AdoptionRequest | None:
        return (
            self.db.query(AdoptionRequest)
            .filter(
                AdoptionRequest.project_id == project_id,
                AdoptionRequest.requester_id == requester_id,
            )
            .first()
        )

    def withdraw(self, request_id: uuid.UUID, requester_id: uuid.UUID) -> AdoptionRequest:
        req = self.db.get(AdoptionRequest, request_id)
        if not req:
            raise NotFoundError("Adoption request")
        if req.requester_id != requester_id:
            raise ForbiddenError("Not your request")
        if req.status != "pending":
            raise ValidationError("Only a pending request can be withdrawn")
        req.status = "withdrawn"
        req.resolved_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(req)
        return req

    # ── Resolution (the actual ownership transfer) ─────────────────────────────

    def resolve(
        self,
        request_id: uuid.UUID,
        owner_id: uuid.UUID,
        approve: bool,
        note: str | None = None,
    ) -> AdoptionRequest:
        req = self.db.get(AdoptionRequest, request_id)
        if not req:
            raise NotFoundError("Adoption request")

        project = self._owned(req.project_id, owner_id)
        if req.status != "pending":
            raise ValidationError("This request has already been resolved")

        now = datetime.now(timezone.utc)
        req.resolved_at = now
        req.resolution_note = note

        if not approve:
            req.status = "rejected"
            self.db.commit()
            self.db.refresh(req)
            self._notify(
                req.requester_id,
                "Adoption request declined",
                f"Your request to adopt '{project.title}' was declined.",
                f"/projects/{project.id}",
            )
            return req

        # ── Transfer ownership ───────────────────────────────────────────────
        previous_owner_id = project.owner_id
        new_owner_id = req.requester_id

        project.previous_owner_id = previous_owner_id
        project.owner_id = new_owner_id
        project.adopted_at = now.isoformat()
        project.is_open_for_adoption = False
        # An adopted project is being actively continued.
        project.status = ProjectStatus.REVIVED
        # Ownership verification belongs to the old owner's GitHub account —
        # the new owner must re-verify, so clear the verified flag.
        project.is_verified = False
        verification = self.repo.get_verification(project.id)
        if verification:
            verification.ownership_verified = False

        # Keep the original author involved (and preserve their credit).
        if not self.repo.is_collaborator(project.id, previous_owner_id):
            self.repo.add_collaborator(project.id, previous_owner_id, role="original_author")

        req.status = "approved"

        from app.projects.models import ProjectEventType
        from app.projects.timeline import record_event
        record_event(
            self.db, project.id, ProjectEventType.ADOPTED,
            "Project adopted — development continues",
            "Ownership transferred to a new builder. The original author remains credited.",
            actor_id=new_owner_id,
        )

        # Any other pending requests for this project are now moot.
        others = (
            self.db.query(AdoptionRequest)
            .filter(
                AdoptionRequest.project_id == project.id,
                AdoptionRequest.id != req.id,
                AdoptionRequest.status == "pending",
            )
            .all()
        )
        for other in others:
            other.status = "rejected"
            other.resolved_at = now
            other.resolution_note = "Project was adopted by another builder"

        self.db.commit()
        self.db.refresh(req)

        self._refresh_reputation(previous_owner_id)
        self._refresh_reputation(new_owner_id)

        self._notify(
            new_owner_id,
            "You adopted a project!",
            f"'{project.title}' is now yours. Re-verify GitHub ownership to restore its verified badge.",
            f"/projects/{project.id}",
        )
        for other in others:
            self._notify(
                other.requester_id,
                "Project already adopted",
                f"'{project.title}' was adopted by another builder.",
                f"/projects/{project.id}",
            )

        logger.info(
            "Project ownership transferred",
            project_id=str(project.id),
            from_user=str(previous_owner_id),
            to_user=str(new_owner_id),
        )
        return req

    # ── Internals ─────────────────────────────────────────────────────────────

    def _owned(self, project_id: uuid.UUID, owner_id: uuid.UUID):
        project = self.repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project")
        if project.owner_id != owner_id:
            raise ForbiddenError("You do not own this project")
        return project

    def _refresh_reputation(self, user_id: uuid.UUID) -> None:
        """Recount owned/verified projects after a transfer."""
        from app.users.repository import UserRepository
        try:
            projects = self.repo.get_by_owner(user_id)
            rep = UserRepository(self.db).get_reputation(user_id)
            if rep:
                rep.total_projects = len(projects)
                rep.verified_projects = sum(1 for p in projects if p.is_verified)
                self.db.commit()
        except Exception:
            pass

    def _notify(self, recipient_id: uuid.UUID, title: str, body: str, link: str) -> None:
        from app.notifications.models import NotificationType
        from app.notifications.service import NotificationService
        try:
            NotificationService(self.db).create(
                recipient_id=recipient_id,
                type=NotificationType.SYSTEM,
                title=title,
                body=body,
                link=link,
            )
            self.db.commit()
        except Exception:
            pass
