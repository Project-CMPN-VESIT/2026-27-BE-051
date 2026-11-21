from celery import shared_task

from app.core.email import _send
from app.core.logging import get_logger

logger = get_logger("tasks.email")


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    name="app.tasks.email_tasks.send_email",
)
def send_email(self, to: str, subject: str, html_body: str):
    """Send a transactional email out-of-band so it never blocks a web request."""
    try:
        _send(to, subject, html_body)
        return {"to": to, "subject": subject, "status": "sent"}
    except Exception as exc:
        logger.error("Email task failed", to=to, subject=subject, error=str(exc))
        raise self.retry(exc=exc)
