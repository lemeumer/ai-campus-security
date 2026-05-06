# urls.py - URL Configuration for Authentication Module
from django.urls import path
from .views import (
    UserRegistrationView,
    UserLoginView,
    UserLogoutView,
    UserProfileView,
    PasswordChangeView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    UserListView,
    AdminUserDetailView,
    UserSessionListView,
    verify_token,
    # Admin user management (create / pending / approve / reject / delete)
    AdminCreateUserView,
    PendingRegistrationsView,
    approve_registration,
    reject_registration,
    delete_pending_registration,
    # New endpoints
    AttendanceView,
    GateEntryView,
    student_activity,
    update_face_encoding,
    face_encodings_list,
    # Face enrollment (admin-only)
    FaceEnrollmentListCreateView,
    FaceEnrollmentDetailView,
    active_enrollments_bulk,
    record_enrollment_match,
    lookup_user_by_card,
    admin_logs,
    admin_test_sms,
    VisitorListCreateView,
    VisitorDetailView,
    visitor_check_out,
    # Firebase Cloud Messaging (Phase 6)
    DeviceTokenView,
    deactivate_device_token,
    # Events
    EventListView,
    AdminEventListCreateView,
    AdminEventDetailView,
)

app_name = "auth_module"

urlpatterns = [
    # Authentication
    path("register/", UserRegistrationView.as_view(), name="register"),
    path("login/", UserLoginView.as_view(), name="login"),
    path("logout/", UserLogoutView.as_view(), name="logout"),
    path("verify-token/", verify_token, name="verify_token"),
    # Profile
    path("profile/", UserProfileView.as_view(), name="profile"),
    path("profile/update/", UserProfileView.as_view(), name="profile_update"),
    # Password
    path("password-change/", PasswordChangeView.as_view(), name="password_change"),
    path("password-reset/", PasswordResetRequestView.as_view(), name="password_reset"),
    path("password-reset-confirm/", PasswordResetConfirmView.as_view(), name="password_reset_confirm"),
    # User management
    path("users/", UserListView.as_view(), name="user_list"),
    # ── Admin user management ────────────────────────────────────────────────
    # Admin-initiated account creation (auto-active, no pending queue).
    path("admin/users/", AdminCreateUserView.as_view(), name="admin_create_user"),
    # Pending registrations queue (self-registered accounts awaiting approval)
    path("admin/pending/", PendingRegistrationsView.as_view(), name="admin_pending"),
    # Approve / reject a pending registration
    path("admin/users/<uuid:user_id>/approve/", approve_registration, name="admin_approve_user"),
    path("admin/users/<uuid:user_id>/reject/",  reject_registration,  name="admin_reject_user"),
    # Hard-delete a pending/rejected registration (spam clean-up)
    path("admin/users/<uuid:user_id>/delete-pending/",
         delete_pending_registration, name="admin_delete_pending_user"),
    # Admin: read or PATCH any user (admin/director only)
    path("users/<uuid:user_id>/", AdminUserDetailView.as_view(), name="admin_user_detail"),
    # Internal: card OCR -> user lookup (called by FastAPI after scan-card)
    path("users/lookup-card/", lookup_user_by_card, name="lookup_user_by_card"),
    path("users/face-encodings/", face_encodings_list, name="face_encodings_list"),
    path("users/<uuid:user_id>/face-encoding/", update_face_encoding, name="update_face_encoding"),

    # ── Face Enrollment (Admin only) ──────────────────────────────────────────
    # List/create enrollments for a user
    path(
        "users/<uuid:user_id>/face-enrollments/",
        FaceEnrollmentListCreateView.as_view(),
        name="face_enrollment_list_create",
    ),
    # Get/deactivate a single enrollment
    path(
        "face-enrollments/<uuid:enrollment_id>/",
        FaceEnrollmentDetailView.as_view(),
        name="face_enrollment_detail",
    ),
    # Bulk fetch — used by FastAPI to sync all active embeddings
    path(
        "face-enrollments/active/",
        active_enrollments_bulk,
        name="face_enrollments_active",
    ),
    # Record a match — called by FastAPI on successful gate verification
    path(
        "face-enrollments/<uuid:enrollment_id>/match/",
        record_enrollment_match,
        name="face_enrollment_match",
    ),
    # Sessions
    path("sessions/", UserSessionListView.as_view(), name="session_list"),
    path("sessions/<uuid:session_id>/", UserSessionListView.as_view(), name="session_revoke"),
    # Attendance
    path("attendance/", AttendanceView.as_view(), name="attendance"),
    # Gate entries (security dashboard)
    path("gate-entry/", GateEntryView.as_view(), name="gate_entry"),
    # Parent portal — child activity
    path("student-activity/<uuid:student_id>/", student_activity, name="student_activity"),
    # Admin: aggregated audit log (logins + gate + enrollments + sessions)
    path("admin/logs/", admin_logs, name="admin_logs"),
    # Admin: send a test SMS through the Twilio pipeline (works in dev mode too)
    path("admin/test-sms/", admin_test_sms, name="admin_test_sms"),

    # ── Visitors (security registers walk-ins via CNIC OCR) ──────────────
    path("visitors/",                     VisitorListCreateView.as_view(), name="visitor_list_create"),
    path("visitors/<uuid:visitor_id>/",   VisitorDetailView.as_view(),     name="visitor_detail"),
    path("visitors/<uuid:visitor_id>/exit/", visitor_check_out,            name="visitor_check_out"),

    # ── Firebase Cloud Messaging (Phase 6) ─────────────────────────────────
    path("device-token/",                 DeviceTokenView.as_view(),       name="device_token"),
    path("device-token/<uuid:token_id>/", deactivate_device_token,         name="deactivate_device_token"),
    path("device-tokens/",                DeviceTokenView.as_view(),       name="device_tokens"),

    # ── Events ─────────────────────────────────────────────────────────────
    # Public list — any authenticated user, returns published events for their role
    path("events/",                       EventListView.as_view(),         name="event_list"),
    # Admin-only CRUD
    path("admin/events/",                 AdminEventListCreateView.as_view(), name="admin_event_list_create"),
    path("admin/events/<uuid:event_id>/", AdminEventDetailView.as_view(),     name="admin_event_detail"),
]
