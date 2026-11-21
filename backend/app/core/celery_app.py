import asyncio
from celery import Celery
from celery.schedules import crontab

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "codebazaar",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.tasks.analysis_tasks", "app.tasks.sync_tasks",
        "app.tasks.verification_tasks", "app.tasks.email_tasks",
        "app.tasks.trust_tasks", "app.tasks.digest_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "app.tasks.analysis_tasks.*": {"queue": "ai"},
        "app.tasks.sync_tasks.*": {"queue": "sync"},
        "app.tasks.verification_tasks.*": {"queue": "ai"},
        "app.tasks.email_tasks.*": {"queue": "sync"},
        # Rescoring calls the same GitHub + scoring path as verification, so it
        # belongs on the same queue and inherits its concurrency limits.
        "app.tasks.trust_tasks.*": {"queue": "ai"},
        "app.tasks.digest_tasks.*": {"queue": "sync"},
    },
    # `timezone="UTC"` above means every crontab hour below is UTC.
    beat_schedule={
        "sync-active-projects": {
            "task": "app.tasks.sync_tasks.sync_all_active_projects",
            "schedule": 3600.0,  # every hour
        },
        # Monday 02:00 UTC — before the digest, so the digest reports fresh
        # health readings rather than last week's.
        "rescore-monitored-projects": {
            "task": "app.tasks.trust_tasks.rescore_monitored_projects",
            "schedule": crontab(day_of_week=1, hour=2, minute=0),
        },
        "refresh-builder-streaks": {
            "task": "app.tasks.digest_tasks.refresh_builder_streaks",
            "schedule": crontab(hour=1, minute=30),  # daily; a streak decays daily
        },
        # Monday 06:00 UTC ≈ 11:30 IST, which is a weekday morning for the
        # Indian student audience rather than the middle of their night.
        "weekly-digest": {
            "task": "app.tasks.digest_tasks.send_weekly_digests",
            "schedule": crontab(day_of_week=1, hour=6, minute=0),
        },
        "expire-stale-offers": {
            "task": "app.tasks.digest_tasks.expire_stale_offers",
            "schedule": crontab(hour=3, minute=0),  # daily
        },
    },
)


def run_async(coro):
    """Run an async coroutine from a sync Celery task."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()
