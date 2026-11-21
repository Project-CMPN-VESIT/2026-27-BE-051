"""
Send a test email to verify your SMTP/Resend setup.

Usage (from the backend/ folder, with your venv):
    python send_test_email.py you@example.com

Reads SMTP_* and EMAIL_FROM from your .env. With Resend, EMAIL_FROM must be on a
domain you've verified in Resend (SPF/DKIM/DMARC), otherwise delivery is rejected.
"""
import sys

from app.core.config import get_settings
from app.core.email import _send


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python send_test_email.py <recipient@example.com>")
        raise SystemExit(1)

    to = sys.argv[1]
    settings = get_settings()

    if not settings.smtp_user:
        print("SMTP is not configured. Set SMTP_HOST/SMTP_USER/SMTP_PASSWORD in .env.")
        raise SystemExit(1)

    print(f"Sending test email via {settings.smtp_host}:{settings.smtp_port} "
          f"from {settings.email_from} -> {to} ...")
    _send(
        to,
        "CodeBazaar test email",
        "<p>This is a <strong>test email</strong> from CodeBazaar.</p>"
        "<p>If you can read this, your email setup works.</p>",
    )
    print("Done. Check the inbox (and spam). If nothing arrives, verify your "
          "sending domain in Resend and that EMAIL_FROM uses that domain.")


if __name__ == "__main__":
    main()
