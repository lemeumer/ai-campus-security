# tests/test_authentication.py - Unit Tests for Authentication Module
import pytest
from django.test import TestCase, Client
from django.urls import reverse
from rest_framework import status
from auth_module.models import User, UserSession, LoginAttempt, ParentStudentRelation
from auth_module.utils import generate_jwt_token, decode_jwt_token
from datetime import timedelta
from django.utils import timezone


class UserModelTestCase(TestCase):
    """Test cases for User model"""

    def setUp(self):
        self.student_data = {
            "email": "student@university.edu",
            "username": "student123",
            "first_name": "John",
            "last_name": "Doe",
            "role": "STUDENT",
            "university_id": "STD-CS-24-12345",
            "department": "Computer Science",
        }

    def test_create_user(self):
        """Test creating a user"""
        user = User.objects.create_user(password="TestPass123!", **self.student_data)
        self.assertEqual(user.email, self.student_data["email"])
        self.assertTrue(user.check_password("TestPass123!"))
        self.assertEqual(user.role, "STUDENT")

    def test_create_superuser(self):
        """Test creating a superuser"""
        superuser = User.objects.create_superuser(
            email="admin@university.edu",
            password="AdminPass123!",
            username="admin",
            first_name="Admin",
            last_name="User",
        )
        self.assertTrue(superuser.is_superuser)
        self.assertTrue(superuser.is_staff)
        self.assertEqual(superuser.role, "ADMIN")

    def test_user_get_full_name(self):
        """Test get_full_name method"""
        user = User.objects.create_user(password="TestPass123!", **self.student_data)
        self.assertEqual(user.get_full_name(), "John Doe")

    def test_user_status_default(self):
        """Test default user status"""
        user = User.objects.create_user(password="TestPass123!", **self.student_data)
        self.assertEqual(user.status, "ACTIVE")


class AuthenticationAPITestCase(TestCase):
    """Test cases for Authentication APIs"""

    def setUp(self):
        self.client = Client()
        self.register_url = reverse("auth_module:register")
        self.login_url = reverse("auth_module:login")
        self.logout_url = reverse("auth_module:logout")

        self.user_data = {
            "email": "testuser@university.edu",
            "username": "testuser",
            "password": "TestPass123!",
            "password_confirm": "TestPass123!",
            "first_name": "Test",
            "last_name": "User",
            "role": "STUDENT",
            "university_id": "STD-CS-24-99999",
            "department": "Computer Science",
        }

    def test_user_registration_success(self):
        """Test successful user registration"""
        response = self.client.post(
            self.register_url, self.user_data, content_type="application/json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("token", response.json())
        self.assertIn("user", response.json())

        # Verify user was created
        user_exists = User.objects.filter(email=self.user_data["email"]).exists()
        self.assertTrue(user_exists)

    def test_user_registration_password_mismatch(self):
        """Test registration with mismatched passwords"""
        data = self.user_data.copy()
        data["password_confirm"] = "DifferentPass123!"

        response = self.client.post(
            self.register_url, data, content_type="application/json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_registration_duplicate_email(self):
        """Test registration with duplicate email"""
        # Create first user
        User.objects.create_user(
            password="TestPass123!",
            email=self.user_data["email"],
            username="firstuser",
            first_name="First",
            last_name="User",
            role="STUDENT",
        )

        # Try to create second user with same email
        response = self.client.post(
            self.register_url, self.user_data, content_type="application/json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_login_success(self):
        """Test successful login"""
        # Create user first
        user = User.objects.create_user(
            password="TestPass123!",
            email="logintest@university.edu",
            username="logintest",
            first_name="Login",
            last_name="Test",
            role="STUDENT",
        )

        # Attempt login
        login_data = {"email": "logintest@university.edu", "password": "TestPass123!"}

        response = self.client.post(
            self.login_url, login_data, content_type="application/json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("token", response.json())
        self.assertIn("user", response.json())

    def test_user_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        login_data = {
            "email": "nonexistent@university.edu",
            "password": "WrongPass123!",
        }

        response = self.client.post(
            self.login_url, login_data, content_type="application/json"
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_login_inactive_account(self):
        """Test login with inactive account"""
        user = User.objects.create_user(
            password="TestPass123!",
            email="inactive@university.edu",
            username="inactive",
            first_name="Inactive",
            last_name="User",
            role="STUDENT",
        )
        user.is_active = False
        user.save()

        login_data = {"email": "inactive@university.edu", "password": "TestPass123!"}

        response = self.client.post(
            self.login_url, login_data, content_type="application/json"
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class JWTTokenTestCase(TestCase):
    """Test cases for JWT token operations"""

    def setUp(self):
        self.user = User.objects.create_user(
            email="jwttest@university.edu",
            username="jwttest",
            password="TestPass123!",
            first_name="JWT",
            last_name="Test",
            role="STUDENT",
        )

    def test_generate_jwt_token(self):
        """Test JWT token generation"""
        token = generate_jwt_token(self.user)
        self.assertIsNotNone(token)
        self.assertIsInstance(token, str)

    def test_decode_jwt_token(self):
        """Test JWT token decoding"""
        token = generate_jwt_token(self.user)
        payload = decode_jwt_token(token)

        self.assertIsNotNone(payload)
        self.assertEqual(payload["email"], self.user.email)
        self.assertEqual(payload["role"], self.user.role)

    def test_decode_invalid_token(self):
        """Test decoding invalid token"""
        invalid_token = "invalid.token.here"
        payload = decode_jwt_token(invalid_token)

        self.assertIsNone(payload)


class UserSessionTestCase(TestCase):
    """Test cases for user session management"""

    def setUp(self):
        self.user = User.objects.create_user(
            email="sessiontest@university.edu",
            username="sessiontest",
            password="TestPass123!",
            first_name="Session",
            last_name="Test",
            role="STUDENT",
        )

    def test_create_session(self):
        """Test creating a user session"""
        token = generate_jwt_token(self.user)

        session = UserSession.objects.create(
            user=self.user,
            token=token,
            ip_address="192.168.1.1",
            device_info="Test Device",
            expires_at=timezone.now() + timedelta(days=7),
        )

        self.assertEqual(session.user, self.user)
        self.assertTrue(session.is_active)

    def test_multiple_sessions(self):
        """Test user with multiple active sessions"""
        for i in range(3):
            token = generate_jwt_token(self.user)
            UserSession.objects.create(
                user=self.user,
                token=token,
                ip_address=f"192.168.1.{i}",
                device_info=f"Device {i}",
                expires_at=timezone.now() + timedelta(days=7),
            )

        active_sessions = UserSession.objects.filter(
            user=self.user, is_active=True
        ).count()

        self.assertEqual(active_sessions, 3)


class ParentStudentRelationTestCase(TestCase):
    """Test cases for parent-student relationships"""

    def setUp(self):
        self.parent = User.objects.create_user(
            email="parent@example.com",
            username="parent123",
            password="ParentPass123!",
            first_name="Parent",
            last_name="User",
            role="PARENT",
        )

        self.student = User.objects.create_user(
            email="student@university.edu",
            username="student123",
            password="StudentPass123!",
            first_name="Student",
            last_name="User",
            role="STUDENT",
            university_id="STD-CS-24-12345",
        )

    def test_create_parent_student_relation(self):
        """Test creating parent-student relationship"""
        relation = ParentStudentRelation.objects.create(
            parent=self.parent,
            student=self.student,
            relationship="Father",
            is_primary=True,
        )

        self.assertEqual(relation.parent, self.parent)
        self.assertEqual(relation.student, self.student)
        self.assertTrue(relation.is_primary)

    def test_parent_can_have_multiple_children(self):
        """Test parent with multiple children"""
        student2 = User.objects.create_user(
            email="student2@university.edu",
            username="student456",
            password="StudentPass123!",
            first_name="Student2",
            last_name="User",
            role="STUDENT",
            university_id="STD-CS-24-67890",
        )

        ParentStudentRelation.objects.create(
            parent=self.parent, student=self.student, relationship="Father"
        )

        ParentStudentRelation.objects.create(
            parent=self.parent, student=student2, relationship="Father"
        )

        children_count = ParentStudentRelation.objects.filter(
            parent=self.parent
        ).count()

        self.assertEqual(children_count, 2)


class LoginAttemptTestCase(TestCase):
    """Test cases for login attempt tracking"""

    def setUp(self):
        self.email = "test@university.edu"
        self.ip_address = "192.168.1.1"

    def test_log_successful_attempt(self):
        """Test logging successful login attempt"""
        LoginAttempt.objects.create(
            email=self.email,
            ip_address=self.ip_address,
            user_agent="Test Browser",
            success=True,
        )

        attempts = LoginAttempt.objects.filter(email=self.email, success=True).count()

        self.assertEqual(attempts, 1)

    def test_log_failed_attempts(self):
        """Test logging multiple failed attempts"""
        for i in range(5):
            LoginAttempt.objects.create(
                email=self.email,
                ip_address=self.ip_address,
                user_agent="Test Browser",
                success=False,
                failure_reason="Invalid credentials",
            )

        failed_attempts = LoginAttempt.objects.filter(
            email=self.email, success=False
        ).count()

        self.assertEqual(failed_attempts, 5)


# Run tests with: python manage.py test auth_module.tests
# Or with pytest: pytest auth_module/tests/
