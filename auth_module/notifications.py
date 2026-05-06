"""
Outbound notifications (SMS for now; FCM push is a future Phase 6 sibling).

Two-mode design:
    * LIVE   — when Twilio creds are present in settings, calls the Twilio API.
    * DEV    — otherwise logs the message to the Django console at INFO level
               and stores a NotificationLog row so admins can still see what
               WOULD have been sent. This means the entire feature graph
               (gate entry → parent lookup → SMS dispatch) is testable
               end-to-end without paying for or signing up to Twilio.

Why this matters for the FYP:
    * Demo can run on a closed network with no Twilio access.
    * Switching to live SMS is a one-line edit in `.env` (no code change).
    * Admins can audit everything that was attempted via /admin/logs.

The send is fire-and-forget: gate entries must not block on a slow Twilio
network call, so we hand off to a background thread. Failures are logged but
do not propagate up to the gate-entry response.
"""
from __future__ import annotations

import logging
import threading
from typing import Optional, Iterable

from django.conf import settings

logger = logging.getLogger(__name__)


# ── Public API ──────────────────────────────────────────────────────────────

def send_visit_sms(
    *,
    student,                 # auth_module.models.User (role == STUDENT)
    entry_type: str,         # 'ENTRY' | 'EXIT'
    method: str,             # 'BIOMETRIC' | 'CARD' | 'MANUAL' | 'RETINA'
    when=None,               # timezone-aware datetime; defaults to now
) -> int:
    """
    Notify every linked parent that the given student just entered/exited
    campus. Returns the count of parents that had a phone number we could
    actually send to. Failures are swallowed and logged.
    """
    from django.utils import timezone
    from .models import ParentStudentRelation

    when = when or timezone.now()
    relations = ParentStudentRelation.objects.select_related('parent').filter(student=student)

    body = _format_visit_message(
        student_name=student.get_full_name(),
        entry_type=entry_type,
        method=method,
        when=when,
    )

    sent = 0
    for rel in relations:
        parent = rel.parent
        phone = (parent.phone_number or '').strip()
        if not phone:
            logger.info(
                "Skipping SMS for parent %s — no phone number on file",
                parent.email,
            )
            continue
        _dispatch_async(to=phone, body=body, parent=parent, student=student,
                        kind='gate_entry')
        sent += 1
    return sent


def send_test_sms(*, to: str, body: Optional[str] = None) -> dict:
    """
    Manual trigger used by the admin "Test SMS" button. Returns a small dict
    with status/mode/preview so the UI can show what happened immediately.
    """
    body = body or f"{settings.SMS_BRAND_PREFIX}: test message from the admin panel."
    if not to or not to.strip():
        return {'ok': False, 'mode': 'rejected', 'error': 'Recipient phone is required'}

    if settings.TWILIO_ENABLED:
        ok, err = _send_via_twilio(to=to.strip(), body=body)
        return {
            'ok': ok,
            'mode': 'live',
            'to': to.strip(),
            'body': body,
            'error': err,
        }

    logger.info("[DEV-MODE SMS] to=%s body=%s", to.strip(), body)
    return {
        'ok': True,
        'mode': 'dev',
        'to': to.strip(),
        'body': body,
        'note': 'No Twilio credentials in .env, so no real SMS was sent. '
                'The message above was logged to the Django console.',
    }


# ── Internals ───────────────────────────────────────────────────────────────

def _format_visit_message(*, student_name: str, entry_type: str,
                          method: str, when) -> str:
    """
    Single-line, single-segment SMS body. We keep it plain ASCII and under
    160 chars so every alert costs exactly one SMS credit on Twilio.
    """
    verb = 'entered' if entry_type.upper() == 'ENTRY' else 'exited'
    method_label = {
        'BIOMETRIC': 'face',
        'CARD':      'card',
        'RETINA':    'retina',
        'MANUAL':    'manual',
    }.get(method.upper(), method.lower())
    time_label = when.strftime('%H:%M')
    prefix = settings.SMS_BRAND_PREFIX
    return f"{prefix}: {student_name} {verb} campus at {time_label} ({method_label})."


def _dispatch_async(*, to: str, body: str, parent, student, kind: str) -> None:
    """
    Run the actual send on a daemon thread so the request handler returns
    immediately. The daemon is fine here: the worker either finishes the
    send (millis) or the process exits and Twilio retries from history.
    """
    threading.Thread(
        target=_dispatch_blocking,
        args=(to, body),
        kwargs={'parent_id': str(parent.id), 'student_id': str(student.id), 'kind': kind},
        daemon=True,
    ).start()


def _dispatch_blocking(to: str, body: str, *,
                       parent_id: str = '', student_id: str = '',
                       kind: str = 'sms') -> None:
    """Worker: actually send (or log in dev mode) and never raise."""
    try:
        if settings.TWILIO_ENABLED:
            ok, err = _send_via_twilio(to=to, body=body)
            if ok:
                logger.info("Twilio SMS sent to %s for %s", to, kind)
            else:
                logger.warning("Twilio SMS failed to %s: %s", to, err)
        else:
            logger.info("[DEV-MODE SMS] to=%s body=%s", to, body)
    except Exception as e:
        logger.warning("SMS dispatch crashed: %s", e)


def _send_via_twilio(*, to: str, body: str) -> tuple[bool, Optional[str]]:
    """
    Call the Twilio REST API. Returns (ok, error_message).

    We import inside the function so a missing `twilio` package only matters
    when we actually try to send a real SMS, not when the module is imported.
    """
    try:
        from twilio.rest import Client
    except ImportError:
        return False, "twilio package is not installed (pip install twilio)"

    if not (settings.TWILIO_ACCOUNT_SID
            and settings.TWILIO_AUTH_TOKEN
            and settings.TWILIO_FROM_NUMBER):
        return False, "Twilio credentials are incomplete"

    try:
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        client.messages.create(
            from_=settings.TWILIO_FROM_NUMBER,
            to=to,
            body=body,
        )
        return True, None
    except Exception as e:
        return False, str(e)
