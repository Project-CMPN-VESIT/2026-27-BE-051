import uuid
from datetime import datetime, timezone

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.moderation.models import Report
from app.moderation.schemas import ReportCreate, ReportResolve


class ModerationService:
    def __init__(self, db: Session):
        self.db = db

    def create_report(self, reporter_id: uuid.UUID, data: ReportCreate) -> Report:
        # Validate the target exists (projects only for now).
        if data.target_type == "project":
            from app.projects.repository import ProjectRepository
            try:
                project = ProjectRepository(self.db).get_by_id(uuid.UUID(data.target_id))
            except ValueError:
                raise ValidationError("Invalid target_id")
            if not project or project.is_deleted:
                raise NotFoundError("Project")
            if project.owner_id == reporter_id:
                raise ValidationError("You cannot report your own project")

        # One open report per reporter+target.
        existing = (
            self.db.query(Report)
            .filter(
                Report.reporter_id == reporter_id,
                Report.target_type == data.target_type,
                Report.target_id == data.target_id,
                Report.status == "open",
            )
            .first()
        )
        if existing:
            raise ConflictError("You already have an open report for this")

        report = Report(
            reporter_id=reporter_id,
            target_type=data.target_type,
            target_id=data.target_id,
            reason=data.reason,
            details=data.details,
            status="open",
        )
        self.db.add(report)
        self.db.commit()
        self.db.refresh(report)
        return report

    def list_reports(self, status: str | None = None) -> list[dict]:
        from app.projects.models import Project
        from app.users.models import User

        q = self.db.query(Report)
        if status:
            q = q.filter(Report.status == status)
        reports = q.order_by(desc(Report.created_at)).limit(200).all()

        # Batch-resolve reporter emails + project titles.
        reporter_ids = {r.reporter_id for r in reports}
        emails = dict(
            self.db.query(User.id, User.email).filter(User.id.in_(reporter_ids)).all()
        ) if reporter_ids else {}

        project_ids = {
            r.target_id for r in reports if r.target_type == "project"
        }
        projects: dict[str, Project] = {}
        if project_ids:
            valid_ids = []
            for pid in project_ids:
                try:
                    valid_ids.append(uuid.UUID(pid))
                except ValueError:
                    continue
            if valid_ids:
                for p in self.db.query(Project).filter(Project.id.in_(valid_ids)).all():
                    projects[str(p.id)] = p

        items = []
        for r in reports:
            p = projects.get(r.target_id)
            items.append(
                {
                    "id": r.id,
                    "reporter_id": r.reporter_id,
                    "reporter_email": emails.get(r.reporter_id),
                    "target_type": r.target_type,
                    "target_id": r.target_id,
                    "target_title": p.title if p else None,
                    "target_owner_id": p.owner_id if p else None,
                    "reason": r.reason,
                    "details": r.details,
                    "status": r.status,
                    "action_taken": r.action_taken,
                    "resolution_note": r.resolution_note,
                    "resolved_at": r.resolved_at,
                    "created_at": r.created_at,
                }
            )
        return items

    def resolve_report(
        self, report_id: uuid.UUID, admin_id: uuid.UUID, data: ReportResolve
    ) -> Report:
        report = self.db.query(Report).filter(Report.id == report_id).first()
        if not report:
            raise NotFoundError("Report")
        if report.status != "open":
            raise ValidationError("Report is already resolved")

        # Take enforcement action if requested.
        if data.action == "remove_target" and report.target_type == "project":
            from app.projects.repository import ProjectRepository
            repo = ProjectRepository(self.db)
            project = repo.get_by_id(uuid.UUID(report.target_id))
            if project:
                repo.soft_delete(project)
                self._notify_owner(
                    project.owner_id,
                    "Your project was removed",
                    f"'{project.title}' was removed after a moderation review.",
                )
        elif data.action == "ban_owner" and report.target_type == "project":
            from app.projects.repository import ProjectRepository
            from app.users.repository import UserRepository
            from app.users.models import UserRole
            project = ProjectRepository(self.db).get_by_id(uuid.UUID(report.target_id))
            if project:
                owner = UserRepository(self.db).get_by_id(project.owner_id)
                if owner and owner.role != UserRole.ADMIN:
                    UserRepository(self.db).update(owner, is_active=False)

        report.status = data.status
        report.action_taken = data.action
        report.resolution_note = data.note
        report.resolved_by_id = admin_id
        report.resolved_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(report)
        return report

    def _notify_owner(self, owner_id: uuid.UUID, title: str, body: str) -> None:
        from app.notifications.models import NotificationType
        from app.notifications.service import NotificationService
        try:
            NotificationService(self.db).create(
                recipient_id=owner_id,
                type=NotificationType.SYSTEM,
                title=title,
                body=body,
                link="/dashboard",
            )
        except Exception:
            pass
