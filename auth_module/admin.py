# admin.py - Django Admin Configuration
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.html import format_html
from .models import (
    User,
    ParentStudentRelation,
    PasswordResetToken,
    LoginAttempt,
    UserSession,
    PermissionGroup,
    UserPermission,
    GateEntry,
    FaceEnrollment,
    Visitor,
)


def _img_thumb(field, *, size=64):
    """Return an HTML thumbnail tag for an ImageField, or '—' if absent.

    Used in admin list_display to show captured face/card/CNIC frames inline.
    """
    if not field:
        return "—"
    try:
        url = field.url
    except Exception:
        return "—"
    return format_html(
        '<a href="{0}" target="_blank">'
        '<img src="{0}" style="height:{1}px;width:{1}px;object-fit:cover;'
        'border-radius:6px;border:1px solid #ddd;" /></a>',
        url, size,
    )


def _img_preview(field, *, size=320):
    """Larger preview for the change-form readonly field."""
    if not field:
        return "—"
    try:
        url = field.url
    except Exception:
        return "—"
    return format_html(
        '<a href="{0}" target="_blank">'
        '<img src="{0}" style="max-height:{1}px;max-width:{1}px;'
        'border-radius:8px;border:1px solid #ccc;" /></a>',
        url, size,
    )


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Admin configuration for User model"""

    list_display = [
        "email",
        "username",
        "first_name",
        "last_name",
        "role",
        "status",
        "university_id",
        "is_active",
        "date_joined",
    ]
    list_filter = ["role", "status", "is_active", "is_verified", "date_joined"]
    search_fields = [
        "email",
        "username",
        "first_name",
        "last_name",
        "university_id",
        "cnic",
    ]
    ordering = ["-date_joined"]

    fieldsets = (
        ("Authentication", {"fields": ("email", "username", "password")}),
        (
            "Personal Information",
            {
                "fields": (
                    "first_name",
                    "last_name",
                    "phone_number",
                    "cnic",
                    "profile_picture",
                    "emergency_contact_name",
                    "emergency_contact_phone",
                )
            },
        ),
        ("Role & Status", {"fields": ("role", "status", "is_active", "is_verified")}),
        (
            "University Information",
            {"fields": ("university_id", "department", "program", "semester")},
        ),
        (
            "Biometric Data",
            {
                "fields": ("face_encoding", "retina_data", "card_number"),
                "classes": ("collapse",),
            },
        ),
        (
            "Permissions",
            {
                "fields": ("is_staff", "is_superuser", "groups", "user_permissions"),
                "classes": ("collapse",),
            },
        ),
        (
            "Important Dates",
            {"fields": ("date_joined", "last_login"), "classes": ("collapse",)},
        ),
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "username",
                    "password1",
                    "password2",
                    "first_name",
                    "last_name",
                    "role",
                    "university_id",
                ),
            },
        ),
    )

    readonly_fields = ["date_joined", "last_login"]


@admin.register(ParentStudentRelation)
class ParentStudentRelationAdmin(admin.ModelAdmin):
    """Admin configuration for Parent-Student relationships"""

    list_display = ["parent", "student", "relationship", "is_primary", "created_at"]
    list_filter = ["relationship", "is_primary", "created_at"]
    search_fields = [
        "parent__first_name",
        "parent__last_name",
        "student__first_name",
        "student__last_name",
    ]
    ordering = ["-created_at"]


@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    """Admin configuration for Password Reset Tokens"""

    list_display = ["user", "created_at", "expires_at", "is_used"]
    list_filter = ["is_used", "created_at"]
    search_fields = ["user__email", "token"]
    ordering = ["-created_at"]
    readonly_fields = ["token", "created_at"]


@admin.register(LoginAttempt)
class LoginAttemptAdmin(admin.ModelAdmin):
    """Admin configuration for Login Attempts"""

    list_display = ["email", "ip_address", "success", "timestamp"]
    list_filter = ["success", "timestamp"]
    search_fields = ["email", "ip_address"]
    ordering = ["-timestamp"]
    readonly_fields = [
        "email",
        "ip_address",
        "user_agent",
        "success",
        "failure_reason",
        "timestamp",
    ]


@admin.register(UserSession)
class UserSessionAdmin(admin.ModelAdmin):
    """Admin configuration for User Sessions"""

    list_display = [
        "user",
        "ip_address",
        "is_active",
        "created_at",
        "last_activity",
        "expires_at",
    ]
    list_filter = ["is_active", "created_at"]
    search_fields = ["user__email", "ip_address"]
    ordering = ["-created_at"]
    readonly_fields = ["token", "created_at", "last_activity"]


@admin.register(PermissionGroup)
class PermissionGroupAdmin(admin.ModelAdmin):
    """Admin configuration for Permission Groups"""

    list_display = ["name", "created_at", "updated_at"]
    search_fields = ["name", "description"]
    ordering = ["name"]


@admin.register(UserPermission)
class UserPermissionAdmin(admin.ModelAdmin):
    """Admin configuration for User Permissions"""

    list_display = ["user", "permission_group", "granted_by", "granted_at"]
    list_filter = ["permission_group", "granted_at"]
    search_fields = ["user__email", "permission_group__name"]
    ordering = ["-granted_at"]


# ── Gate Entry / Face Enrollment / Visitor ─────────────────────────────────
# These are mostly written by the gate flow, not edited in admin, but admins
# need to be able to AUDIT them — see who entered when, with which captured
# face/card frame, and which visitor scanned which CNIC. The list views show
# inline thumbnails so an admin can scan a day's gate log at a glance.

@admin.register(GateEntry)
class GateEntryAdmin(admin.ModelAdmin):
    list_display = [
        "timestamp", "user", "entry_type", "method",
        "face_thumb", "card_thumb", "logged_by",
    ]
    list_filter = ["entry_type", "method", "timestamp"]
    search_fields = [
        "user__email", "user__first_name", "user__last_name",
        "user__university_id",
    ]
    date_hierarchy = "timestamp"
    ordering = ["-timestamp"]
    autocomplete_fields = ["user", "logged_by"]
    readonly_fields = [
        "id", "timestamp", "face_preview", "card_preview", "ip_address",
    ]
    fieldsets = (
        ("Event", {"fields": (
            "id", "user", "entry_type", "method", "timestamp", "logged_by",
        )}),
        ("Captured snapshots", {"fields": (
            "face_preview", "face_snapshot", "card_preview", "card_snapshot",
        )}),
        ("Other", {"fields": ("ip_address", "notes")}),
    )

    @admin.display(description="Face")
    def face_thumb(self, obj):
        return _img_thumb(obj.face_snapshot)

    @admin.display(description="Card")
    def card_thumb(self, obj):
        return _img_thumb(obj.card_snapshot)

    @admin.display(description="Face snapshot")
    def face_preview(self, obj):
        return _img_preview(obj.face_snapshot)

    @admin.display(description="Card snapshot")
    def card_preview(self, obj):
        return _img_preview(obj.card_snapshot)


@admin.register(FaceEnrollment)
class FaceEnrollmentAdmin(admin.ModelAdmin):
    list_display = [
        "user", "is_active", "quality_grade", "quality_score",
        "frame_count", "match_count", "last_matched_at", "enrolled_at",
    ]
    list_filter = ["is_active", "quality_grade", "liveness_passed", "enrolled_at"]
    search_fields = [
        "user__email", "user__first_name", "user__last_name",
        "user__university_id",
    ]
    date_hierarchy = "enrolled_at"
    ordering = ["-enrolled_at"]
    autocomplete_fields = ["user", "enrolled_by", "deactivated_by"]
    # Embeddings are raw bytes — never editable, and we hide the JSON
    # frame_embeddings dump because rendering 5 × 2 KB JSON is useless noise.
    readonly_fields = [
        "id", "embedding", "frame_embeddings", "enrolled_at",
        "last_matched_at", "match_count",
    ]


@admin.register(Visitor)
class VisitorAdmin(admin.ModelAdmin):
    list_display = [
        "entry_time", "full_name", "cnic", "host_user", "status",
        "photo_thumb", "logged_by",
    ]
    list_filter = ["status", "entry_time", "host_department"]
    search_fields = ["full_name", "cnic", "phone_number", "host_user__email"]
    date_hierarchy = "entry_time"
    ordering = ["-entry_time"]
    autocomplete_fields = ["host_user", "logged_by"]
    readonly_fields = ["id", "entry_time", "photo_preview", "ocr_raw_text"]
    fieldsets = (
        ("Visitor", {"fields": (
            "id", "full_name", "cnic", "phone_number",
            "photo_preview", "photo",
        )}),
        ("Visit", {"fields": (
            "purpose", "host_user", "host_department",
            "status", "entry_time", "exit_time",
        )}),
        ("Audit", {"fields": ("logged_by", "ip_address", "ocr_raw_text", "notes")}),
    )

    @admin.display(description="Photo")
    def photo_thumb(self, obj):
        return _img_thumb(obj.photo)

    @admin.display(description="Photo preview")
    def photo_preview(self, obj):
        return _img_preview(obj.photo)
