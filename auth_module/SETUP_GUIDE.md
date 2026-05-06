# Project Structure & Setup Guide

## 📁 Complete Project Structure

```
campus_security_system/
│
├── auth_module/                    # User Authentication Module
│   ├── __init__.py
│   ├── models.py                   # Database models
│   ├── serializers.py              # API serializers
│   ├── views.py                    # API views/endpoints
│   ├── urls.py                     # URL routing
│   ├── admin.py                    # Django admin config
│   ├── permissions.py              # Custom permissions
│   ├── middleware.py               # Custom middleware
│   ├── utils.py                    # Utility functions
│   ├── apps.py                     # App configuration
│   ├── migrations/                 # Database migrations
│   │   └── __init__.py
│   └── tests/                      # Unit tests
│       ├── __init__.py
│       └── test_authentication.py
│
├── campus_security/                # Main project folder
│   ├── __init__.py
│   ├── settings.py                 # Django settings
│   ├── urls.py                     # Main URL configuration
│   ├── wsgi.py                     # WSGI config
│   └── asgi.py                     # ASGI config
│
├── templates/                      # Email templates
│   └── emails/
│       ├── welcome.html
│       └── password_reset.html
│
├── static/                         # Static files
│   ├── css/
│   ├── js/
│   └── images/
│
├── media/                          # User uploaded files
│   └── profiles/                   # Profile pictures
│
├── requirements.txt                # Python dependencies
├── .env.example                    # Environment variables template
├── .gitignore                      # Git ignore file
├── manage.py                       # Django management script
├── README.md                       # Project documentation
└── postman_collection.json         # API testing collection
```

## 🚀 Quick Setup Guide

### 1. Create Project Structure

```bash
# Create main project directory
django-admin startproject campus_security
cd campus_security

# Create auth_module app
python manage.py startapp auth_module

# Create additional directories
mkdir -p templates/emails
mkdir -p static/{css,js,images}
mkdir -p media/profiles
mkdir -p auth_module/tests
```

### 2. Copy Module Files

Copy all the files from the auth_module folder into your project's auth_module directory:

- models.py → auth_module/models.py
- serializers.py → auth_module/serializers.py
- views.py → auth_module/views.py
- urls.py → auth_module/urls.py
- admin.py → auth_module/admin.py
- permissions.py → auth_module/permissions.py
- middleware.py → auth_module/middleware.py
- utils.py → auth_module/utils.py

### 3. Update Main Settings

Edit `campus_security/settings.py`:

```python
# Add to INSTALLED_APPS
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third-party apps
    'rest_framework',
    'corsheaders',
    'django_filters',
    
    # Your apps
    'auth_module',
]

# Custom User Model
AUTH_USER_MODEL = 'auth_module.User'

# Add middleware
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'auth_module.middleware.JWTAuthenticationMiddleware',
    'auth_module.middleware.SecurityLoggingMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# Copy REST_FRAMEWORK config from settings_example.py
# Copy Database config
# Copy Email config
# Copy CORS config
```

### 4. Update Main URLs

Edit `campus_security/urls.py`:

```python
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('auth_module.urls')),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
```

### 5. Create Email Templates

Create `templates/emails/welcome.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Welcome to Campus Security System</title>
</head>
<body>
    <h1>Welcome {{ user.get_full_name }}!</h1>
    <p>Your account has been successfully created.</p>
    <p>Role: {{ user.role }}</p>
    <p>University ID: {{ user.university_id }}</p>
    <p>Thank you for joining us!</p>
</body>
</html>
```

Create `templates/emails/password_reset.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Password Reset Request</title>
</head>
<body>
    <h1>Password Reset Request</h1>
    <p>Hello {{ user.get_full_name }},</p>
    <p>Click the link below to reset your password:</p>
    <a href="{{ reset_link }}">Reset Password</a>
    <p>This link will expire in {{ expiry_hours }} hour(s).</p>
    <p>If you didn't request this, please ignore this email.</p>
</body>
</html>
```

### 6. Create Environment File

Create `.env` file:

```env
SECRET_KEY=your-super-secret-key-change-this
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

DATABASE_NAME=campus_security_db
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password
DATABASE_HOST=localhost
DATABASE_PORT=5432

EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
FRONTEND_URL=http://localhost:3000
```

Create `.env.example` (without sensitive data):

```env
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

DATABASE_NAME=campus_security_db
DATABASE_USER=your_db_user
DATABASE_PASSWORD=your_db_password
DATABASE_HOST=localhost
DATABASE_PORT=5432

EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-email-password
FRONTEND_URL=http://localhost:3000
```

### 7. Create .gitignore

```gitignore
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
ENV/
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg

# Django
*.log
local_settings.py
db.sqlite3
db.sqlite3-journal
/media
/staticfiles

# Environment
.env
.venv

# IDEs
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Database
*.sqlite3
```

## 🔧 Complete Installation Steps

### Step-by-Step Setup

```bash
# 1. Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Create PostgreSQL database
psql -U postgres
CREATE DATABASE campus_security_db;
CREATE USER db_admin WITH PASSWORD 'secure_password';
ALTER ROLE db_admin SET client_encoding TO 'utf8';
ALTER ROLE db_admin SET default_transaction_isolation TO 'read committed';
ALTER ROLE db_admin SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE campus_security_db TO db_admin;
\q

# 4. Run migrations
python manage.py makemigrations
python manage.py migrate

# 5. Create superuser
python manage.py createsuperuser

# 6. Collect static files
python manage.py collectstatic

# 7. Run development server
python manage.py runserver
```

## 📊 Database Initialization

Create a management command to populate initial data:

Create `auth_module/management/commands/init_data.py`:

```python
from django.core.management.base import BaseCommand
from auth_module.models import User, PermissionGroup

class Command(BaseCommand):
    help = 'Initialize database with default data'
    
    def handle(self, *args, **options):
        # Create permission groups
        permissions = [
            {
                'name': 'Student Permissions',
                'permissions': {
                    'view_profile': True,
                    'edit_profile': True,
                    'view_events': True
                }
            },
            {
                'name': 'Faculty Permissions',
                'permissions': {
                    'view_students': True,
                    'mark_attendance': True
                }
            },
            # Add more permission groups
        ]
        
        for perm in permissions:
            PermissionGroup.objects.get_or_create(
                name=perm['name'],
                defaults={'permissions': perm['permissions']}
            )
        
        self.stdout.write(self.style.SUCCESS('Database initialized successfully'))
```

Run with:
```bash
python manage.py init_data
```

## 🧪 Testing Setup

```bash
# Run all tests
python manage.py test

# Run specific app tests
python manage.py test auth_module

# Run with coverage
coverage run --source='.' manage.py test
coverage report
coverage html
```

## 📱 Import Postman Collection

1. Open Postman
2. Click "Import"
3. Select `postman_collection.json`
4. Create an environment with variables:
   - `base_url`: http://localhost:8000/api/auth
   - `jwt_token`: (will be set automatically after login)

## 🔐 Security Checklist for Production

- [ ] Change SECRET_KEY
- [ ] Set DEBUG = False
- [ ] Configure ALLOWED_HOSTS
- [ ] Use HTTPS
- [ ] Enable CSRF protection
- [ ] Set secure cookie flags
- [ ] Configure CORS properly
- [ ] Use environment variables
- [ ] Enable rate limiting
- [ ] Set up logging
- [ ] Configure email service
- [ ] Set up database backups
- [ ] Use Redis for sessions
- [ ] Enable Celery for async tasks
- [ ] Set up monitoring (Sentry)

## 📞 Support

For issues or questions about this module, please refer to the README.md file or contact the development team.
