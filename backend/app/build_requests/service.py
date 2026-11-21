import uuid
from datetime import datetime, timezone

from sqlalchemy import desc, func
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.build_requests.models import BuildApplication, BuildRequest
from app.build_requests.schemas import BuildApplicationCreate, BuildRequestCreate


class BuildRequestService:
    def __init__(self, db: Session):
        self.db = db

    # ── Requests ──────────────────────────────────────────────────────────────

    def create(self, poster_id: uuid.UUID, data: BuildRequestCreate) -> BuildRequest:
        req = BuildRequest(
            poster_id=poster_id,
            title=data.title,
            description=data.description,
            budget_paise=data.budget_paise,
            skills=data.skills,
            timeline_days=data.timeline_days,
            status="open",
        )
        self.db.add(req)
        self.db.commit()
        self.db.refresh(req)
        return req

    def get(self, request_id: uuid.UUID) -> BuildRequest:
        req = (
            self.db.query(BuildRequest)
            .options(joinedload(BuildRequest.poster))
            .filter(BuildRequest.id == request_id)
            .first()
        )
        if not req:
            raise NotFoundError("Build request")
        return req

    def list_open(self, search: str | None = None, skill: str | None = None) -> list[BuildRequest]:
        q = (
            self.db.query(BuildRequest)
            .options(joinedload(BuildRequest.poster))
            .filter(BuildRequest.status == "open")
        )
        if search:
            like = f"%{search.strip()}%"
            q = q.filter(BuildRequest.title.ilike(like))
        rows = q.order_by(desc(BuildRequest.created_at)).limit(100).all()
        if skill:
            rows = [r for r in rows if skill in (r.skills or [])]
        return rows

    def list_mine(self, poster_id: uuid.UUID) -> list[BuildRequest]:
        return (
            self.db.query(BuildRequest)
            .filter(BuildRequest.poster_id == poster_id)
            .order_by(desc(BuildRequest.created_at))
            .all()
        )

    def list_assigned(self, builder_id: uuid.UUID) -> list[BuildRequest]:
        return (
            self.db.query(BuildRequest)
            .filter(BuildRequest.assigned_builder_id == builder_id)
            .order_by(desc(BuildRequest.created_at))
            .all()
        )

    def application_count(self, request_id: uuid.UUID) -> int:
        return (
            self.db.query(func.count(BuildApplication.id))
            .filter(BuildApplication.request_id == request_id)
            .scalar()
            or 0
        )

    def update_status(self, request_id: uuid.UUID, poster_id: uuid.UUID, status: str) -> BuildRequest:
        req = self.get(request_id)
        if req.poster_id != poster_id:
            raise ForbiddenError("Not your request")
        if req.status in ("completed", "cancelled"):
            raise ValidationError("Request is already closed")
        if status == "completed" and req.status != "in_progress":
            raise ValidationError("Only an in-progress request can be completed")
        req.status = status
        if status == "completed":
            req.completed_at = datetime.now(timezone.utc)
            if req.assigned_builder_id:
                self._notify(
                    req.assigned_builder_id,
                    "Build request completed",
                    f"'{req.title}' was marked complete. Settle payment as agreed.",
                    f"/requests/{req.id}",
                )
        self.db.commit()
        self.db.refresh(req)
        return req

    # ── Applications ────────────────────────────────────────────────────────────

    def apply(
        self, request_id: uuid.UUID, builder_id: uuid.UUID, data: BuildApplicationCreate
    ) -> BuildApplication:
        req = self.get(request_id)
        if req.poster_id == builder_id:
            raise ValidationError("You cannot apply to your own request")
        if req.status != "open":
            raise ValidationError("This request is no longer accepting applications")
        existing = (
            self.db.query(BuildApplication)
            .filter(
                BuildApplication.request_id == request_id,
                BuildApplication.builder_id == builder_id,
            )
            .first()
        )
        if existing:
            raise ConflictError("You already applied to this request")

        app = BuildApplication(
            request_id=request_id,
            builder_id=builder_id,
            cover_note=data.cover_note,
            quoted_paise=data.quoted_paise,
            estimated_days=data.estimated_days,
            status="pending",
        )
        self.db.add(app)
        self.db.commit()
        self.db.refresh(app)

        self._notify(
            req.poster_id,
            "New application",
            f"A builder applied to '{req.title}'.",
            f"/requests/{req.id}",
        )
        return app

    def list_applications(self, request_id: uuid.UUID, poster_id: uuid.UUID) -> list[BuildApplication]:
        req = self.get(request_id)
        if req.poster_id != poster_id:
            raise ForbiddenError("Not your request")
        return (
            self.db.query(BuildApplication)
            .options(joinedload(BuildApplication.builder))
            .filter(BuildApplication.request_id == request_id)
            .order_by(desc(BuildApplication.created_at))
            .all()
        )

    def my_application(self, request_id: uuid.UUID, builder_id: uuid.UUID) -> BuildApplication | None:
        return (
            self.db.query(BuildApplication)
            .filter(
                BuildApplication.request_id == request_id,
                BuildApplication.builder_id == builder_id,
            )
            .first()
        )

    def accept_application(self, application_id: uuid.UUID, poster_id: uuid.UUID) -> BuildApplication:
        app = self.db.query(BuildApplication).filter(BuildApplication.id == application_id).first()
        if not app:
            raise NotFoundError("Application")
        req = self.get(app.request_id)
        if req.poster_id != poster_id:
            raise ForbiddenError("Not your request")
        if req.status != "open":
            raise ValidationError("This request already has an accepted builder")

        app.status = "accepted"
        req.status = "in_progress"
        req.assigned_builder_id = app.builder_id
        # Reject other pending applications.
        for other in req.applications:
            if other.id != app.id and other.status == "pending":
                other.status = "rejected"
        self.db.commit()
        self.db.refresh(app)

        self._notify(
            app.builder_id,
            "You were selected!",
            f"Your application for '{req.title}' was accepted. Coordinate next steps with the poster.",
            f"/requests/{req.id}",
        )
        return app

    def reject_application(self, application_id: uuid.UUID, poster_id: uuid.UUID) -> BuildApplication:
        app = self.db.query(BuildApplication).filter(BuildApplication.id == application_id).first()
        if not app:
            raise NotFoundError("Application")
        req = self.get(app.request_id)
        if req.poster_id != poster_id:
            raise ForbiddenError("Not your request")
        if app.status != "pending":
            raise ValidationError("Application is not pending")
        app.status = "rejected"
        self.db.commit()
        self.db.refresh(app)
        return app

    def withdraw_application(self, application_id: uuid.UUID, builder_id: uuid.UUID) -> BuildApplication:
        app = self.db.query(BuildApplication).filter(BuildApplication.id == application_id).first()
        if not app:
            raise NotFoundError("Application")
        if app.builder_id != builder_id:
            raise ForbiddenError("Not your application")
        if app.status not in ("pending", "accepted"):
            raise ValidationError("Application cannot be withdrawn")
        app.status = "withdrawn"
        self.db.commit()
        self.db.refresh(app)
        return app

    # ── Internal ────────────────────────────────────────────────────────────────

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
        except Exception:
            pass
