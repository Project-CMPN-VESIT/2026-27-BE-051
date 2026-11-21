"""Project progress timeline.

Most entries are recorded automatically as a project moves through the platform
(imported, verified, adopted, sold…). Owners can also post manual progress
updates and milestones so buyers and contributors can see momentum.
"""
import uuid

from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.logging import get_logger
from app.projects.models import Project, ProjectEvent, ProjectEventType

logger = get_logger("timeline")


def record_event(
    db: Session,
    project_id: uuid.UUID,
    event_type: ProjectEventType,
    title: str,
    description: str | None = None,
    actor_id: uuid.UUID | None = None,
    is_manual: bool = False,
    progress_percent: int | None = None,
    commit: bool = False,
) -> ProjectEvent | None:
    """Append an event to a project's timeline.

    Never raises — a timeline write must not break the flow that triggered it.
    """
    try:
        event = ProjectEvent(
            project_id=project_id,
            event_type=event_type,
            title=title[:200],
            description=description,
            actor_id=actor_id,
            is_manual=is_manual,
            progress_percent=progress_percent,
        )
        db.add(event)
        db.flush()
        if commit:
            db.commit()
        return event
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Timeline event not recorded", project=str(project_id), error=str(exc))
        return None


class TimelineService:
    def __init__(self, db: Session):
        self.db = db

    def list_events(self, project_id: uuid.UUID, limit: int = 50) -> list[ProjectEvent]:
        project = (
            self.db.query(Project)
            .filter(Project.id == project_id, Project.is_deleted == False)
            .first()
        )
        if not project:
            raise NotFoundError("Project")
        return (
            self.db.query(ProjectEvent)
            .options(joinedload(ProjectEvent.actor))
            .filter(ProjectEvent.project_id == project_id)
            .order_by(desc(ProjectEvent.created_at))
            .limit(limit)
            .all()
        )

    def add_update(
        self,
        project_id: uuid.UUID,
        actor_id: uuid.UUID,
        title: str,
        description: str | None,
        progress_percent: int | None,
        is_milestone: bool = False,
        is_admin: bool = False,
    ) -> ProjectEvent:
        project = (
            self.db.query(Project)
            .filter(Project.id == project_id, Project.is_deleted == False)
            .first()
        )
        if not project:
            raise NotFoundError("Project")

        # Owner or an active collaborator may post updates.
        allowed = project.owner_id == actor_id or is_admin
        if not allowed:
            from app.projects.repository import ProjectRepository
            allowed = ProjectRepository(self.db).is_collaborator(project_id, actor_id)
        if not allowed:
            raise ForbiddenError("Only the owner or a collaborator can post updates")

        if progress_percent is not None:
            project.progress_percent = max(0, min(100, progress_percent))

        event = ProjectEvent(
            project_id=project_id,
            event_type=(
                ProjectEventType.MILESTONE if is_milestone else ProjectEventType.PROGRESS_UPDATE
            ),
            title=title[:200],
            description=description,
            actor_id=actor_id,
            is_manual=True,
            progress_percent=project.progress_percent if progress_percent is not None else None,
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def delete_event(self, event_id: uuid.UUID, actor_id: uuid.UUID, is_admin: bool = False) -> None:
        event = self.db.get(ProjectEvent, event_id)
        if not event:
            raise NotFoundError("Timeline event")
        if not event.is_manual and not is_admin:
            raise ForbiddenError("Automatic timeline entries cannot be removed")
        project = self.db.get(Project, event.project_id)
        if not is_admin and (not project or project.owner_id != actor_id):
            raise ForbiddenError("Not your project")
        self.db.delete(event)
        self.db.commit()
