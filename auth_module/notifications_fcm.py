"""
Firebase Cloud Messaging (FCM) push notifications for real-time security alerts.

Two-mode design (same as SMS):
    * LIVE   — when Firebase credentials are present, sends push via Google Cloud.
    * DEV    — otherwise logs to console so the feature is testable without credits.

Push topics:
    * security/denials         → triggers on face/card rejection → security staff
    * admin/gate               → every gate entry/exit         → admin/director
    * parent/student/{id}      → student entry/exit            → parent(s)
    * admin/enrollment/{user}  → enrollment completed          → admin/director

The send is fire-and-forget (non-blocking) so gate entries stay fast.
Failures are logged; never propagate up to the gate-entry response.
"""
from __future__ import annotations

import logging
import threading
import json
from typing import Optional, Dict, Any
from datetime import datetime

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# Lazy import firebase_admin so missing Firebase doesn't crash the server.
# The service degrades to console logging in dev mode.
_firebase_initialized = False
_firebase_app = None

def _init_firebase():
    """Initialize Firebase Admin SDK once."""
    global _firebase_initialized, _firebase_app
    if _firebase_initialized:
        return _firebase_app
    _firebase_initialized = True

    if not settings.FIREBASE_ENABLED:
        logger.info("[FCM] Firebase not enabled; notifications will log to console")
        return None

    try:
        import firebase_admin
        from firebase_admin import credentials, messaging

        if not settings.FIREBASE_CREDENTIALS_PATH:
            logger.warning("[FCM] FIREBASE_CREDENTIALS_PATH not set; running in dev mode")
            return None

        try:
            cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
            _firebase_app = firebase_admin.initialize_app(cred)
            logger.info("[FCM] Firebase Admin SDK initialized successfully")
            return _firebase_app
        except Exception as e:
            logger.error("[FCM] Failed to initialize Firebase Admin SDK: %s", e)
            return None
    except ImportError:
        logger.warning("[FCM] firebase-admin package not installed; run: pip install firebase-admin")
        return None


# ─── Public API ───────────────────────────────────────────────────────────────

def send_gate_entry_notification(
    *,
    user,                   # auth_module.models.User (the person entering)
    entry_type: str,        # 'ENTRY' | 'EXIT'
    method: str,            # 'BIOMETRIC' | 'CARD' | 'FACE_CARD' | 'MANUAL'
    when=None,              # timezone-aware datetime; defaults to now
) -> int:
    """
    Notify security staff (via topic) and parents (if student) about gate entry.
    Returns count of push notifications successfully queued.

    Recipients:
    - security/denials topic only if method='BIOMETRIC' and face was denied
      (only successful entries send to security/gate)
    - admin/gate topic: all successful entries
    - parent/student/{user_id} topic: if user.role == 'STUDENT'
    """
    when = when or timezone.now()

    count = 0

    # ── Admin/Security dashboard: all successful gate entries ──────────────
    count += _send_to_topic(
        topic='admin_gate',
        title=f'Campus Access: {user.get_full_name()}',
        body=f'{entry_type} via {_method_label(method)}',
        data={
            'user_id': str(user.id),
            'user_name': user.get_full_name(),
            'user_role': user.role,
            'entry_type': entry_type,
            'method': method,
            'timestamp': when.isoformat(),
            'action': 'open_gate_log',  # Frontend navigates to gate log on tap
        },
    )

    # ── Parents: student entry/exit notifications ──────────────────────────
    if user.role == 'STUDENT':
        from .models import ParentStudentRelation
        relations = ParentStudentRelation.objects.filter(student=user)
        for rel in relations:
            if not rel.parent.device_tokens.filter(is_active=True).exists():
                continue
            count += _send_to_devices(
                devices=rel.parent.device_tokens.filter(is_active=True),
                title=f'{user.get_full_name()} just {entry_type.lower()}ed campus',
                body=f'Verified via {_method_label(method)} at {when.strftime("%H:%M")}',
                data={
                    'student_id': str(user.id),
                    'entry_type': entry_type,
                    'method': method,
                    'timestamp': when.isoformat(),
                    'action': 'open_student_activity',
                },
            )

    return count


def send_access_denied_notification(
    *,
    reason: str,            # 'Face not recognised', 'Card not found', etc.
    matched: Optional[bool] = None,  # None if unknown, True if mismatch, False if no match
    face_user = None,       # User object if face was recognized but denied
    card_user = None,       # User object if card was recognized but denied
    when=None,
) -> int:
    """
    Notify security staff (security/denials topic) when someone is denied access.

    Used for:
    - Face recognition: face not recognized or failed liveness
    - Card scan: card not found in database
    - Face+Card: strict cross-match failed (e.g., face of A but card of B)
    """
    when = when or timezone.now()

    # Build a descriptive title for security staff
    if matched is False:
        # Cross-match failure: both found but different
        title = '⚠️ Cross-match failed: impersonation attempt?'
        body = f'{face_user.get_full_name() if face_user else "Unknown"} (face) ≠ {card_user.get_full_name() if card_user else "Unknown"} (card)'
    elif face_user and card_user and face_user.id != card_user.id:
        title = '⚠️ Face/Card mismatch detected'
        body = f'Face: {face_user.get_full_name()} | Card: {card_user.get_full_name()}'
    else:
        title = f'🚫 Access denied: {reason}'
        body = when.strftime('%H:%M:%S')

    count = _send_to_topic(
        topic='security_denials',
        title=title,
        body=body,
        data={
            'reason': reason,
            'face_user_id': str(face_user.id) if face_user else None,
            'card_user_id': str(card_user.id) if card_user else None,
            'matched': str(matched) if matched is not None else 'unknown',
            'timestamp': when.isoformat(),
            'action': 'open_security_dashboard',
        },
    )
    return count


def send_enrollment_notification(
    *,
    user,                   # User being enrolled
    status: str,            # 'COMPLETED' | 'FAILED' | 'STARTED'
    message: str,           # "Face enrollment successful" etc.
    when=None,
) -> int:
    """
    Notify admin/director when face enrollment completes or fails.
    """
    when = when or timezone.now()

    icon = '✅' if status == 'COMPLETED' else '❌' if status == 'FAILED' else '⏳'

    count = _send_to_topic(
        topic='admin_enrollment',
        title=f'{icon} Face Enrollment: {user.get_full_name()}',
        body=message,
        data={
            'user_id': str(user.id),
            'user_name': user.get_full_name(),
            'status': status,
            'timestamp': when.isoformat(),
            'action': 'open_enrollment_page',
        },
    )
    return count


def send_to_user_devices(
    *,
    user,                   # auth_module.models.User
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
) -> int:
    """
    Send a notification directly to all active devices of a specific user.
    Used for personalized notifications (e.g., "your password was changed").
    """
    devices = user.device_tokens.filter(is_active=True)
    return _send_to_devices(devices=devices, title=title, body=body, data=data)


# ─── Implementation ────────────────────────────────────────────────────────────

def _send_to_topic(
    *,
    topic: str,
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
) -> int:
    """Send a notification to a topic (multiple subscribers)."""
    data = data or {}
    _dispatch_async(
        kind='topic',
        topic=topic,
        title=title,
        body=body,
        data=data,
    )
    return 1  # Queued (actual delivery is async and deferred)


def _send_to_devices(
    *,
    devices,                # QuerySet of DeviceToken objects
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
) -> int:
    """Send a notification to specific devices."""
    data = data or {}
    count = 0
    for device in devices:
        _dispatch_async(
            kind='device',
            device_token=device.token,
            title=title,
            body=body,
            data=data,
        )
        count += 1
    return count


def _dispatch_async(**kwargs):
    """Queue notification in background thread so gate flow doesn't block."""
    thread = threading.Thread(target=_send_notification, kwargs=kwargs, daemon=True)
    thread.start()


def _send_notification(**kwargs):
    """Actually send the notification (runs in background thread)."""
    kind = kwargs.get('kind', 'topic')

    try:
        app = _init_firebase()

        if not app:
            # Dev mode: just log it
            _log_notification_dev(kind=kind, **kwargs)
            return

        # Live mode: send via Firebase
        from firebase_admin import messaging

        title = kwargs.get('title', '')
        body = kwargs.get('body', '')
        data = kwargs.get('data') or {}

        # Convert all data values to strings (FCM requirement)
        data = {k: str(v) if v is not None else '' for k, v in data.items()}

        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data=data,
        )

        if kind == 'topic':
            topic = kwargs.get('topic', 'general')
            response = messaging.send(
                messaging.Message(
                    topic=topic,
                    notification=messaging.Notification(title=title, body=body),
                    data=data,
                )
            )
            logger.info('[FCM] Sent to topic "%s": %s', topic, response)
        elif kind == 'device':
            device_token = kwargs.get('device_token', '')
            response = messaging.send(
                messaging.Message(
                    token=device_token,
                    notification=messaging.Notification(title=title, body=body),
                    data=data,
                )
            )
            logger.info('[FCM] Sent to device: %s', response)
    except Exception as e:
        logger.error('[FCM] Failed to send notification: %s', e)


def _log_notification_dev(**kwargs):
    """Log notification in dev mode (no Firebase credentials)."""
    kind = kwargs.get('kind', 'unknown')
    title = kwargs.get('title', '')
    body = kwargs.get('body', '')

    if kind == 'topic':
        topic = kwargs.get('topic', '')
        logger.info('[FCM-DEV] Topic "%s": %s — %s', topic, title, body)
    elif kind == 'device':
        logger.info('[FCM-DEV] Device: %s — %s', title, body)


def _method_label(method: str) -> str:
    """Convert method code to human-readable label."""
    labels = {
        'BIOMETRIC': '👁 Face',
        'CARD': '🪪 Card',
        'FACE_CARD': '🔒 Face + Card',
        'MANUAL': '✍ Manual ID',
        'RETINA': '👁 Retina',
    }
    return labels.get(method, method)
