"""
Scheduled retention jobs: the weekly digest, streak refresh, offer expiry.
"""
from celery import shared_task
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.logging import get_logger

logger = get_logger("tasks.digest")


@shared_task(name="app.tasks.digest_tasks.send_weekly_digests")
def send_weekly_digests():
    """Email every active user their week in review.

    Each user is built and sent independently: one user with malformed data must
    not stop the other nine hundred from getting their digest.
    """
    db: Session = SessionLocal()
    sent = skipped = failed = 0
    try:
        from app.growth.digest import DigestService

        service = DigestService(db)
        for user in service.active_recipients():
            try:
                if service.send(user):
                    sent += 1
                else:
                    skipped += 1
            except Exception as exc:
                failed += 1
                db.rollback()
                logger.warning(
                    "digest_user_failed", user=str(user.id), error=str(exc)
                )
        logger.info("weekly_digest_complete", sent=sent, skipped=skipped, failed=failed)
        return {"sent": sent, "skipped": skipped, "failed": failed}
    finally:
        db.close()


@shared_task(name="app.tasks.digest_tasks.expire_stale_offers")
def expire_stale_offers():
    """Close out purchase offers nobody responded to."""
    db: Session = SessionLocal()
    try:
        from app.deals.service import OfferService

        count = OfferService(db).expire_stale()
        logger.info("offers_expired", count=count)
        return {"expired": count}
    finally:
        db.close()


@shared_task(name="app.tasks.digest_tasks.refresh_builder_streaks")
def refresh_builder_streaks():
    """Recompute cached streak values for every builder with activity history.

    The cached columns exist for cheap sorting (the streak leaderboard). Reads of
    an individual streak always recompute, so this job going stale degrades
    ranking accuracy, never the number shown to the builder themselves.
    """
    db: Session = SessionLocal()
    updated = 0
    try:
        from app.growth.models import BuilderActivity
        from app.growth.streaks import compute_streak

        for row in db.query(BuilderActivity).all():
            stats = compute_streak(row.activity_days)
            row.current_streak_days = stats["current_streak_days"]
            row.longest_streak_days = max(
                row.longest_streak_days or 0, stats["longest_streak_days"]
            )
            row.total_active_days = stats["total_active_days"]
            row.last_active_on = stats["last_active_on"]
            row.milestones = sorted(
                set(row.milestones or []) | set(stats["milestones"])
            )
            updated += 1
        db.commit()
        logger.info("streaks_refreshed", updated=updated)
        return {"updated": updated}
    except Exception as exc:
        db.rollback()
        logger.error("streak_refresh_failed", error=str(exc))
        return {"error": str(exc)[:200]}
    finally:
        db.close()
