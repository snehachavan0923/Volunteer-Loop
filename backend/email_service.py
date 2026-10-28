"""Configurable email delivery service for VolunteerLoop.
Supports Resend API if RESEND_API_KEY and EMAIL_FROM are configured.
Keeps email optional and gracefully no-ops when not configured.
"""
import os
import logging
import httpx

logger = logging.getLogger("volunteerloop.email")

def send_email(to_email: str, subject: str, html_content: str, text_content: str | None = None) -> bool:
    """Send an email using configured email provider (Resend).
    Returns True if sent, False if unconfigured or failed.
    """
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    from_email = os.getenv("EMAIL_FROM", "").strip()

    if not api_key or not from_email:
        logger.debug("Email delivery skipped: RESEND_API_KEY or EMAIL_FROM not configured.")
        return False

    if not to_email:
        return False

    try:
        response = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": from_email,
                "to": [to_email],
                "subject": subject,
                "html": html_content,
                "text": text_content or subject,
            },
            timeout=10.0,
        )
        if response.status_code in (200, 201):
            logger.info("Email '%s' successfully sent to %s", subject, to_email)
            return True
        else:
            logger.warning("Failed to send email via Resend (%s): %s", response.status_code, response.text)
            return False
    except Exception as exc:
        logger.warning("Error sending email to %s: %s", to_email, exc)
        return False
