# settings.py - Django Settings Configuration (Add these to your main settings.py)

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = "your-secret-key-here-change-in-production"

# Database Configuration
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "campus_security_db",
        "USER": "campus_user",
        "PASSWORD": "12345678",  # The password you just created
        "HOST": "localhost",
        "PORT": "5432",
    }
}

# Custom User Model
AUTH_USER_MODEL = "auth_module.User"

# REST Framework Configuration
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
}

# JWT Configuration
JWT_SECRET_KEY = SECRET_KEY
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7

# Email Configuration
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = "smtp.gmail.com"  # Change based on your email provider
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = "your-email@example.com"
EMAIL_HOST_PASSWORD = "your-email-password"
DEFAULT_FROM_EMAIL = "Campus Security System <noreply@campus.edu>"

# Frontend URL (for password reset links)
FRONTEND_URL = "http://localhost:3000"  # Change to your frontend URL

# CORS Configuration
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:8080",
]

CORS_ALLOW_CREDENTIALS = True

# Middleware Configuration
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "auth_module.middleware.JWTAuthenticationMiddleware",  # Custom JWT middleware
    "auth_module.middleware.SecurityLoggingMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# Installed Apps
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

# Password Validation
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {
            "min_length": 8,
        },
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# Session Configuration
SESSION_COOKIE_AGE = 604800  # 1 week in seconds
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = True  # Set to True in production with HTTPS

# Security Settings
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# File Upload Settings
MEDIA_URL = "/media/"
MEDIA_ROOT = "media/"

# Static Files
STATIC_URL = "/static/"
STATIC_ROOT = "staticfiles/"

# Logging Configuration
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "file": {
            "level": "INFO",
            "class": "logging.FileHandler",
            "filename": "auth_module.log",
        },
        "console": {
            "class": "logging.StreamHandler",
        },
    },
    "loggers": {
        "auth_module": {
            "handlers": ["file", "console"],
            "level": "INFO",
            "propagate": True,
        },
    },
}
