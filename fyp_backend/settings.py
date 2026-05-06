"""
Django settings for fyp_backend project.
"""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env at the project root before reading any os.getenv() values below.
# Keeping secrets (SMTP password, internal tokens) in .env means they never get
# committed (.env is in .gitignore) and don't have to live in this file.
try:
    from dotenv import load_dotenv
    load_dotenv(BASE_DIR / ".env")
except ImportError:
    # python-dotenv not installed — fall back to OS env vars only
    pass

SECRET_KEY = "django-insecure-nr8&bfwgndbxe&(g!tur8tor1%hua5+k_qlb^=je$uj&obels2"

DEBUG = True

ALLOWED_HOSTS = []

# Application definition
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    
    # Third-party apps
    "rest_framework",
    "corsheaders",
    "django_filters",
    
    # Your apps
    "auth_module",
]

# Custom User Model
AUTH_USER_MODEL = 'auth_module.User'

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "auth_module.middleware.JWTAuthenticationMiddleware",
    "auth_module.middleware.SecurityLoggingMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "fyp_backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / 'templates'],  # Added for email templates
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "fyp_backend.wsgi.application"

# Database - PostgreSQL Configuration
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "campus_security_db",
        "USER": "postgres",
        "PASSWORD": "12345678",  # Change this to the password you created in psql
        "HOST": "localhost",
        "PORT": "5432",
    }
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# REST Framework Configuration
# We use a custom Bearer-JWT authentication class. SessionAuthentication is
# intentionally NOT included — we don't use Django sessions for the API and
# enabling it would force CSRF checks on every POST/PUT/DELETE.
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'auth_module.authentication.BearerJWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
}

# CORS Configuration
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://localhost:8080",
    "http://127.0.0.1:3000",
]

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    "accept", "accept-encoding", "authorization", "content-type",
    "dnt", "origin", "user-agent", "x-csrftoken", "x-requested-with",
]

# CSRF trusted origins — required by Django 4+ for any non-GET request whose
# Origin header is set (which is every browser fetch/axios call). Without this,
# DRF requests from the Vite dev server fail with:
#   "CSRF Failed: Origin checking failed - http://localhost:5173 does not match
#    any trusted origins."
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8080",
]

# JWT Configuration
JWT_SECRET_KEY = SECRET_KEY
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_DAYS = 7

# Internal service-to-service auth — used by FastAPI face engine to read
# the active-enrollments bulk endpoint without a user JWT. In production this
# should be a long random secret loaded from env vars.
import os as _os
INTERNAL_SERVICE_TOKEN = _os.getenv(
    "INTERNAL_SERVICE_TOKEN",
    "dev-internal-token-change-me-in-prod",
)

# URL of the FastAPI face recognition microservice.
FACE_SERVICE_URL = _os.getenv("FACE_SERVICE_URL", "http://127.0.0.1:5000")

# ── Twilio (parent SMS on student gate events) ─────────────────────────────
# When all three creds are set we send real SMS via Twilio. When any are
# missing we fall back to "console mode": the message gets logged to the
# Django console + recorded in NotificationLog so the feature is fully
# observable end-to-end without needing a Twilio account.
TWILIO_ACCOUNT_SID  = _os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN   = _os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER  = _os.getenv("TWILIO_FROM_NUMBER", "")
# Set to "true" in .env to send real SMS even when creds look incomplete
# (useful if you put creds somewhere other than env vars). Default safe.
TWILIO_ENABLED = bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER) \
    or _os.getenv("TWILIO_ENABLED", "").lower() == "true"

# Brand prefix for outbound SMS — kept short to fit one segment (160 chars
# total) so each gate event costs exactly one SMS credit.
SMS_BRAND_PREFIX = _os.getenv("SMS_BRAND_PREFIX", "AI Campus Security")

# ── Email configuration ─────────────────────────────────────────────────────
# Welcome + password-reset emails are sent through Django's send_mail.
# Set EMAIL_HOST_USER and EMAIL_HOST_PASSWORD via environment variables.
# For Gmail you MUST use an App Password (not your real password):
#   https://myaccount.google.com/apppasswords
# If credentials are missing, we fall back to console output for dev.
EMAIL_HOST_USER = _os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = _os.getenv("EMAIL_HOST_PASSWORD", "")

if EMAIL_HOST_USER and EMAIL_HOST_PASSWORD:
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
    EMAIL_HOST = _os.getenv("EMAIL_HOST", "smtp.gmail.com")
    EMAIL_PORT = int(_os.getenv("EMAIL_PORT", "587"))
    EMAIL_USE_TLS = _os.getenv("EMAIL_USE_TLS", "true").lower() == "true"
    EMAIL_TIMEOUT = 15  # seconds
else:
    # Dev fallback — prints emails to the Django console
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

DEFAULT_FROM_EMAIL = _os.getenv(
    "DEFAULT_FROM_EMAIL",
    EMAIL_HOST_USER or "AI Based Campus Security <noreply@campus-security.local>",
)

# Public URL of the React frontend — used in email templates for portal links
# and in the password-reset flow. Must match the Vite dev server port (5173).
FRONTEND_URL = _os.getenv("FRONTEND_URL", "http://localhost:5173")

# ── Firebase Cloud Messaging (real-time push notifications) ────────────────
# Device tokens are registered by the React frontend and stored per-user.
# When a gate event occurs, we push notifications to:
#   - SECURITY role: suspicious access denials, enrollment completions
#   - ADMIN/DIRECTOR: all gate events, system alerts
#   - PARENT: student entry/exit (as FCM push, NOT just SMS)
# Set FIREBASE_CREDENTIALS_PATH to the downloaded service-account.json file.
# If missing, notifications degrade to console logging (dev mode).
FIREBASE_ENABLED = _os.getenv("FIREBASE_ENABLED", "").lower() == "true"
FIREBASE_CREDENTIALS_PATH = _os.getenv("FIREBASE_CREDENTIALS_PATH", "")
FIREBASE_PROJECT_ID = _os.getenv("FIREBASE_PROJECT_ID", "")

# Internationalization
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Media files (for profile pictures)
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Default primary key field type
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
# CORS_ALLOW_ALL_ORIGINS removed — incompatible with CORS_ALLOW_CREDENTIALS=True.
# Use the explicit CORS_ALLOWED_ORIGINS list above instead.