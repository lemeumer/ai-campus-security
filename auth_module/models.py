# models.py - User Management & Authentication Models (Python 3.14 Compatible)
from __future__ import annotations
from typing import Optional
from django.db import models
from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.utils import timezone
import uuid
import logging

logger = logging.getLogger(__name__)


class UserManager(BaseUserManager):
    """Custom user manager for handling user creation"""

    def create_user(
        self, email: str, password: str | None = None, **extra_fields
    ) -> "User":
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(
        self, email: str, password: str | None = None, **extra_fields
    ) -> "User":
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", "ADMIN")
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom User Model for the Campus Security System
    Supports multiple user roles and biometric data
    Python 3.14 Compatible with modern type hints
    """

    ROLE_CHOICES = [
        ("STUDENT", "Student"),
        ("FACULTY", "Faculty"),
        ("STAFF", "Staff"),
        ("PARENT", "Parent"),
        ("SECURITY", "Security Personnel"),
        ("ADMIN", "Administrator"),
        ("DIRECTOR", "Director"),
        ("HR", "Human Resources"),
        ("VISITOR", "Visitor"),
    ]

    STATUS_CHOICES = [
        # Self-registered accounts wait in PENDING until an admin reviews them.
        # Login is blocked while in this state. The Admin UI's "Pending
        # Registrations" page is the queue of these accounts.
        ("PENDING",   "Pending Approval"),
        ("ACTIVE",    "Active"),
        ("REJECTED",  "Rejected"),
        ("INACTIVE",  "Inactive"),
        ("SUSPENDED", "Suspended"),
        ("GRADUATED", "Graduated"),
    ]

    # Primary Fields
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)
    username = models.CharField(max_length=150, unique=True, db_index=True)

    # Personal Information
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    phone_number = models.CharField(max_length=20, blank=True)
    cnic = models.CharField(max_length=15, unique=True, null=True, blank=True)

    # Role & Status
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ACTIVE")

    # University Specific
    university_id = models.CharField(max_length=50, unique=True, null=True, blank=True)
    department = models.CharField(max_length=100, blank=True)
    program = models.CharField(max_length=100, blank=True)
    semester = models.IntegerField(null=True, blank=True)
    designation = models.CharField(max_length=100, blank=True)  # Faculty/Staff job title

    # ── Real campus ID card fields ────────────────────────────────────────
    # The printed identifier on the actual physical card (e.g. "03-134222-110").
    # This is what OCR reads at the gate; lookup_by_card() queries this first
    # before falling back to the legacy university_id.
    enrollment_number = models.CharField(
        max_length=30, unique=True, null=True, blank=True, db_index=True,
        help_text='Printed registration / enrollment number on the campus card '
                  '(e.g. "03-134222-110"). Distinct from the auto-generated '
                  'university_id which is internal-only.'
    )
    campus = models.CharField(max_length=100, blank=True,
                              help_text='e.g. "Lahore Campus"')
    card_serial_no = models.CharField(max_length=20, blank=True,
                                      help_text='Card serial / S.No on the back')
    card_issued_on = models.CharField(max_length=20, blank=True,
                                      help_text='As printed on card, e.g. "SEP-2022"')
    card_valid_upto = models.CharField(max_length=20, blank=True,
                                       help_text='As printed on card, e.g. "SEP-2028"')

    # Biometric Data Storage
    face_encoding = models.BinaryField(null=True, blank=True)  # Facial recognition data
    retina_data = models.BinaryField(null=True, blank=True)  # Retina scan data
    card_number = models.CharField(max_length=50, unique=True, null=True, blank=True)

    # Permissions & Access
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)  # Email/Phone verification

    # Timestamps
    date_joined = models.DateTimeField(default=timezone.now)
    last_login = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Profile Picture
    profile_picture = models.ImageField(upload_to="profiles/", null=True, blank=True)

    # Emergency Contact (for students)
    emergency_contact_name = models.CharField(max_length=200, blank=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True)

    # ── Approval audit (set when admin approves / rejects a pending account) ──
    approved_by = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="approved_users",
        help_text="Admin / director who approved (or rejected) this account",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(
        blank=True,
        help_text="Why a registration was rejected — surfaced to admins in the audit log",
    )

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username", "first_name", "last_name", "role"]

    class Meta:
        db_table = "users"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["email", "role"]),
            models.Index(fields=["university_id"]),
            models.Index(fields=["card_number"]),
        ]

    def __str__(self) -> str:
        return f"{self.get_full_name()} ({self.role})"

    def get_full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    def get_short_name(self) -> str:
        return self.first_name


class ParentStudentRelation(models.Model):
    """Links parents to their children (students)"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parent = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="children",
        limit_choices_to={"role": "PARENT"},
    )
    student = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="parents",
        limit_choices_to={"role": "STUDENT"},
    )
    relationship = models.CharField(max_length=50)  # Father, Mother, Guardian
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "parent_student_relations"
        unique_together = ["parent", "student"]
        verbose_name = "Parent-Student Relation"
        verbose_name_plural = "Parent-Student Relations"

    def __str__(self) -> str:
        return f"{self.parent.get_full_name()} - {self.student.get_full_name()}"


class PasswordResetToken(models.Model):
    """Tokens for password reset functionality"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    token = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    class Meta:
        db_table = "password_reset_tokens"
        verbose_name = "Password Reset Token"
        verbose_name_plural = "Password Reset Tokens"

    def is_valid(self) -> bool:
        return not self.is_used and timezone.now() < self.expires_at


class LoginAttempt(models.Model):
    """Track login attempts for security purposes"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField()
    ip_address = models.GenericIPAddressField()
    user_agent = models.TextField()
    success = models.BooleanField()
    failure_reason = models.CharField(max_length=200, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "login_attempts"
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["email", "timestamp"]),
            models.Index(fields=["ip_address", "timestamp"]),
        ]
        verbose_name = "Login Attempt"
        verbose_name_plural = "Login Attempts"


class UserSession(models.Model):
    """Track active user sessions"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sessions")
    token = models.CharField(max_length=500, unique=True)  # JWT token
    device_info = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_activity = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = "user_sessions"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_active"]),
        ]
        verbose_name = "User Session"
        verbose_name_plural = "User Sessions"


class PermissionGroup(models.Model):
    """Define permission groups for role-based access control"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    permissions = models.JSONField(default=dict)  # Store permissions as JSON
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "permission_groups"
        verbose_name = "Permission Group"
        verbose_name_plural = "Permission Groups"

    def __str__(self) -> str:
        return self.name


class UserPermission(models.Model):
    """Assign specific permissions to users"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="custom_permissions"
    )
    permission_group = models.ForeignKey(PermissionGroup, on_delete=models.CASCADE)
    granted_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="granted_permissions"
    )
    granted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "user_permissions"
        unique_together = ["user", "permission_group"]
        verbose_name = "User Permission"
        verbose_name_plural = "User Permissions"


class GateEntry(models.Model):
    """Records every campus gate entry or exit event."""

    ENTRY_TYPE_CHOICES = [("ENTRY", "Entry"), ("EXIT", "Exit")]
    METHOD_CHOICES = [
        ("BIOMETRIC", "Facial Recognition"),
        ("CARD", "University Card"),
        ("FACE_CARD", "Face + Card Cross-Match"),
        ("RETINA", "Retina Scan"),
        ("MANUAL", "Manual Override"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="gate_entries")
    entry_type = models.CharField(max_length=10, choices=ENTRY_TYPE_CHOICES)
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default="BIOMETRIC")
    timestamp = models.DateTimeField(auto_now_add=True)
    logged_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="logged_entries"
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    notes = models.TextField(blank=True)

    # ── Snapshots ────────────────────────────────────────────────────────
    # Saved for emergency review (e.g. an entry was disputed, security needs
    # to see the actual face/card photo). Auto-deleted after 30 days by the
    # `delete_old_snapshots` management command — these files would otherwise
    # accumulate indefinitely. Both fields are optional: not every gate event
    # produces a snapshot (e.g. MANUAL mode has neither, FACE has only face).
    face_snapshot = models.ImageField(
        upload_to='gate_snapshots/face/%Y/%m/%d/',
        null=True, blank=True,
        help_text='Face frame captured at the gate. Auto-deleted after 30 days.',
    )
    card_snapshot = models.ImageField(
        upload_to='gate_snapshots/card/%Y/%m/%d/',
        null=True, blank=True,
        help_text='Card frame captured at the gate. Auto-deleted after 30 days.',
    )

    class Meta:
        db_table = "gate_entries"
        ordering = ["-timestamp"]
        verbose_name = "Gate Entry"
        verbose_name_plural = "Gate Entries"
        indexes = [
            models.Index(fields=["user", "timestamp"]),
            models.Index(fields=["timestamp"]),
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.entry_type} @ {self.timestamp:%Y-%m-%d %H:%M}"


class FaceEnrollment(models.Model):
    """
    Stores a face enrollment for a user — one row per enrollment session.

    History is preserved: re-enrollment creates a NEW row and (per audit policy)
    requires the previous active row to be explicitly deactivated first.
    Multiple `is_active=True` rows per user are allowed when the admin
    intentionally keeps both old and new embeddings (e.g. user got new glasses
    but old photos may still appear at the gate). Gate verification checks
    against ALL active embeddings for a user.

    Embeddings are 512-dim ArcFace vectors stored as raw float32 bytes
    (2048 bytes total). PostgreSQL is the single source of truth — the
    FastAPI face engine loads from here on startup and on cache invalidation.
    """

    QUALITY_GRADE_CHOICES = [
        ("EXCELLENT", "Excellent"),
        ("GOOD", "Good"),
        ("ACCEPTABLE", "Acceptable"),
    ]

    DEACTIVATION_REASON_CHOICES = [
        ("REPLACED", "Replaced by new enrollment"),
        ("ADMIN_REMOVED", "Removed by administrator"),
        ("USER_REQUEST", "Removed at user request"),
        ("QUALITY_ISSUE", "Removed due to recognition issues"),
        ("ACCOUNT_DEACTIVATED", "User account deactivated"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="face_enrollments"
    )

    # The averaged 512-dim ArcFace embedding (2048 bytes of float32)
    embedding = models.BinaryField()

    # Per-frame embeddings stored as JSON list of base64 strings
    # Used as fallback if averaged embedding scores poorly at gate
    frame_embeddings = models.JSONField(default=list, blank=True)

    # Number of frames successfully captured (target: 5)
    frame_count = models.IntegerField(default=5)

    # Quality metrics from enrollment session
    quality_score = models.FloatField(
        help_text="0.0–1.0, average sharpness × brightness × face-size composite"
    )
    quality_grade = models.CharField(
        max_length=20, choices=QUALITY_GRADE_CHOICES, default="GOOD"
    )
    liveness_passed = models.BooleanField(
        default=False, help_text="Anti-spoof check passed during enrollment"
    )

    # Audit trail
    enrolled_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="enrollments_performed",
        help_text="Admin who performed the enrollment",
    )
    enrolled_at = models.DateTimeField(auto_now_add=True)
    enrollment_ip = models.GenericIPAddressField(null=True, blank=True)
    notes = models.TextField(blank=True)

    # Lifecycle
    is_active = models.BooleanField(default=True, db_index=True)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="enrollments_deactivated",
    )
    deactivation_reason = models.CharField(
        max_length=50, choices=DEACTIVATION_REASON_CHOICES, blank=True
    )

    # Usage tracking — useful for "this enrollment hasn't matched in 90 days, archive it"
    last_matched_at = models.DateTimeField(null=True, blank=True)
    match_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "face_enrollments"
        ordering = ["-enrolled_at"]
        verbose_name = "Face Enrollment"
        verbose_name_plural = "Face Enrollments"
        indexes = [
            models.Index(fields=["user", "is_active"]),
            models.Index(fields=["enrolled_at"]),
            models.Index(fields=["is_active", "enrolled_at"]),
        ]

    def __str__(self) -> str:
        status = "active" if self.is_active else "inactive"
        return f"{self.user.get_full_name()} — {status} ({self.enrolled_at:%Y-%m-%d})"

    def deactivate(
        self,
        reason: str,
        by_user: Optional["User"] = None,
    ) -> None:
        """Mark this enrollment inactive — single audit-trail entry point."""
        self.is_active = False
        self.deactivated_at = timezone.now()
        self.deactivated_by = by_user
        self.deactivation_reason = reason
        self.save(update_fields=[
            "is_active", "deactivated_at", "deactivated_by", "deactivation_reason"
        ])

    def record_match(self) -> None:
        """Called by FastAPI when this enrollment produces a successful gate match."""
        self.last_matched_at = timezone.now()
        self.match_count += 1
        self.save(update_fields=["last_matched_at", "match_count"])


class Visitor(models.Model):
    """
    A visitor entry: someone without a campus account who's been let in
    via CNIC scan. The CNIC is captured by OCR at the gate; security can
    edit it before submitting. A visitor can have multiple sessions over
    time (one row per visit), so we keep entry/exit timestamps per row.

    The host (`host_user`) is the person they're visiting and is required
    so security knows who's accountable. Status flips ON_CAMPUS → CHECKED_OUT
    when they leave.
    """

    STATUS_CHOICES = [
        ("ON_CAMPUS",   "On campus"),
        ("CHECKED_OUT", "Checked out"),
        ("DENIED",      "Denied entry"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Visitor identity (captured at the gate)
    full_name    = models.CharField(max_length=200)
    cnic         = models.CharField(
        max_length=15,
        help_text='Pakistani CNIC, normalised to 13 digits (no dashes)',
        db_index=True,
    )
    phone_number = models.CharField(max_length=20, blank=True)
    photo        = models.ImageField(upload_to='visitors/', null=True, blank=True)

    # Visit details
    purpose      = models.CharField(max_length=200, blank=True,
                                    help_text='e.g. "Job interview", "Document collection"')
    host_user    = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='hosted_visitors',
        help_text='The campus account being visited',
    )
    host_department = models.CharField(max_length=100, blank=True,
                                       help_text='Where to send them')

    # Lifecycle
    status     = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ON_CAMPUS')
    entry_time = models.DateTimeField(auto_now_add=True)
    exit_time  = models.DateTimeField(null=True, blank=True)

    # Audit
    logged_by  = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='visitor_logs',
        help_text='Security personnel who registered this visit',
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    # Captured OCR raw text for debugging / audit
    ocr_raw_text = models.JSONField(default=list, blank=True)
    notes        = models.TextField(blank=True)

    class Meta:
        db_table = "visitors"
        ordering = ["-entry_time"]
        verbose_name = "Visitor"
        verbose_name_plural = "Visitors"
        indexes = [
            models.Index(fields=["status", "entry_time"]),
            models.Index(fields=["cnic", "entry_time"]),
            models.Index(fields=["host_user", "entry_time"]),
        ]

    def __str__(self) -> str:
        return f"{self.full_name} (CNIC {self.cnic}) — {self.status}"

    def check_out(self, by_user: Optional["User"] = None) -> None:
        """Record that this visitor has left campus."""
        self.exit_time = timezone.now()
        self.status = "CHECKED_OUT"
        if by_user:
            self.notes = (self.notes + "\n" if self.notes else "") + \
                         f"[checked out by {by_user.email} at {self.exit_time:%Y-%m-%d %H:%M}]"
        self.save(update_fields=["exit_time", "status", "notes"])


# ─── Campus Events ────────────────────────────────────────────────────────────

class Event(models.Model):
    """
    Campus events that admins create and which then appear in role-specific
    portal feeds. Each event carries:
      - the basics (title / description / start-end time / venue)
      - an optional EXTERNAL link (admin-supplied URL — e.g. registration
        form, Zoom link, university notice). The portals render this as
        a button so users can act on the event directly.
      - target_roles: which portals see this event. JSON list of role codes;
        empty/null means visible to ALL authenticated users. We deliberately
        avoid an M2M table — events rarely target more than 3-4 roles and
        a JSON column keeps queries simple.
      - status (DRAFT/PUBLISHED/CANCELLED) so admins can stage events before
        announcing, or cancel without hard-deleting (preserving the audit trail).

    Capacity / registrations are intentionally NOT modelled here for the FYP
    demo — events are announcement-style. If we add registrations later it'll
    be a separate EventRegistration model.
    """

    CATEGORY_CHOICES = [
        ('ACADEMIC', 'Academic'),
        ('SPORTS',   'Sports'),
        ('CULTURAL', 'Cultural'),
        ('WORKSHOP', 'Workshop'),
        ('SEMINAR',  'Seminar'),
        ('NOTICE',   'Notice'),
        ('OTHER',    'Other'),
    ]

    STATUS_CHOICES = [
        ('DRAFT',     'Draft'),
        ('PUBLISHED', 'Published'),
        ('CANCELLED', 'Cancelled'),
    ]

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title       = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    category    = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='OTHER')

    # When + where
    start_time  = models.DateTimeField()
    end_time    = models.DateTimeField(null=True, blank=True)
    venue       = models.CharField(max_length=200, blank=True)

    # External link admins attach to the event (registration page, livestream,
    # PDF notice, Zoom link, etc.). Validated as a URL by Django.
    link        = models.URLField(blank=True,
                                  help_text='Optional external link — registration form, Zoom, notice PDF…')

    # Visibility — list of role codes (e.g. ["STUDENT","FACULTY"]). Empty = ALL.
    target_roles = models.JSONField(
        default=list, blank=True,
        help_text='Role codes that should see this event. Empty list = visible to everyone.',
    )

    status      = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PUBLISHED')

    # Optional poster image
    poster      = models.ImageField(upload_to='events/%Y/%m/', null=True, blank=True)

    # Audit
    created_by  = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='events_created',
    )
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'events'
        ordering = ['-start_time']
        indexes = [
            models.Index(fields=['status', 'start_time']),
            models.Index(fields=['start_time']),
        ]
        verbose_name = 'Event'
        verbose_name_plural = 'Events'

    def __str__(self) -> str:
        return f'{self.title} ({self.start_time:%Y-%m-%d %H:%M})'

    def is_visible_to(self, role: str) -> bool:
        """Whether a user with this role should see the event in their portal."""
        if self.status != 'PUBLISHED':
            return False
        if not self.target_roles:
            return True
        return role in self.target_roles


# ─── Firebase Cloud Messaging (Phase 6) ──────────────────────────────────────

class DeviceToken(models.Model):
    """
    FCM device tokens registered by the React frontend.
    Users (web or mobile) send their device token during login or periodically,
    which we store here. When a gate event occurs, we push notifications to all
    active tokens for that user.

    Lifecycle:
    - Created when frontend POSTs /api/auth/device-token/ during login
    - Marked inactive when user revokes (logout, uninstall browser) or
      token becomes stale (Firebase returns "invalid token" errors)
    - Soft-deleted (is_active=False) never hard-deleted for audit trail
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='device_tokens',
        help_text='User who owns this device',
    )
    token = models.TextField(
        unique=True,
        help_text='Firebase Cloud Messaging device token (long string)',
    )
    device_name = models.CharField(
        max_length=255,
        blank=True,
        help_text='Browser/device identifier (e.g. "Chrome on Windows")',
    )
    is_active = models.BooleanField(
        default=True,
        help_text='False if revoked or failed to deliver',
    )

    # Lifecycle
    registered_at = models.DateTimeField(auto_now_add=True)
    last_used = models.DateTimeField(auto_now=True)
    deactivated_at = models.DateTimeField(null=True, blank=True)

    # Audit
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)

    class Meta:
        db_table = "device_tokens"
        verbose_name = "Device Token"
        verbose_name_plural = "Device Tokens"
        ordering = ["-last_used"]
        indexes = [
            models.Index(fields=["user", "is_active"]),
            models.Index(fields=["token"]),
        ]

    def __str__(self) -> str:
        status = "✓" if self.is_active else "✗"
        return f"{status} {self.device_name or 'Unknown Device'} — {self.user.email}"

    def deactivate(self, reason: str = "") -> None:
        """Mark this token as inactive (e.g., failed delivery)."""
        self.is_active = False
        self.deactivated_at = timezone.now()
        self.save(update_fields=["is_active", "deactivated_at"])
        if reason:
            logger.info(
                "Deactivated device token for %s: %s",
                self.user.email,
                reason,
            )
