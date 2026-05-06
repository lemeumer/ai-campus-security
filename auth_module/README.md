# User Management & Authentication Module
## AI-Based Campus Security System - Final Year Project

### 📋 Overview
This module provides comprehensive user authentication and management for an AI-based campus security system with facial recognition, university card scanning, and multi-portal access for students, faculty, staff, parents, security, HR, admin, and director roles.

---

## 🎯 Features

### Core Authentication
- ✅ **Role-based authentication** (9 user roles)
- ✅ **JWT token-based authentication**
- ✅ **Session management** with device tracking
- ✅ **Password reset** via email
- ✅ **Login attempt tracking** and rate limiting
- ✅ **Multi-device session support**

### User Roles
1. **STUDENT** - Access to student portal, events, check-in/out tracking
2. **FACULTY** - Staff portal, attendance management
3. **STAFF** - Employee portal, facial scan attendance
4. **PARENT** - View children's check-in/out times, receive notifications
5. **SECURITY** - Gate access control, visitor management
6. **ADMIN** - Full system access and user management
7. **DIRECTOR** - Executive dashboard and reports
8. **HR** - Staff management and attendance reports
9. **VISITOR** - Temporary access with CNIC verification

### Security Features
- 🔐 Rate limiting on login attempts
- 🔒 Secure password hashing with bcrypt
- 🎫 JWT token expiration and refresh
- 📊 Security event logging
- 🚨 IP-based access tracking
- ✉️ Email verification system

### Biometric Integration Ready
- Face encoding storage for facial recognition
- Retina data storage for veiled/masked individuals
- University card number linking
- Face-card comparison support

---

## 🛠️ Technology Stack

**Backend Framework:** Django 4.2.7  
**API Framework:** Django REST Framework 3.14.0  
**Database:** PostgreSQL  
**Authentication:** JWT (PyJWT)  
**Password Security:** Bcrypt  
**Image Processing:** Pillow, OpenCV, face_recognition  

---

## 📦 Installation Guide

### Prerequisites
- Python 3.9 or higher
- PostgreSQL 13 or higher
- pip package manager
- Virtual environment (recommended)

### Step 1: Clone and Setup Virtual Environment
```bash
# Create project directory
mkdir campus_security_system
cd campus_security_system

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On Linux/Mac:
source venv/bin/activate
```

### Step 2: Install Dependencies
```bash
pip install -r requirements.txt
```

### Step 3: Database Setup
```bash
# Create PostgreSQL database
psql -U postgres
CREATE DATABASE campus_security_db;
CREATE USER your_db_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE campus_security_db TO your_db_user;
\q
```

### Step 4: Configure Settings
Create a `.env` file in your project root:
```env
SECRET_KEY=your-super-secret-key-here
DATABASE_NAME=campus_security_db
DATABASE_USER=your_db_user
DATABASE_PASSWORD=your_password
DATABASE_HOST=localhost
DATABASE_PORT=5432

EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-email-app-password
FRONTEND_URL=http://localhost:3000
```

### Step 5: Run Migrations
```bash
python manage.py makemigrations auth_module
python manage.py migrate
```

### Step 6: Create Superuser
```bash
python manage.py createsuperuser
```

### Step 7: Run Development Server
```bash
python manage.py runserver
```

The API will be available at `http://localhost:8000/`

---

## 📡 API Endpoints

### Authentication Endpoints

#### 1. Register User
```http
POST /api/auth/register/
Content-Type: application/json

{
  "email": "student@university.edu",
  "username": "student123",
  "password": "SecurePass123!",
  "password_confirm": "SecurePass123!",
  "first_name": "John",
  "last_name": "Doe",
  "phone_number": "+923001234567",
  "cnic": "1234567890123",
  "role": "STUDENT",
  "university_id": "STD-CS-24-12345",
  "department": "Computer Science",
  "program": "BS Software Engineering",
  "semester": 6
}

Response: 201 CREATED
{
  "message": "User registered successfully",
  "user": { ... },
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

#### 2. Login
```http
POST /api/auth/login/
Content-Type: application/json

{
  "email": "student@university.edu",
  "password": "SecurePass123!"
}

Response: 200 OK
{
  "message": "Login successful",
  "user": { ... },
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "session_id": "uuid-here"
}
```

#### 3. Logout
```http
POST /api/auth/logout/
Authorization: Bearer <token>

Response: 200 OK
{
  "message": "Logout successful"
}
```

#### 4. Get User Profile
```http
GET /api/auth/profile/
Authorization: Bearer <token>

Response: 200 OK
{
  "id": "uuid",
  "email": "student@university.edu",
  "username": "student123",
  "first_name": "John",
  "last_name": "Doe",
  "full_name": "John Doe",
  "role": "STUDENT",
  "status": "ACTIVE",
  ...
}
```

#### 5. Update Profile
```http
PUT /api/auth/profile/update/
Authorization: Bearer <token>
Content-Type: application/json

{
  "phone_number": "+923009876543",
  "emergency_contact_name": "Jane Doe",
  "emergency_contact_phone": "+923001111111"
}
```

#### 6. Change Password
```http
POST /api/auth/password-change/
Authorization: Bearer <token>
Content-Type: application/json

{
  "old_password": "SecurePass123!",
  "new_password": "NewSecurePass456!",
  "new_password_confirm": "NewSecurePass456!"
}
```

#### 7. Request Password Reset
```http
POST /api/auth/password-reset/
Content-Type: application/json

{
  "email": "student@university.edu"
}

Response: 200 OK
{
  "message": "Password reset link sent to your email"
}
```

#### 8. Confirm Password Reset
```http
POST /api/auth/password-reset-confirm/
Content-Type: application/json

{
  "token": "reset-token-from-email",
  "new_password": "NewSecurePass456!",
  "new_password_confirm": "NewSecurePass456!"
}
```

#### 9. Verify Token
```http
GET /api/auth/verify-token/
Authorization: Bearer <token>

Response: 200 OK
{
  "valid": true,
  "user": { ... }
}
```

### User Management Endpoints (Admin/Director only)

#### 10. List All Users
```http
GET /api/auth/users/
Authorization: Bearer <token>

# With filters:
GET /api/auth/users/?role=STUDENT&department=Computer%20Science&search=john

Response: 200 OK
{
  "count": 150,
  "next": "...",
  "previous": null,
  "results": [ ... ]
}
```

### Session Management

#### 11. List Active Sessions
```http
GET /api/auth/sessions/
Authorization: Bearer <token>

Response: 200 OK
{
  "sessions": [
    {
      "id": "uuid",
      "device_info": "Mozilla/5.0...",
      "ip_address": "192.168.1.1",
      "created_at": "2024-01-15T10:30:00Z",
      "last_activity": "2024-01-15T12:45:00Z"
    }
  ]
}
```

#### 12. Revoke Session
```http
DELETE /api/auth/sessions/<session_id>/
Authorization: Bearer <token>
```

---

## 🔐 Role-Based Access Control

### Permission Matrix

| Feature | Student | Faculty | Staff | Parent | Security | Admin | Director | HR |
|---------|---------|---------|-------|--------|----------|-------|----------|-----|
| View own profile | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Update own profile | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View all users | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage users | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Gate access control | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| View reports | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| View child info | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Manage events | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |

---

## 🧪 Testing

### Run Tests
```bash
# Run all tests
pytest

# Run specific test file
pytest tests/test_authentication.py

# Run with coverage
pytest --cov=auth_module
```

### Sample Test Cases
```python
# tests/test_authentication.py
from django.test import TestCase
from auth_module.models import User

class AuthenticationTestCase(TestCase):
    def test_user_registration(self):
        user = User.objects.create_user(
            email='test@university.edu',
            username='testuser',
            password='TestPass123!',
            first_name='Test',
            last_name='User',
            role='STUDENT'
        )
        self.assertEqual(user.email, 'test@university.edu')
        self.assertTrue(user.check_password('TestPass123!'))
```

---

## 🔗 Integration with Other Modules

### Facial Recognition Module
```python
from auth_module.models import User
from facial_recognition import verify_face

def authenticate_with_face(face_encoding):
    users = User.objects.filter(face_encoding__isnull=False)
    
    for user in users:
        if verify_face(face_encoding, user.face_encoding):
            return user
    
    return None
```

### Gate Entry Module
```python
from auth_module.models import User
from gate_module.models import GateEntry

def record_entry(user_id, gate_id):
    user = User.objects.get(id=user_id)
    
    GateEntry.objects.create(
        user=user,
        gate_id=gate_id,
        entry_time=timezone.now()
    )
    
    # Notify parent if user is student
    if user.role == 'STUDENT':
        notify_parents(user)
```

---

## 📊 Database Schema

### User Model Fields
- **Primary:** id (UUID), email, username, password
- **Personal:** first_name, last_name, phone_number, cnic
- **Role:** role (STUDENT/FACULTY/etc.), status (ACTIVE/INACTIVE)
- **University:** university_id, department, program, semester
- **Biometric:** face_encoding, retina_data, card_number
- **Permissions:** is_active, is_verified, is_staff
- **Timestamps:** date_joined, last_login, created_at, updated_at

---

## 🚀 Deployment

### Production Checklist
- [ ] Set `DEBUG = False` in settings
- [ ] Use strong `SECRET_KEY`
- [ ] Configure production database
- [ ] Set up HTTPS/SSL certificates
- [ ] Configure email service (SendGrid, AWS SES, etc.)
- [ ] Set up Redis for session management
- [ ] Configure Celery for async tasks
- [ ] Set up monitoring (Sentry, New Relic)
- [ ] Enable database backups
- [ ] Configure CORS properly
- [ ] Set up rate limiting
- [ ] Enable logging

### Deploy with Gunicorn
```bash
gunicorn campus_security.wsgi:application --bind 0.0.0.0:8000 --workers 4
```

---

## 📝 Environment Variables

Create a `.env` file with:
```env
# Django
SECRET_KEY=your-secret-key
DEBUG=False
ALLOWED_HOSTS=your-domain.com,www.your-domain.com

# Database
DATABASE_NAME=campus_security_db
DATABASE_USER=db_user
DATABASE_PASSWORD=db_password
DATABASE_HOST=localhost
DATABASE_PORT=5432

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password

# Frontend
FRONTEND_URL=https://your-frontend-url.com

# JWT
JWT_SECRET_KEY=your-jwt-secret
JWT_EXPIRATION_DAYS=7
```

---

## 🆘 Troubleshooting

### Common Issues

**Issue:** Database connection failed
```bash
# Solution: Check PostgreSQL is running
sudo systemctl status postgresql
sudo systemctl start postgresql
```

**Issue:** Migration errors
```bash
# Solution: Reset migrations
python manage.py migrate auth_module zero
python manage.py makemigrations auth_module
python manage.py migrate
```

**Issue:** JWT token not working
```bash
# Solution: Verify token format in header
# Should be: Authorization: Bearer <token>
```

---

## 📚 Additional Resources

- [Django Documentation](https://docs.djangoproject.com/)
- [Django REST Framework](https://www.django-rest-framework.org/)
- [JWT.io](https://jwt.io/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

## 👥 Project Team

**Developer:** [Your Name]  
**Institution:** [Your University]  
**Project:** AI-Based Campus Security System  
**Module:** User Management & Authentication  

---

## 📄 License

This project is developed as part of a university final year project.

---

## 🔄 Future Enhancements

- [ ] Two-factor authentication (2FA)
- [ ] OAuth integration (Google, Microsoft)
- [ ] Biometric authentication API
- [ ] Real-time session monitoring dashboard
- [ ] Advanced audit logging
- [ ] Role permission customization UI
- [ ] Bulk user import from CSV
- [ ] User activity analytics

---

**Last Updated:** January 2025  
**Version:** 1.0.0
