import uuid

from celery import shared_task
from sqlalchemy.orm import Session

from app.core.celery_app import run_async
from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.verification.service import VerificationService

logger = get_logger("tasks.verification")


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    name="app.tasks.verification_tasks.run_verified_build_score",
)
def run_verified_build_score(self, project_id: str, github_token: str | None = None):
    """
    Compute the Verified Build Score™ for a project.

    1. Collect deterministic GitHub signals (repo age, commits, contributors, README).
    2. Score them via the pure scoring engine.
    3. Persist onto ProjectVerification and flip project.is_verified when earned.
    """
    db: Session = SessionLocal()
    try:
        result = run_async(
            VerificationService(db).compute_and_store(
                uuid.UUID(project_id), github_token
            )
        )
        logger.info(
            "Verified Build Score task completed",
            project_id=project_id,
            score=result.verified_build_score,
        )
        return {
            "project_id": project_id,
            "verified_build_score": result.verified_build_score,
            "confidence": result.confidence,
            "fraud_flags": result.fraud_flags,
        }
    except Exception as exc:
        logger.error("Verified Build Score task failed", project_id=project_id, error=str(exc))
        raise self.retry(exc=exc)
    finally:
        db.close()
