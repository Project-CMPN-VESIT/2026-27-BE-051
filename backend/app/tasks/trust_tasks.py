"""
Scheduled trust maintenance.

The weekly rescore is what turns the Verified Build Score from a snapshot into a
monitored signal. A buyer who paid for a maintained project deserves to know when
it stops being maintained, and that can only come from re-measuring.
"""
import uuid

from celery import shared_task
from sqlalchemy.orm import Session

from app.core.celery_app import run_async
from app.core.database import SessionLocal
from app.core.logging import get_logger

logger = get_logger("tasks.trust")


@shared_task(
    bind=True,
    max_retries=2,
    default_retry_delay=300,
    name="app.tasks.trust_tasks.rescore_monitored_projects",
)
def rescore_monitored_projects(self, github_token: str | None = None):
    """Re-run the scoring engine against every purchased project under watch.

    Only touches projects a buyer is actually monitoring, not the whole
    catalogue — rescoring 131 projects weekly to serve 24 buyers would burn the
    GitHub rate limit for no one's benefit.

    Without a token the engine still scores from stored repo metadata (at lower
    confidence), so a missing token degrades the reading rather than skipping it.
    """
    db: Session = SessionLocal()
    checked = alerted = failed = 0
    try:
        from app.trust.service import HealthMonitorService
        from app.verification.service import VerificationService

        monitor = HealthMonitorService(db)
        project_ids = monitor.due_for_check(older_than_days=7)
        if not project_ids:
            logger.info("rescore_nothing_due")
            return {"checked": 0, "alerted": 0, "failed": 0}

        for project_id in project_ids:
            try:
                result = run_async(
                    VerificationService(db).compute_and_store(project_id, github_token)
                )
                monitor.mark_checked(project_id)
                alerted += monitor.alert_on_drop(
                    project_id, result.verified_build_score
                )
                checked += 1
                db.commit()
            except Exception as exc:
                failed += 1
                db.rollback()
                logger.warning(
                    "rescore_project_failed",
                    project_id=str(project_id),
                    error=str(exc),
                )

        logger.info(
            "rescore_complete",
            checked=checked, alerted=alerted, failed=failed,
        )
        return {"checked": checked, "alerted": alerted, "failed": failed}
    except Exception as exc:
        logger.error("rescore_task_failed", error=str(exc))
        db.rollback()
        raise self.retry(exc=exc)
    finally:
        db.close()


@shared_task(name="app.tasks.trust_tasks.rescore_single_project")
def rescore_single_project(project_id: str, github_token: str | None = None):
    """Rescore one monitored project on demand.

    Exists so the demo (and a buyer hitting "check now") can trigger a real
    engine run against one project without waiting for the weekly beat.
    """
    db: Session = SessionLocal()
    try:
        from app.trust.service import HealthMonitorService
        from app.verification.service import VerificationService

        pid = uuid.UUID(project_id)
        result = run_async(VerificationService(db).compute_and_store(pid, github_token))
        monitor = HealthMonitorService(db)
        monitor.mark_checked(pid)
        alerted = monitor.alert_on_drop(pid, result.verified_build_score)
        db.commit()
        return {"score": result.verified_build_score, "alerted": alerted}
    except Exception as exc:
        db.rollback()
        logger.warning("rescore_single_failed", project_id=project_id, error=str(exc))
        return {"error": str(exc)[:200]}
    finally:
        db.close()
