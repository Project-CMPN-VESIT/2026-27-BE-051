import uuid

from celery import shared_task
from sqlalchemy.orm import Session

from app.core.celery_app import run_async
from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.github.service import GitHubClient, build_project_metadata_from_repo
from app.projects.models import ProjectStatus
from app.projects.repository import ProjectRepository

logger = get_logger("tasks.sync")


@shared_task(name="app.tasks.sync_tasks.sync_project_metadata")
def sync_project_metadata(project_id: str, github_token: str):
    db: Session = SessionLocal()
    try:
        project_uuid = uuid.UUID(project_id)
        repo = ProjectRepository(db)
        project = repo.get_by_id(project_uuid)
        if not project:
            return

        gh = GitHubClient(github_token)
        gh_repo = run_async(gh.get_repo(project.repo_full_name))
        metadata = build_project_metadata_from_repo(gh_repo)

        # Remove immutable fields before update
        for field in ("github_repo_id", "repo_full_name"):
            metadata.pop(field, None)

        # Check dormancy: no pushes in 90 days
        from datetime import datetime, timezone, timedelta
        pushed_at = metadata.get("github_pushed_at")
        if pushed_at:
            try:
                last_push = datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))
                if (datetime.now(timezone.utc) - last_push) > timedelta(days=90):
                    if project.status == ProjectStatus.ACTIVE:
                        metadata["status"] = ProjectStatus.DORMANT
            except ValueError:
                pass

        repo.update(project, **metadata)
        db.commit()
        logger.info("Project synced", project_id=project_id)
    except Exception as exc:
        logger.error("Sync failed", project_id=project_id, error=str(exc))
    finally:
        db.close()


@shared_task(name="app.tasks.sync_tasks.sync_all_active_projects")
def sync_all_active_projects():
    """Periodic task: sync all active projects that have a GitHub token stored."""
    # In production this would fetch stored (encrypted) GitHub tokens per user
    # For now it logs intent — token management is handled per-user
    logger.info("Periodic sync task triggered — implement per-user token store for full sync")
