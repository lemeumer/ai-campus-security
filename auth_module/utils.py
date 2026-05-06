# utils.py - Utility Functions (Python 3.14 Compatible)
from __future__ import annotations
from typing import Any, Optional
import jwt
from datetime import datetime, timedelta
from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.utils import timezone
from django.http import HttpRequest
import random
import string

# Avoid circular import
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from .models import User, LoginAttempt


def generate_jwt_token(user: User) -> str:
    """
    Generate JWT token for user authentication
    """
    payload: dict[str, Any] = {
        'user_id': str(user.id),
        'email': user.email,
        'role': user.role,
        'exp': datetime.utcnow() + timedelta(days=7),
        'iat': datetime.utcnow()
    }

    token = jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm='HS256'
    )

    return token


def decode_jwt_token(token: str) -> Optional[dict[str, Any]]:
    """
    Decode and verify JWT token
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=['HS256']
        )
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_client_ip(request: HttpRequest) -> str:
    """
    Extract client IP address from request
    """
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR', '0.0.0.0')
    return ip


def get_user_agent(request: HttpRequest) -> str:
    """
    Extract user agent from request
    """
    return request.META.get('HTTP_USER_AGENT', '')


def check_rate_limit(
    email: str,
    ip_address: str,
    max_attempts: int = 5,
    time_window: int = 15
) -> bool:
    """
    Check if user has exceeded login attempt rate limit
    """
    from .models import LoginAttempt

    time_threshold = timezone.now() - timedelta(minutes=time_window)

    failed_attempts = LoginAttempt.objects.filter(
        email=email,
        ip_address=ip_address,
        success=False,
        timestamp__gte=time_threshold
    ).count()

    return failed_attempts < max_attempts


def generate_university_id(role: str, department: Optional[str] = None) -> str:
    """
    Generate unique university ID based on role and department
    Format: BU-YEAR-DEPT-XXXX for students
            FAC-YEAR-DEPT-XXXX for faculty
            STF-YEAR-DEPT-XXXX for staff
            SEC-YEAR-XXXX for security
    """
    year = datetime.now().year
    random_num = random.randint(1000, 9999)

    # Clean department code (first 3 letters, uppercase)
    if department:
        dept_code = ''.join(c for c in department if c.isalnum())[:3].upper()
        if len(dept_code) < 2:
            dept_code = 'GEN'  # Generic if department name is too short
    else:
        dept_code = 'GEN'

    # Generate ID based on role
    if role == 'STUDENT':
        return f"BU-{year}-{dept_code}-{random_num}"
    elif role == 'FACULTY':
        return f"FAC-{year}-{dept_code}-{random_num}"
    elif role == 'STAFF':
        return f"STF-{year}-{dept_code}-{random_num}"
    elif role == 'SECURITY':
        return f"SEC-{year}-{random_num}"
    elif role == 'ADMIN':
        return f"ADM-{year}-{random_num}"
    else:
        return f"{role[:3].upper()}-{year}-{random_num}"


def send_password_reset_email(user: User, token: str) -> None:
    """
    Send password reset email. Uses the SMTP backend if EMAIL_HOST_USER and
    EMAIL_HOST_PASSWORD are set, otherwise falls back to console output (dev).
    """
    # ForgotPasswordPage handles both the request-token and confirm-token steps;
    # arriving with `?token=...` skips straight to the new-password form.
    reset_link = f"{settings.FRONTEND_URL}/forgot-password?token={token}"

    subject = "Password Reset Request: AI Based Campus Security"

    html_message = render_to_string("emails/password_reset.html", {
        "user": user,
        "reset_link": reset_link,
        "expiry_hours": 1,
        "frontend_url": settings.FRONTEND_URL,
    })
    plain_message = strip_tags(html_message)

    # fail_silently=True so a missing SMTP config doesn't crash the password
    # reset request flow — the user still gets a 200 response and the token is
    # logged so it can be issued manually if needed.
    send_mail(
        subject=subject,
        message=plain_message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        html_message=html_message,
        fail_silently=True,
    )


def send_welcome_email(user: User) -> None:
    """
    Send welcome email after an admin APPROVES a registration. We deliberately
    don't fire this on the registration POST itself — at that point the account
    is PENDING and the welcome email's "Sign in to portal →" CTA wouldn't work.
    Login is gated to ACTIVE users (see UserLoginView), so the email is only
    actionable once approval flips the account to ACTIVE.
    """
    subject = "Your account is approved — Welcome to AI Based Campus Security"
    university_id = user.university_id or "Will be assigned shortly"

    html_message = render_to_string("emails/welcome.html", {
        "user": user,
        "university_id": university_id,
        "frontend_url": settings.FRONTEND_URL,
    })
    plain_message = strip_tags(html_message)

    send_mail(
        subject=subject,
        message=plain_message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        html_message=html_message,
        fail_silently=True,
    )


def send_registration_received_email(user: User) -> None:
    """
    Plain-text confirmation we send the moment a user completes self-registration.
    Reassures them the request landed and explains what happens next. We send a
    tiny plain message rather than a full HTML template — the in-app pending
    screen already does the heavy lifting; this is just a paper trail.
    """
    subject = "We received your registration — pending review"
    body = (
        f"Hi {user.first_name},\n\n"
        f"Thanks for signing up to the AI Based Campus Security portal.\n\n"
        f"Your registration has been received and is now waiting for an "
        f"administrator to review and approve it. You will receive a separate "
        f"email the moment your account is activated, with a link to sign in.\n\n"
        f"Account on file:\n"
        f"  Email: {user.email}\n"
        f"  Role:  {user.role}\n\n"
        f"If you didn't sign up, please contact campus IT — your CNIC may have "
        f"been used without your knowledge.\n\n"
        f"— AI Based Campus Security"
    )

    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=True,
    )


def send_rejection_email(user: User, reason: str = "") -> None:
    """
    Sent when an admin rejects a pending registration. The reason field (when
    provided) is included so the user understands what to fix before re-applying.
    Plain text — rejection emails should be short, factual, and unambiguous.
    """
    subject = "About your campus security registration"
    reason_block = (
        f"\nReason given by the administrator:\n  {reason}\n"
        if reason else ""
    )
    body = (
        f"Hi {user.first_name},\n\n"
        f"Thank you for your interest in the AI Based Campus Security portal.\n\n"
        f"After review, your registration could not be approved at this time.\n"
        f"{reason_block}\n"
        f"If you believe this is a mistake or you'd like to re-apply with "
        f"corrected information, please contact campus IT.\n\n"
        f"— AI Based Campus Security"
    )

    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=True,
    )


def verify_biometric_match(
    user: User,
    face_encoding: Optional[bytes] = None,
    retina_data: Optional[bytes] = None
) -> bool:
    """
    Verify if biometric data matches user's stored data
    Placeholder for future implementation
    """
    if face_encoding and user.face_encoding:
        pass

    if retina_data and user.retina_data:
        pass

    return False


def has_permission(user: User, permission_name: str) -> bool:
    """
    Check if user has a specific permission
    """
    ROLE_PERMISSIONS: dict[str, list[str]] = {
        'ADMIN': ['all'],
        'DIRECTOR': ['view_all_users', 'view_reports', 'manage_events'],
        'SECURITY': ['gate_access', 'visitor_management', 'view_logs'],
        'HR': ['manage_staff', 'view_attendance'],
        'FACULTY': ['view_students', 'mark_attendance'],
        'STAFF': ['view_profile'],
        'STUDENT': ['view_profile', 'view_events'],
        'PARENT': ['view_child_info'],
    }

    user_permissions = ROLE_PERMISSIONS.get(user.role, [])
    return permission_name in user_permissions or 'all' in user_permissions


def validate_cnic(cnic: str) -> bool:
    """
    Validate Pakistani CNIC format (13 digits)
    """
    import re
    clean_cnic = cnic.replace('-', '').replace(' ', '')
    return bool(re.match(r'^\d{13}$', clean_cnic))


def mask_email(email: str) -> str:
    """
    Mask email for privacy (e.g., j***@example.com)
    """
    if '@' not in email:
        return email

    username, domain = email.split('@')
    if len(username) <= 2:
        masked_username = username[0] + '*'
    else:
        masked_username = username[0] + '*' * (len(username) - 2) + username[-1]

    return f"{masked_username}@{domain}"


def generate_random_password(length: int = 12) -> str:
    """
    Generate a secure random password
    """
    alphabet = string.ascii_letters + string.digits + string.punctuation
    return ''.join(random.choice(alphabet) for _ in range(length))
