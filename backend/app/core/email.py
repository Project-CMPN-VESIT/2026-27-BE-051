import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger("email")
settings = get_settings()


def _send(to: str, subject: str, html_body: str) -> None:
    """Send an email via SMTP. Logs and swallows errors in development."""
    if not settings.smtp_user:
        logger.warning("SMTP not configured — skipping email", to=to, subject=subject)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.email_from
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(
            settings.smtp_host,
            settings.smtp_port,
            timeout=settings.smtp_timeout_seconds,
        ) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.email_from, to, msg.as_string())
        logger.info("Email sent", to=to, subject=subject)
    except Exception as exc:
        logger.error("Failed to send email", to=to, subject=subject, error=str(exc))
        if settings.is_production:
            raise


def send_verification_email(to: str, token: str) -> None:
    link = f"{settings.frontend_url}/auth/verify-email?token={token}"
    html = f"""
    <p>Welcome to <strong>CodeBazaar</strong>!</p>
    <p>Please verify your email address by clicking the link below:</p>
    <p><a href="{link}">Verify Email Address</a></p>
    <p>This link expires in 24 hours.</p>
    <p>If you didn't create an account, you can safely ignore this email.</p>
    """
    _send(to, "Verify your CodeBazaar email", html)


def send_password_reset_email(to: str, token: str) -> None:
    link = f"{settings.frontend_url}/auth/reset-password?token={token}"
    html = f"""
    <p>You requested a password reset for your <strong>CodeBazaar</strong> account.</p>
    <p><a href="{link}">Reset Password</a></p>
    <p>This link expires in 1 hour.</p>
    <p>If you didn't request this, please ignore this email.</p>
    """
    _send(to, "Reset your CodeBazaar password", html)


def send_contributor_request_email(
    to: str, project_title: str, requester_name: str
) -> None:
    html = f"""
    <p><strong>{requester_name}</strong> has requested to contribute to your project
    <strong>{project_title}</strong> on CodeBazaar.</p>
    <p><a href="{settings.frontend_url}/dashboard">View Request</a></p>
    """
    _send(to, f"New contributor request for {project_title}", html)


def enqueue_email(to: str, subject: str, html_body: str) -> None:
    """Fire-and-forget transactional email via Celery.

    Never breaks the calling request: if the broker is unavailable we fall back
    to an inline send (which itself no-ops when SMTP isn't configured).
    """
    if not to:
        return
    try:
        from app.tasks.email_tasks import send_email
        send_email.delay(to, subject, html_body)
    except Exception as exc:
        logger.warning("Email enqueue failed; attempting inline send", to=to, error=str(exc))
        try:
            _send(to, subject, html_body)
        except Exception:
            pass


def _wrap(title: str, body_html: str, cta_text: str | None = None, cta_link: str | None = None) -> str:
    cta = ""
    if cta_text and cta_link:
        cta = (f'<p style="margin:24px 0"><a href="{cta_link}" '
               f'style="background:#6d28d9;color:#fff;padding:10px 18px;border-radius:8px;'
               f'text-decoration:none;font-weight:600">{cta_text}</a></p>')
    return (
        f'<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">'
        f'<h2 style="font-size:18px">{title}</h2>{body_html}{cta}'
        f'<p style="color:#888;font-size:12px;margin-top:28px">CodeBazaar — verified execution intelligence for student builders.</p>'
        f'</div>'
    )


def send_offer_received_email(to: str, offer_title: str, offer_type: str, project_title: str) -> None:
    html = _wrap(
        "You received a new offer",
        f"<p>You received a <strong>{offer_type}</strong> offer — "
        f"<strong>{offer_title}</strong> — on your project <strong>{project_title}</strong>.</p>",
        "View offer", f"{settings.frontend_url}/incubation",
    )
    enqueue_email(to, f"New {offer_type} offer on {project_title}", html)


def send_offer_response_email(to: str, offer_title: str, accepted: bool) -> None:
    verb = "accepted" if accepted else "declined"
    html = _wrap(
        f"Your offer was {verb}",
        f"<p>Your offer <strong>{offer_title}</strong> was <strong>{verb}</strong>.</p>",
        "View in Incubation", f"{settings.frontend_url}/incubation",
    )
    enqueue_email(to, f"Your offer was {verb}", html)


def send_project_verified_email(to: str, project_title: str, score: int) -> None:
    html = _wrap(
        "Your project is verified",
        f"<p><strong>{project_title}</strong> earned a Verified Build Score of "
        f"<strong>{score}/100</strong> and now carries the verified badge.</p>",
        "View project", f"{settings.frontend_url}/dashboard",
    )
    enqueue_email(to, f"{project_title} is now verified on CodeBazaar", html)


def send_hackathon_reviewed_email(to: str, event_name: str, approved: bool) -> None:
    if approved:
        html = _wrap(
            "Hackathon claim verified",
            f"<p>Your participation in <strong>{event_name}</strong> was verified. "
            f"Your project now shows a verified hackathon badge.</p>",
            "View project", f"{settings.frontend_url}/dashboard",
        )
        enqueue_email(to, f"Hackathon claim verified — {event_name}", html)
    else:
        html = _wrap(
            "Hackathon claim not approved",
            f"<p>Your hackathon claim for <strong>{event_name}</strong> was not approved after review.</p>",
        )
        enqueue_email(to, f"Hackathon claim update — {event_name}", html)
