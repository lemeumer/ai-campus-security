# views.py - Authentication & User Management Views (Python 3.14 Compatible)
from __future__ import annotations
from typing import Any
from rest_framework import status, generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.request import Request
from django.contrib.auth import update_session_auth_hash
from django.utils import timezone
from datetime import timedelta
import secrets

from .models import (
    User, PasswordResetToken, LoginAttempt, UserSession,
    FaceEnrollment, Visitor, Event,
)
from .serializers import (
    UserRegistrationSerializer, UserLoginSerializer, UserSerializer,
    UserDetailSerializer, PasswordChangeSerializer,
    PasswordResetRequestSerializer, PasswordResetConfirmSerializer,
    FaceEnrollmentSerializer, FaceEnrollmentRequestSerializer,
    FaceEnrollmentDeactivateSerializer,
    VisitorSerializer, VisitorCreateSerializer,
    EventSerializer, EventWriteSerializer,
)
from .utils import (
    generate_jwt_token, decode_jwt_token, send_password_reset_email,
    send_welcome_email, send_registration_received_email, send_rejection_email,
    get_client_ip, get_user_agent, check_rate_limit,
    generate_university_id
)
from .permissions import IsAdmin, IsDirector, IsSecurityOrAdmin


def _decode_data_url(data_url: str, filename: str):
    """
    Decode a base64 data URL into a Django ContentFile suitable for an
    ImageField.save(). Returns None when the input doesn't look like a
    data URL — callers treat that as "no snapshot" and skip silently.
    """
    import base64
    from django.core.files.base import ContentFile
    if not data_url or not isinstance(data_url, str):
        return None
    if ',' in data_url:
        # "data:image/jpeg;base64,XXXX" -> "XXXX"
        data_url = data_url.split(',', 1)[1]
    try:
        binary = base64.b64decode(data_url)
    except Exception:
        return None
    if not binary:
        return None
    return ContentFile(binary, name=filename)


class UserRegistrationView(APIView):
    """
    Public self-registration endpoint.

    Self-registered accounts land in `status="PENDING"` with `is_active=False`
    and DO NOT receive a JWT — they cannot log in until an admin / director
    approves them via the Pending Registrations queue. This stops random
    sign-ups from getting into the system without oversight.

    Admins create users directly via `AdminCreateUserView` (auto-active).
    """
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        # Copy data to modify it
        data = request.data.copy()

        # Auto-generate University ID for roles that require it
        if not data.get('university_id') and data.get('role') in ['STUDENT', 'FACULTY', 'STAFF', 'SECURITY']:
            data['university_id'] = generate_university_id(
                data.get('role'),
                data.get('department')
            )

        serializer = UserRegistrationSerializer(data=data)

        if serializer.is_valid():
            user = serializer.save()

            # ── Pending-approval gate ─────────────────────────────────────
            # Self-registration → never auto-active. Admin must approve.
            user.status = "PENDING"
            user.is_active = False
            user.save(update_fields=["status", "is_active"])

            # Confirmation email — "we got it, pending review". The full
            # welcome email (with university ID + sign-in CTA) goes out
            # later when an admin actually approves the account, since
            # only then is the CTA actionable.
            try:
                send_registration_received_email(user)
            except Exception as e:
                print(f"Registration-received email failed: {e}")

            # NOTE: deliberately no JWT issued here. The frontend reads
            # `requires_approval=True` and shows a "Pending approval" screen
            # rather than auto-logging in.
            return Response({
                'message': 'Registration received — pending admin approval.',
                'requires_approval': True,
                'user': {
                    'id': str(user.id),
                    'email': user.email,
                    'username': user.username,
                    'full_name': user.get_full_name(),
                    'role': user.role,
                    'university_id': user.university_id,  # Auto-generated!
                    'department': user.department,
                    'status': user.status,
                    'is_verified': user.is_verified,
                },
            }, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserLoginView(APIView):
    """
    API endpoint for user login
    Returns JWT token on successful authentication
    """
    permission_classes = [AllowAny]
    
    def post(self, request: Request) -> Response:
        email = request.data.get('email')
        ip_address = get_client_ip(request)
        
        # Check rate limiting (max 5 attempts per 15 minutes)
        if not check_rate_limit(email, ip_address):
            return Response({
                'error': 'Too many login attempts. Please try again later.'
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)
        
        serializer = UserLoginSerializer(data=request.data)
        
        try:
            if serializer.is_valid():
                user = serializer.validated_data['user']

                # ── Approval gate ────────────────────────────────────────
                # Block login for self-registered users still awaiting admin
                # approval, or those that have been rejected. We give the
                # frontend a stable error code so it can render the right
                # message ("waiting for review" vs "your account was denied").
                if user.status == "PENDING":
                    LoginAttempt.objects.create(
                        email=email or '',
                        ip_address=ip_address,
                        user_agent=get_user_agent(request),
                        success=False,
                        failure_reason='Account pending admin approval',
                    )
                    return Response({
                        'error': 'pending_approval',
                        'detail': 'Your account is pending administrator approval. '
                                  'You will receive an email once it has been reviewed.',
                    }, status=status.HTTP_403_FORBIDDEN)
                if user.status == "REJECTED":
                    LoginAttempt.objects.create(
                        email=email or '',
                        ip_address=ip_address,
                        user_agent=get_user_agent(request),
                        success=False,
                        failure_reason='Account registration was rejected',
                    )
                    return Response({
                        'error': 'rejected',
                        'detail': 'This account registration was rejected. '
                                  'Contact your administrator if you believe this is a mistake.',
                        'reason': user.rejection_reason or '',
                    }, status=status.HTTP_403_FORBIDDEN)

                # ── Role gate ────────────────────────────────────────────
                # The frontend sends `expected_role` from the role-themed login
                # page (e.g. /login/student sets expected_role='STUDENT'). If
                # the credentials authenticate to a different role we reject
                # with 403, so signing in with admin creds on the student
                # portal stops working. ADMIN/DIRECTOR/HR are treated as
                # equivalent (they all share the admin portal).
                expected_role = (request.data.get('expected_role') or '').upper().strip()
                if expected_role:
                    ADMIN_GROUP = {'ADMIN', 'DIRECTOR', 'HR'}
                    actual_role = (user.role or '').upper()
                    same_admin_group = expected_role in ADMIN_GROUP and actual_role in ADMIN_GROUP
                    if actual_role != expected_role and not same_admin_group:
                        LoginAttempt.objects.create(
                            email=email or '',
                            ip_address=ip_address,
                            user_agent=get_user_agent(request),
                            success=False,
                            failure_reason=f'Wrong portal: account role is {actual_role}, '
                                           f'tried to sign in via {expected_role} portal'
                        )
                        return Response({
                            'error': 'wrong_portal',
                            'detail': f'This account is a {actual_role}, '
                                      f'not a {expected_role}. Use the {actual_role} portal to sign in.',
                            'actual_role': actual_role,
                        }, status=status.HTTP_403_FORBIDDEN)

                # Update last login
                user.last_login = timezone.now()
                user.save(update_fields=['last_login'])

                # Generate JWT token
                token = generate_jwt_token(user)
                
                # Create new session
                session = UserSession.objects.create(
                    user=user,
                    token=token,
                    ip_address=ip_address,
                    device_info=get_user_agent(request),
                    expires_at=timezone.now() + timedelta(days=7)
                )
                
                # Log successful attempt
                LoginAttempt.objects.create(
                    email=email,
                    ip_address=ip_address,
                    user_agent=get_user_agent(request),
                    success=True
                )
                
                return Response({
                    'message': 'Login successful',
                    'user': UserDetailSerializer(user).data,
                    'token': token,
                    'session_id': str(session.id)
                }, status=status.HTTP_200_OK)
            
            # Log failed attempt
            LoginAttempt.objects.create(
                email=email or '',
                ip_address=ip_address,
                user_agent=get_user_agent(request),
                success=False,
                failure_reason='Invalid credentials'
            )
            
            return Response(serializer.errors, status=status.HTTP_401_UNAUTHORIZED)
        
        except Exception as e:
            return Response({
                'error': 'Login failed',
                'detail': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class UserLogoutView(APIView):
    """
    API endpoint for user logout
    Invalidates the current session
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request: Request) -> Response:
        try:
            # Get token from header
            auth_header = request.META.get('HTTP_AUTHORIZATION', '')
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]
                
                # Invalidate session
                UserSession.objects.filter(
                    user=request.user,
                    token=token,
                    is_active=True
                ).update(is_active=False)
            
            return Response({
                'message': 'Logout successful'
            }, status=status.HTTP_200_OK)
        
        except Exception as e:
            return Response({
                'error': 'Logout failed',
                'detail': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class UserProfileView(APIView):
    """
    Get or update user profile
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request: Request) -> Response:
        serializer = UserDetailSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    def put(self, request: Request) -> Response:
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        
        if serializer.is_valid():
            serializer.save()
            return Response({
                'message': 'Profile updated successfully',
                'user': serializer.data
            }, status=status.HTTP_200_OK)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def patch(self, request: Request) -> Response:
        """Support PATCH for partial updates"""
        return self.put(request)


class PasswordChangeView(APIView):
    """
    Change user password
    Requires current password for verification
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request: Request) -> Response:
        serializer = PasswordChangeSerializer(data=request.data)
        
        if serializer.is_valid():
            user = request.user
            
            # Verify old password
            if not user.check_password(serializer.validated_data['old_password']):
                return Response({
                    'error': 'Current password is incorrect'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Set new password
            user.set_password(serializer.validated_data['new_password'])
            user.save()
            
            # Keep user logged in
            update_session_auth_hash(request, user)
            
            # Get current token
            auth_header = request.META.get('HTTP_AUTHORIZATION', '')
            current_token = ''
            if auth_header.startswith('Bearer '):
                current_token = auth_header.split(' ')[1]
            
            # Invalidate all other sessions
            if current_token:
                UserSession.objects.filter(user=user).exclude(
                    token=current_token
                ).update(is_active=False)
            
            return Response({
                'message': 'Password changed successfully'
            }, status=status.HTTP_200_OK)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PasswordResetRequestView(APIView):
    """
    Request password reset
    Sends reset link to user's email
    """
    permission_classes = [AllowAny]
    
    def post(self, request: Request) -> Response:
        serializer = PasswordResetRequestSerializer(data=request.data)
        
        if serializer.is_valid():
            email = serializer.validated_data['email']
            
            try:
                user = User.objects.get(email=email)
                
                # Generate reset token
                token = secrets.token_urlsafe(32)
                
                # Create reset token record
                PasswordResetToken.objects.create(
                    user=user,
                    token=token,
                    expires_at=timezone.now() + timedelta(hours=1)
                )
                
                # Send reset email
                send_password_reset_email(user, token)
                
                return Response({
                    'message': 'Password reset link sent to your email'
                }, status=status.HTTP_200_OK)
            
            except User.DoesNotExist:
                # Don't reveal if email exists or not (security best practice)
                return Response({
                    'message': 'If an account exists with this email, you will receive a password reset link'
                }, status=status.HTTP_200_OK)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PasswordResetConfirmView(APIView):
    """
    Confirm password reset with token
    """
    permission_classes = [AllowAny]
    
    def post(self, request: Request) -> Response:
        serializer = PasswordResetConfirmSerializer(data=request.data)
        
        if serializer.is_valid():
            token = serializer.validated_data['token']
            
            try:
                reset_token = PasswordResetToken.objects.get(token=token)
                
                if not reset_token.is_valid():
                    return Response({
                        'error': 'Invalid or expired token'
                    }, status=status.HTTP_400_BAD_REQUEST)
                
                # Reset password
                user = reset_token.user
                user.set_password(serializer.validated_data['new_password'])
                user.save()
                
                # Mark token as used
                reset_token.is_used = True
                reset_token.save()
                
                # Invalidate all sessions
                UserSession.objects.filter(user=user).update(is_active=False)
                
                return Response({
                    'message': 'Password reset successful'
                }, status=status.HTTP_200_OK)
            
            except PasswordResetToken.DoesNotExist:
                return Response({
                    'error': 'Invalid token'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─── Admin user management: create, approve, reject ──────────────────────────

class AdminCreateUserView(APIView):
    """
    POST /api/auth/admin/users/

    Admin-initiated account creation. Unlike public registration, accounts
    created via this endpoint are auto-approved (status=ACTIVE, is_active=True),
    so admins can onboard users on the spot without going through the pending
    queue. Sets approved_by=request.user for audit trail.
    """
    permission_classes = [IsAuthenticated, IsAdmin | IsDirector]

    def post(self, request: Request) -> Response:
        data = request.data.copy()

        # Auto-generate University ID for roles that need one
        if not data.get('university_id') and data.get('role') in [
            'STUDENT', 'FACULTY', 'STAFF', 'SECURITY'
        ]:
            data['university_id'] = generate_university_id(
                data.get('role'),
                data.get('department'),
            )

        serializer = UserRegistrationSerializer(data=data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.save()
        # Admin-created accounts are pre-approved.
        user.status = "ACTIVE"
        user.is_active = True
        user.is_verified = True
        user.approved_by = request.user
        user.approved_at = timezone.now()
        user.save(update_fields=[
            "status", "is_active", "is_verified", "approved_by", "approved_at",
        ])

        try:
            send_welcome_email(user)
        except Exception as e:
            print(f"Welcome email failed for {user.email}: {e}")

        logger.info(
            "Admin %s created (and auto-approved) user %s — role=%s",
            request.user.email, user.email, user.role,
        )

        return Response(
            {
                'message': 'User created successfully.',
                'user': UserDetailSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


class PendingRegistrationsView(APIView):
    """
    GET /api/auth/admin/pending/

    List all accounts currently awaiting approval. The Admin UI's
    Pending Registrations page polls this and shows Approve / Reject
    buttons per row.
    """
    permission_classes = [IsAuthenticated, IsAdmin | IsDirector]

    def get(self, request: Request) -> Response:
        qs = User.objects.filter(status="PENDING").order_by('-created_at')
        return Response({
            'count': qs.count(),
            'pending': UserDetailSerializer(qs, many=True).data,
        })


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdmin | IsDirector])
def approve_registration(request: Request, user_id: str) -> Response:
    """
    POST /api/auth/admin/users/<id>/approve/

    Flips a PENDING account to ACTIVE so the user can log in.
    Idempotent — already-active accounts return 200 with a note.
    """
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    if user.status == "ACTIVE":
        return Response({
            'message': 'User is already active.',
            'user': UserDetailSerializer(user).data,
        })

    user.status = "ACTIVE"
    user.is_active = True
    user.is_verified = True
    user.approved_by = request.user
    user.approved_at = timezone.now()
    user.rejection_reason = ""  # clear any prior rejection notes
    user.save(update_fields=[
        "status", "is_active", "is_verified",
        "approved_by", "approved_at", "rejection_reason",
    ])

    # Now that the account is ACTIVE, the welcome email's "Sign in to portal"
    # CTA is finally actionable — send it. Best-effort: failures are logged
    # but don't block the approval response.
    try:
        send_welcome_email(user)
    except Exception as e:
        logger.warning("Welcome email failed for %s: %s", user.email, e)

    logger.info(
        "Admin %s APPROVED registration for %s (%s)",
        request.user.email, user.email, user.role,
    )

    return Response({
        'message': 'Registration approved.',
        'user': UserDetailSerializer(user).data,
    })


@api_view(['DELETE'])
@permission_classes([IsAuthenticated, IsAdmin | IsDirector])
def delete_pending_registration(request: Request, user_id: str) -> Response:
    """
    DELETE /api/auth/admin/users/<id>/delete-pending/

    Hard-delete a pending or rejected registration — for genuine spam /
    test accounts where keeping an audit row is pointless. Refuses to
    delete ACTIVE accounts (admin must explicitly suspend / reject those
    first), so this can never accidentally remove a real user.
    """
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    if user.status not in ('PENDING', 'REJECTED'):
        return Response(
            {'error': f'Refusing to hard-delete a {user.status} account. '
                      f'Reject the account first if you want it gone.'},
            status=status.HTTP_409_CONFLICT,
        )
    if user.role == 'ADMIN':
        return Response(
            {'error': 'Refusing to delete an ADMIN account via this endpoint.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    email = user.email
    user.delete()
    logger.info(
        "Admin %s HARD-DELETED pending/rejected user %s",
        request.user.email, email,
    )
    return Response({
        'message': f'User {email} permanently deleted.',
        'deleted_email': email,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdmin | IsDirector])
def reject_registration(request: Request, user_id: str) -> Response:
    """
    POST /api/auth/admin/users/<id>/reject/
    Body: { "reason": "optional explanation" }

    Marks a PENDING account as REJECTED — login stays blocked, and the
    account record is kept for audit (we don't hard-delete in case the
    user appeals or there's a mistake).
    """
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    if user.status not in ("PENDING", "ACTIVE"):
        return Response(
            {'error': f'Cannot reject account in status {user.status}.'},
            status=status.HTTP_409_CONFLICT,
        )

    reason = (request.data.get('reason') or '').strip()
    user.status = "REJECTED"
    user.is_active = False
    user.approved_by = request.user
    user.approved_at = timezone.now()
    user.rejection_reason = reason
    user.save(update_fields=[
        "status", "is_active", "approved_by", "approved_at", "rejection_reason",
    ])

    # Drop any active sessions so a previously-active user (now rejected)
    # gets kicked out immediately.
    UserSession.objects.filter(user=user, is_active=True).update(is_active=False)

    # Best-effort email so the user knows the outcome and (when the admin
    # supplied one) understands why. Don't block on send failures.
    try:
        send_rejection_email(user, reason=reason)
    except Exception as e:
        logger.warning("Rejection email failed for %s: %s", user.email, e)

    logger.info(
        "Admin %s REJECTED registration for %s — reason: %s",
        request.user.email, user.email, reason or '(no reason given)',
    )

    return Response({
        'message': 'Registration rejected.',
        'user': UserDetailSerializer(user).data,
    })


class UserListView(generics.ListAPIView):
    """
    List all users (Admin/Director only)
    Supports filtering by role, status, department
    """
    permission_classes = [IsAuthenticated, IsAdmin | IsDirector]
    serializer_class = UserSerializer
    
    def get_queryset(self):
        queryset = User.objects.all()

        role = self.request.query_params.get('role')
        if role:
            queryset = queryset.filter(role=role)

        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)

        department = self.request.query_params.get('department')
        if department:
            queryset = queryset.filter(department=department)

        # Exact-match filters used by the FastAPI scan-card lookup
        university_id = self.request.query_params.get('university_id')
        if university_id:
            queryset = queryset.filter(university_id=university_id)

        enrollment_number = self.request.query_params.get('enrollment_number')
        if enrollment_number:
            queryset = queryset.filter(enrollment_number=enrollment_number)

        # Free-text search across name + IDs
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                first_name__icontains=search
            ) | queryset.filter(
                last_name__icontains=search
            ) | queryset.filter(
                university_id__icontains=search
            ) | queryset.filter(
                enrollment_number__icontains=search
            )

        return queryset


class AdminUserDetailView(APIView):
    """
    Admin-only: read or update any user.

    PATCH supports a wide whitelist (see EDITABLE_FIELDS). The two specially-
    handled fields are:
        password         -- when present, set via set_password() so it gets hashed
        is_staff         -- intentionally NOT editable here (Django superuser flag,
                            granting it bypasses every permission check). Toggle
                            from the Django shell if needed.
    """
    permission_classes = [IsAuthenticated, IsAdmin | IsDirector]

    EDITABLE_FIELDS = {
        # Identity
        "first_name", "last_name", "email", "username", "phone_number", "cnic",
        # Role + status
        "role", "status", "department", "program", "semester", "designation",
        # Auto-generated ID can be overridden (e.g. typo fix or override default)
        "university_id",
        # Real campus card fields
        "enrollment_number", "campus", "card_serial_no",
        "card_issued_on", "card_valid_upto",
        # Account flags (NOT is_staff — too dangerous to expose in this endpoint)
        "is_active", "is_verified",
        # Emergency contact (per User model)
        "emergency_contact_name", "emergency_contact_phone",
    }

    # Fields that must be coerced to None when blank, otherwise the unique
    # constraint trips with two empty strings.
    NULLABLE_UNIQUE = {"enrollment_number", "university_id"}

    def get(self, request: Request, user_id: str) -> Response:
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(UserDetailSerializer(user).data)

    def patch(self, request: Request, user_id: str) -> Response:
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

        # ── Password handled separately so it gets hashed properly ────────
        new_password = request.data.get("password")
        if new_password:
            if len(new_password) < 8:
                return Response(
                    {"error": "Password must be at least 8 characters"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.set_password(new_password)
            # Don't include password in update_fields — set_password also
            # touches `last_login_attempt` etc. internally; save() handles all.
            user.save()
            # Invalidate any active sessions so the user is forced to log back in
            UserSession.objects.filter(user=user, is_active=True).update(is_active=False)
            logger.info("Admin %s reset password for %s", request.user.email, user.email)

        # ── Regular field whitelist filter ────────────────────────────────
        updates = {k: v for k, v in request.data.items() if k in self.EDITABLE_FIELDS}

        # Coerce blanks to None on unique-nullable fields to avoid duplicate-empty
        # collisions across the table.
        for nullable_unique in self.NULLABLE_UNIQUE:
            if nullable_unique in updates and updates[nullable_unique] in ("", None):
                updates[nullable_unique] = None

        # Coerce semester to int
        if "semester" in updates and updates["semester"] not in (None, ""):
            try:
                updates["semester"] = int(updates["semester"])
            except (TypeError, ValueError):
                return Response(
                    {"error": "Semester must be a number"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Coerce booleans (frontend may send "true"/"false" strings or JSON bools)
        for bool_field in ("is_active", "is_verified"):
            if bool_field in updates:
                v = updates[bool_field]
                if isinstance(v, str):
                    updates[bool_field] = v.lower() in ("true", "1", "yes", "on")

        # CNIC normalisation: strip dashes/spaces (matches registration logic)
        if "cnic" in updates and updates["cnic"]:
            updates["cnic"] = str(updates["cnic"]).replace("-", "").replace(" ", "")

        if not updates and not new_password:
            return Response(
                {"error": "No editable fields provided",
                 "editable_fields": sorted(self.EDITABLE_FIELDS) + ["password"]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for field, value in updates.items():
            setattr(user, field, value)

        try:
            user.full_clean(exclude=["password"])  # run model-level validators
            if updates:
                user.save(update_fields=list(updates.keys()))
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        if updates:
            logger.info(
                "Admin %s updated user %s — fields: %s",
                request.user.email, user.email, list(updates.keys()),
            )
        return Response(UserDetailSerializer(user).data)

    def delete(self, request: Request, user_id: str) -> Response:
        """
        DELETE /api/auth/users/<id>/  — admin hard-deletes a user account.

        Cascades to FaceEnrollment, GateEntry, UserSession, DeviceToken etc.
        via the FK on_delete rules in models.py — so this is destructive and
        guarded by three checks:

          1. Refuses self-delete (admin can't lock themselves out by accident)
          2. Refuses to delete ADMIN-role accounts (any cleanup of those needs
             a deliberate path — superuser shell or a role-downgrade first)
          3. Active sessions are revoked alongside the row, so a deleted user
             with a live JWT can't keep using it

        Use the dedicated `delete_pending_registration` endpoint for spam
        cleanup of PENDING/REJECTED — it has narrower checks and is safer
        to expose as a quick-action button.
        """
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

        if user.id == request.user.id:
            return Response(
                {"error": "You can't delete your own account from the admin panel."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.role == "ADMIN":
            return Response(
                {"error": "Refusing to delete an ADMIN account. Change the role first, "
                          "or use the Django shell for ADMIN cleanup."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Snapshot for the audit log before the row is gone
        email = user.email
        full_name = user.get_full_name()
        role = user.role
        # Sessions cascade via FK, but invalidate explicitly so any cached
        # token check across services sees them as inactive immediately.
        UserSession.objects.filter(user=user).update(is_active=False)
        user.delete()

        logger.info(
            "Admin %s HARD-DELETED user %s (%s, role=%s)",
            request.user.email, full_name, email, role,
        )
        return Response({
            "message": f"User {full_name or email} permanently deleted.",
            "deleted_email": email,
        })


class UserSessionListView(APIView):
    """
    List all active sessions for current user
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request: Request) -> Response:
        sessions = UserSession.objects.filter(
            user=request.user,
            is_active=True
        ).order_by('-created_at')
        
        return Response({
            'sessions': [{
                'id': str(session.id),
                'device_info': session.device_info,
                'ip_address': session.ip_address,
                'created_at': session.created_at,
                'last_activity': session.last_activity
            } for session in sessions]
        }, status=status.HTTP_200_OK)
    
    def delete(self, request: Request, session_id: str) -> Response:
        """Revoke a specific session"""
        try:
            session = UserSession.objects.get(
                id=session_id,
                user=request.user,
                is_active=True
            )
            session.is_active = False
            session.save()
            
            return Response({
                'message': 'Session revoked successfully'
            }, status=status.HTTP_200_OK)
        
        except UserSession.DoesNotExist:
            return Response({
                'error': 'Session not found'
            }, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def verify_token(request: Request) -> Response:
    """
    Verify if JWT token is valid
    """
    return Response({
        'valid': True,
        'user': UserSerializer(request.user).data
    }, status=status.HTTP_200_OK)


# ─── Attendance ────────────────────────────────────────────────────────────────

class AttendanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        from .models import GateEntry
        entries = GateEntry.objects.filter(user=request.user).order_by('-timestamp')
        # Group by date
        from collections import defaultdict
        days: dict = defaultdict(list)
        for e in entries:
            day = e.timestamp.date().isoformat()
            days[day].append({'time': e.timestamp.strftime('%H:%M'), 'type': e.entry_type, 'method': e.method})

        result = []
        for day, logs in sorted(days.items(), reverse=True):
            entry_times = [l for l in logs if l['type'] == 'ENTRY']
            if entry_times:
                status_val = 'LATE' if entry_times[0]['time'] > '09:00' else 'PRESENT'
            else:
                status_val = 'ABSENT'
            result.append({'date': day, 'status': status_val, 'entries': logs})

        return Response(result)


# ─── Gate Entry ────────────────────────────────────────────────────────────────

class GateEntryView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        from .models import GateEntry
        user_id = request.data.get('user_id')
        entry_type = request.data.get('type', 'ENTRY')
        method = request.data.get('method', 'BIOMETRIC')

        try:
            target_user = User.objects.get(id=user_id) if user_id else request.user
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        entry = GateEntry.objects.create(
            user=target_user,
            entry_type=entry_type,
            method=method,
            logged_by=request.user,
            ip_address=get_client_ip(request),
        )

        # ── Snapshot persistence ───────────────────────────────────────
        # Frontend sends face_snapshot and/or card_snapshot as base64 data
        # URLs (`data:image/jpeg;base64,...`). We decode and attach them
        # to the GateEntry so admins can review who actually came through
        # the gate later. The 30-day TTL is enforced by the
        # `delete_old_snapshots` management command.
        face_b64 = request.data.get('face_snapshot')
        card_b64 = request.data.get('card_snapshot')
        try:
            if face_b64:
                f = _decode_data_url(face_b64, f'gate-{entry.id}-face.jpg')
                if f:
                    entry.face_snapshot.save(f.name, f, save=False)
            if card_b64:
                f = _decode_data_url(card_b64, f'gate-{entry.id}-card.jpg')
                if f:
                    entry.card_snapshot.save(f.name, f, save=False)
            if face_b64 or card_b64:
                entry.save(update_fields=['face_snapshot', 'card_snapshot'])
        except Exception as e:
            logger.warning("Could not save snapshot for entry %s: %s", entry.id, e)

        # ── Parent SMS & FCM notifications ────────────────────────────────
        # Fires only for students. Best-effort: failures are logged and
        # never block the gate-entry response. In dev mode this writes to console.
        sms_count = 0
        fcm_count = 0
        if target_user.role == 'STUDENT':
            try:
                from .notifications import send_visit_sms
                sms_count = send_visit_sms(
                    student=target_user,
                    entry_type=entry_type,
                    method=method,
                    when=entry.timestamp,
                )
            except Exception as e:
                logger.warning("Parent SMS dispatch failed for entry %s: %s",
                               entry.id, e)

            try:
                from .notifications_fcm import send_gate_entry_notification
                fcm_count = send_gate_entry_notification(
                    user=target_user,
                    entry_type=entry_type,
                    method=method,
                    when=entry.timestamp,
                )
            except Exception as e:
                logger.warning("Parent FCM dispatch failed for entry %s: %s",
                               entry.id, e)

        # ── Admin/Security dashboard notification ───────────────────────
        # Notify security staff and admins via FCM
        try:
            from .notifications_fcm import send_gate_entry_notification
            send_gate_entry_notification(
                user=target_user,
                entry_type=entry_type,
                method=method,
                when=entry.timestamp,
            )
        except Exception as e:
            logger.warning("Admin FCM dispatch failed for entry %s: %s",
                           entry.id, e)

        return Response({
            'id': str(entry.id),
            'user': UserSerializer(target_user).data,
            'type': entry_type,
            'method': method,
            'timestamp': entry.timestamp.isoformat(),
            'parents_notified_sms': sms_count,
            'parents_notified_fcm': fcm_count,
        }, status=status.HTTP_201_CREATED)

    def get(self, request: Request) -> Response:
        from .models import GateEntry
        entries = GateEntry.objects.select_related('user').order_by('-timestamp')[:100]

        def abs_url(field):
            # ImageField is falsy when empty; .url raises if no file. Wrap so
            # rows without a saved snapshot just return None rather than 500.
            if not field:
                return None
            try:
                return request.build_absolute_uri(field.url)
            except Exception:
                return None

        data = [{
            'id': str(e.id),
            'name': e.user.get_full_name(),
            'role': e.user.role,
            'university_id': e.user.university_id,
            'time': e.timestamp.strftime('%H:%M'),
            'type': e.entry_type,
            'method': e.method,
            'status': 'GRANTED',
            'face_snapshot_url': abs_url(e.face_snapshot),
            'card_snapshot_url': abs_url(e.card_snapshot),
        } for e in entries]
        return Response(data)


# ─── Student Activity (for parent portal) ─────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def student_activity(request: Request, student_id: str) -> Response:
    from .models import GateEntry, ParentStudentRelation
    # Verify parent has access to this student
    if request.user.role == 'PARENT':
        if not ParentStudentRelation.objects.filter(parent=request.user, student_id=student_id).exists():
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    from .models import GateEntry
    entries = GateEntry.objects.filter(user_id=student_id).order_by('-timestamp')[:20]
    data = [{
        'id': str(e.id),
        'timestamp': e.timestamp.isoformat(),
        'type': e.entry_type,
        'description': f"{'Entered' if e.entry_type == 'ENTRY' else 'Exited'} campus via Gate 1",
        'method': e.method,
    } for e in entries]
    return Response(data)


# ─── User face-encoding patch (internal — called by face detection service) ───

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_face_encoding(request: Request, user_id: str) -> Response:
    try:
        target = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
    blob = request.data.get('face_encoding')
    if blob:
        target.face_encoding = blob
        target.save(update_fields=['face_encoding'])
    return Response({'status': 'updated'})


# ─── Face encodings bulk list (internal — for face service sync) ──────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def face_encodings_list(request: Request) -> Response:
    users = User.objects.exclude(face_encoding=None).values('id', 'face_encoding', 'status')
    data = [{'id': str(u['id']), 'face_encoding': u['face_encoding'].hex(), 'status': u['status']} for u in users]
    return Response(data)


# ─── Face Enrollment (Admin only) ─────────────────────────────────────────────
# Production-grade enrollment flow:
#   1. Admin uploads 5 frames → POST /users/<id>/face-enrollments/
#   2. Django proxies frames to FastAPI face service for embedding extraction +
#      liveness check + quality grading
#   3. Resulting embedding is stored as new FaceEnrollment row (history kept)
#   4. Per audit policy, existing active rows are NOT auto-deactivated —
#      admin must explicitly DELETE them first (returns 409 if any exist)

import base64
import logging
import requests as http_requests
from django.conf import settings

logger = logging.getLogger(__name__)

# FastAPI face service URL (configurable via env var)
FACE_SERVICE_URL = getattr(settings, "FACE_SERVICE_URL", "http://127.0.0.1:5000")
INTERNAL_SERVICE_TOKEN = getattr(settings, "INTERNAL_SERVICE_TOKEN", "")


def _push_enrollment_to_fastapi(enrollment: FaceEnrollment) -> None:
    """
    After Django creates a new enrollment, tell FastAPI to add it to the
    in-memory match cache so the gate camera can recognise the user immediately.
    Best-effort — failures are logged but don't fail the enrollment itself
    (cache will be lazily reloaded on the next /verify call).
    """
    try:
        http_requests.post(
            f"{FACE_SERVICE_URL}/api/face/sync-add/",
            json={
                "enrollment_id": str(enrollment.id),
                "user_id": str(enrollment.user.id),
                "university_id": enrollment.user.university_id or "",
                "full_name": enrollment.user.get_full_name(),
                "role": enrollment.user.role,
                "embedding": enrollment.embedding.hex(),
            },
            headers={"X-Internal-Token": INTERNAL_SERVICE_TOKEN},
            timeout=5,
        )
    except Exception as e:
        logger.warning("Could not push enrollment %s to FastAPI cache: %s", enrollment.id, e)


def _push_deactivation_to_fastapi(enrollment_id: str) -> None:
    """Inverse of _push_enrollment_to_fastapi — drop the entry from the gate cache."""
    try:
        http_requests.post(
            f"{FACE_SERVICE_URL}/api/face/sync-remove/",
            json={"enrollment_id": str(enrollment_id)},
            headers={"X-Internal-Token": INTERNAL_SERVICE_TOKEN},
            timeout=5,
        )
    except Exception as e:
        logger.warning("Could not push deactivation %s to FastAPI cache: %s", enrollment_id, e)


class FaceEnrollmentListCreateView(APIView):
    """
    GET  → list enrollments for a user (active + history).
    POST → create new enrollment (errors 409 if active enrollment already exists).
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request: Request, user_id: str) -> Response:
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        include_inactive = request.query_params.get('include_inactive', 'true').lower() == 'true'
        qs = FaceEnrollment.objects.filter(user=user)
        if not include_inactive:
            qs = qs.filter(is_active=True)
        return Response(FaceEnrollmentSerializer(qs, many=True).data)

    def post(self, request: Request, user_id: str) -> Response:
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        # Audit policy: refuse if active enrollment exists — admin must explicitly remove first
        if FaceEnrollment.objects.filter(user=user, is_active=True).exists():
            return Response(
                {
                    'error': 'User already has an active face enrollment.',
                    'detail': 'Deactivate the existing enrollment before creating a new one.',
                    'code': 'ACTIVE_ENROLLMENT_EXISTS',
                },
                status=status.HTTP_409_CONFLICT,
            )

        serializer = FaceEnrollmentRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        frames = serializer.validated_data['frames']
        notes = serializer.validated_data.get('notes', '')

        # Proxy to FastAPI face service for enrollment processing
        try:
            face_response = http_requests.post(
                f"{FACE_SERVICE_URL}/api/face/enroll/",
                json={'user_id': str(user.id), 'frames': frames},
                timeout=60,
            )
        except http_requests.exceptions.ConnectionError:
            return Response(
                {'error': 'Face recognition service is offline.',
                 'detail': f'Cannot reach FastAPI service at {FACE_SERVICE_URL}.',
                 'code': 'FACE_SERVICE_UNAVAILABLE'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except http_requests.exceptions.Timeout:
            return Response(
                {'error': 'Face enrollment timed out.', 'code': 'FACE_SERVICE_TIMEOUT'},
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )

        if face_response.status_code != 200:
            try:
                payload = face_response.json()
            except ValueError:
                payload = {'detail': face_response.text}
            return Response(payload, status=face_response.status_code)

        result = face_response.json()
        # Expected fields: embedding (hex str), frame_embeddings (list of hex),
        # quality_score, quality_grade, liveness_passed, frame_count
        try:
            embedding_bytes = bytes.fromhex(result['embedding'])
        except (KeyError, ValueError):
            return Response(
                {'error': 'Face service returned malformed embedding'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        enrollment = FaceEnrollment.objects.create(
            user=user,
            embedding=embedding_bytes,
            frame_embeddings=result.get('frame_embeddings', []),
            frame_count=result.get('frame_count', len(frames)),
            quality_score=float(result.get('quality_score', 0.0)),
            quality_grade=result.get('quality_grade', 'GOOD'),
            liveness_passed=bool(result.get('liveness_passed', False)),
            enrolled_by=request.user,
            enrollment_ip=get_client_ip(request),
            notes=notes,
        )

        logger.info(
            "Face enrolled for user %s by admin %s — quality=%s liveness=%s",
            user.email, request.user.email,
            enrollment.quality_grade, enrollment.liveness_passed,
        )

        # Push the new embedding to the FastAPI gate cache so the user can be
        # recognised immediately, no FastAPI restart required.
        _push_enrollment_to_fastapi(enrollment)

        return Response(
            FaceEnrollmentSerializer(enrollment).data,
            status=status.HTTP_201_CREATED,
        )


class FaceEnrollmentDetailView(APIView):
    """
    GET    → enrollment details
    DELETE → soft-delete (deactivate) with audit reason
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request: Request, enrollment_id: str) -> Response:
        try:
            enrollment = FaceEnrollment.objects.get(id=enrollment_id)
        except FaceEnrollment.DoesNotExist:
            return Response({'error': 'Enrollment not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(FaceEnrollmentSerializer(enrollment).data)

    def delete(self, request: Request, enrollment_id: str) -> Response:
        try:
            enrollment = FaceEnrollment.objects.get(id=enrollment_id)
        except FaceEnrollment.DoesNotExist:
            return Response({'error': 'Enrollment not found'}, status=status.HTTP_404_NOT_FOUND)

        if not enrollment.is_active:
            return Response(
                {'error': 'Enrollment is already inactive.'},
                status=status.HTTP_409_CONFLICT,
            )

        serializer = FaceEnrollmentDeactivateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        reason = serializer.validated_data['reason']
        notes = serializer.validated_data.get('notes', '')

        enrollment.deactivate(reason=reason, by_user=request.user)
        if notes:
            enrollment.notes = (enrollment.notes + "\n" if enrollment.notes else "") + \
                               f"[deactivation note by {request.user.email}]: {notes}"
            enrollment.save(update_fields=['notes'])

        logger.info(
            "Face enrollment %s deactivated by %s — reason=%s",
            enrollment.id, request.user.email, reason,
        )

        # Remove from FastAPI gate cache so the user can no longer be recognised.
        _push_deactivation_to_fastapi(enrollment.id)

        return Response(FaceEnrollmentSerializer(enrollment).data)


@api_view(['GET'])
@permission_classes([AllowAny])  # Internal-token auth handled inline (see below)
def active_enrollments_bulk(request: Request) -> Response:
    """
    Internal endpoint — called by FastAPI face engine on startup.
    Returns ALL active enrollments across all users in one payload.
    Embeddings as hex strings for JSON safety.

    Auth: either a valid user JWT (admin) OR the X-Internal-Token header
    matching settings.INTERNAL_SERVICE_TOKEN. The FastAPI service uses the
    latter — it has no user identity but is trusted as a service.
    """
    # Check internal service token first
    token = request.META.get("HTTP_X_INTERNAL_TOKEN")
    is_internal = bool(token and INTERNAL_SERVICE_TOKEN and token == INTERNAL_SERVICE_TOKEN)
    if not is_internal:
        # Fall back to user JWT — must be authenticated admin
        if not (request.user and request.user.is_authenticated and request.user.role == "ADMIN"):
            return Response(
                {"error": "Authentication required (JWT or X-Internal-Token)"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
    enrollments = FaceEnrollment.objects.filter(
        is_active=True,
        user__status="ACTIVE",
        user__is_active=True,
    ).select_related('user')

    data = [{
        'enrollment_id': str(e.id),
        'user_id': str(e.user.id),
        'university_id': e.user.university_id,
        'full_name': e.user.get_full_name(),
        'role': e.user.role,
        'embedding': e.embedding.hex() if e.embedding else None,
    } for e in enrollments]

    return Response({'count': len(data), 'enrollments': data})


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdmin | IsDirector])
def admin_test_sms(request: Request) -> Response:
    """
    POST /api/auth/admin/test-sms/   {"to": "+923001234567", "body": "..."}

    Sends a test SMS so admins can verify Twilio credentials are correctly
    configured before relying on the live parent-alert flow. Falls back to
    dev-mode when creds aren't set, returning what would have been sent.
    """
    from .notifications import send_test_sms
    to = (request.data.get('to') or '').strip()
    body = request.data.get('body')
    result = send_test_sms(to=to, body=body)

    # Convey Twilio config status so the UI can display it
    result['twilio_configured'] = bool(
        settings.TWILIO_ACCOUNT_SID
        and settings.TWILIO_AUTH_TOKEN
        and settings.TWILIO_FROM_NUMBER
    )
    http_status = status.HTTP_200_OK if result.get('ok') else status.HTTP_400_BAD_REQUEST
    return Response(result, status=http_status)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdmin | IsDirector])
def admin_logs(request: Request) -> Response:
    """
    Aggregated audit log for the admin /admin/logs page.

    Combines four streams into one chronologically-sorted list:
        - login_attempts (success + failure)
        - gate_entries (face / card / manual scans)
        - face_enrollments (created + deactivated)
        - sessions (created)

    Each entry has a uniform shape:
        { id, kind, timestamp, severity, title, detail, actor, target, meta }

    Query params:
        ?kind=login,gate          comma-separated filter (default: all)
        ?severity=error           ok / warn / error
        ?since=2026-04-01         ISO date — only entries after this point
        ?limit=200                default 200, max 1000
    """
    from .models import GateEntry  # local import to avoid circular load order

    # ── Parse filters ─────────────────────────────────────────────────
    kinds_raw = request.query_params.get('kind', '')
    kinds = {k.strip().lower() for k in kinds_raw.split(',') if k.strip()}
    severity_filter = request.query_params.get('severity', '').lower().strip() or None
    since = request.query_params.get('since', '').strip() or None
    try:
        limit = min(int(request.query_params.get('limit', 200)), 1000)
    except (TypeError, ValueError):
        limit = 200

    since_dt = None
    if since:
        try:
            since_dt = timezone.datetime.fromisoformat(since)
            if timezone.is_naive(since_dt):
                since_dt = timezone.make_aware(since_dt)
        except Exception:
            pass

    def passes_kind(k):
        return not kinds or k in kinds

    entries = []

    # ── Login attempts ────────────────────────────────────────────────
    if passes_kind('login'):
        qs = LoginAttempt.objects.all().order_by('-timestamp')[:limit]
        if since_dt:
            qs = qs.filter(timestamp__gte=since_dt)
        for la in qs:
            entries.append({
                'id':        f"login-{la.id}",
                'kind':      'login',
                'timestamp': la.timestamp.isoformat(),
                'severity':  'ok' if la.success else 'error',
                'title':     'Login successful' if la.success else 'Login failed',
                'detail':    la.failure_reason or '',
                'actor':     la.email or '(unknown)',
                'target':    None,
                'meta': {
                    'ip_address': la.ip_address,
                    'user_agent': (la.user_agent or '')[:120],
                },
            })

    # ── Gate entries ──────────────────────────────────────────────────
    if passes_kind('gate'):
        qs = GateEntry.objects.select_related('user', 'logged_by').order_by('-timestamp')[:limit]
        if since_dt:
            qs = qs.filter(timestamp__gte=since_dt)
        for ge in qs:
            entries.append({
                'id':        f"gate-{ge.id}",
                'kind':      'gate',
                'timestamp': ge.timestamp.isoformat(),
                'severity':  'ok',
                'title':     f"Gate {ge.entry_type.lower()} via {ge.method}",
                'detail':    ge.notes or '',
                'actor':     ge.user.get_full_name() if ge.user else '(unknown)',
                'target':    None,
                'meta': {
                    'method':         ge.method,
                    'entry_type':     ge.entry_type,
                    'university_id':  ge.user.university_id if ge.user else None,
                    'enrollment':     ge.user.enrollment_number if ge.user else None,
                    'role':           ge.user.role if ge.user else None,
                    'logged_by':      ge.logged_by.get_full_name() if ge.logged_by else None,
                    'ip_address':     ge.ip_address,
                },
            })

    # ── Face enrollments (created + deactivated) ──────────────────────
    if passes_kind('enrollment'):
        qs = FaceEnrollment.objects.select_related('user', 'enrolled_by', 'deactivated_by').order_by('-enrolled_at')[:limit]
        if since_dt:
            qs = qs.filter(enrolled_at__gte=since_dt)
        for fe in qs:
            entries.append({
                'id':        f"enroll-{fe.id}",
                'kind':      'enrollment',
                'timestamp': fe.enrolled_at.isoformat(),
                'severity':  'warn' if not fe.liveness_passed else 'ok',
                'title':     f"Face enrolled ({fe.quality_grade})",
                'detail':    fe.notes or '',
                'actor':     fe.enrolled_by.get_full_name() if fe.enrolled_by else '(system)',
                'target':    fe.user.get_full_name(),
                'meta': {
                    'quality_score':   fe.quality_score,
                    'frame_count':     fe.frame_count,
                    'liveness_passed': fe.liveness_passed,
                    'is_active':       fe.is_active,
                    'university_id':   fe.user.university_id,
                },
            })
            # If deactivated, emit a second entry for the deactivation event
            if not fe.is_active and fe.deactivated_at:
                if since_dt and fe.deactivated_at < since_dt:
                    continue
                entries.append({
                    'id':        f"enroll-deactivate-{fe.id}",
                    'kind':      'enrollment',
                    'timestamp': fe.deactivated_at.isoformat(),
                    'severity':  'warn',
                    'title':     f"Face enrollment removed ({fe.deactivation_reason or 'no reason'})",
                    'detail':    '',
                    'actor':     fe.deactivated_by.get_full_name() if fe.deactivated_by else '(system)',
                    'target':    fe.user.get_full_name(),
                    'meta':      {'reason': fe.deactivation_reason},
                })

    # ── Sessions (created) ────────────────────────────────────────────
    if passes_kind('session'):
        qs = UserSession.objects.select_related('user').order_by('-created_at')[:limit]
        if since_dt:
            qs = qs.filter(created_at__gte=since_dt)
        for s in qs:
            entries.append({
                'id':        f"session-{s.id}",
                'kind':      'session',
                'timestamp': s.created_at.isoformat(),
                'severity':  'ok' if s.is_active else 'warn',
                'title':     'Session opened' if s.is_active else 'Session ended',
                'detail':    '',
                'actor':     s.user.get_full_name() if s.user else '(unknown)',
                'target':    None,
                'meta': {
                    'ip_address':  s.ip_address,
                    'device_info': (s.device_info or '')[:120],
                    'expires_at':  s.expires_at.isoformat() if s.expires_at else None,
                    'is_active':   s.is_active,
                },
            })

    # Apply severity filter and final ordering
    if severity_filter:
        entries = [e for e in entries if e['severity'] == severity_filter]
    entries.sort(key=lambda e: e['timestamp'], reverse=True)
    entries = entries[:limit]

    # Aggregate counts for the page header
    counts = {
        'total':       len(entries),
        'ok':          sum(1 for e in entries if e['severity'] == 'ok'),
        'warn':        sum(1 for e in entries if e['severity'] == 'warn'),
        'error':       sum(1 for e in entries if e['severity'] == 'error'),
        'login':       sum(1 for e in entries if e['kind'] == 'login'),
        'gate':        sum(1 for e in entries if e['kind'] == 'gate'),
        'enrollment':  sum(1 for e in entries if e['kind'] == 'enrollment'),
        'session':     sum(1 for e in entries if e['kind'] == 'session'),
    }

    return Response({'entries': entries, 'counts': counts})


# ─── Visitor management ──────────────────────────────────────────────────────

class VisitorListCreateView(APIView):
    """
    GET  /api/auth/visitors/   list visitor records (filterable)
    POST /api/auth/visitors/   register a new visitor at the gate

    Both endpoints are restricted to security and admin roles. Visitors
    themselves don't sign in to the system; they're tracked entirely by
    security registering them at the gate via CNIC OCR.
    """
    permission_classes = [IsAuthenticated, IsSecurityOrAdmin | IsAdmin | IsDirector]

    def get(self, request: Request) -> Response:
        qs = Visitor.objects.select_related('host_user', 'logged_by').all()

        # Filter by status
        status_param = request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param.upper())

        # Filter by today only
        if request.query_params.get('today') == 'true':
            today = timezone.now().date()
            qs = qs.filter(entry_time__date=today)

        # Free-text search across name, CNIC, host name
        search = request.query_params.get('search', '').strip()
        if search:
            from django.db.models import Q
            cnic_clean = search.replace('-', '').replace(' ', '')
            qs = qs.filter(
                Q(full_name__icontains=search)
                | Q(cnic__icontains=cnic_clean)
                | Q(phone_number__icontains=search)
                | Q(host_user__first_name__icontains=search)
                | Q(host_user__last_name__icontains=search)
                | Q(purpose__icontains=search)
            )

        try:
            limit = min(int(request.query_params.get('limit', 100)), 500)
        except (TypeError, ValueError):
            limit = 100

        qs = qs.order_by('-entry_time')[:limit]
        return Response(
            VisitorSerializer(qs, many=True, context={'request': request}).data
        )

    def post(self, request: Request) -> Response:
        # Photo arrives as a base64 data URL (browser canvas snapshot).
        # The serializer expects an actual ImageField upload, so we strip the
        # photo from the validated payload and decode it ourselves after the
        # row is saved. Same pattern as GateEntryView.post.
        photo_b64 = request.data.get('photo')
        payload = {k: v for k, v in request.data.items() if k != 'photo'}

        serializer = VisitorCreateSerializer(data=payload)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        visitor = serializer.save(
            logged_by=request.user,
            ip_address=get_client_ip(request),
        )

        if photo_b64:
            try:
                f = _decode_data_url(photo_b64, f'visitor-{visitor.id}.jpg')
                if f:
                    visitor.photo.save(f.name, f, save=True)
            except Exception as e:
                logger.warning(
                    "Could not save visitor photo for %s: %s", visitor.id, e
                )

        logger.info(
            "Visitor registered: %s (CNIC %s) by %s, host=%s",
            visitor.full_name, visitor.cnic, request.user.email,
            visitor.host_user.email if visitor.host_user else 'none',
        )
        return Response(
            VisitorSerializer(visitor, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class VisitorDetailView(APIView):
    """
    GET    /api/auth/visitors/<id>/         single visitor details
    PATCH  /api/auth/visitors/<id>/         edit notes / purpose / host
    POST   /api/auth/visitors/<id>/exit/    record exit (preferred over PATCH)
    """
    permission_classes = [IsAuthenticated, IsSecurityOrAdmin | IsAdmin | IsDirector]

    def get(self, request: Request, visitor_id: str) -> Response:
        try:
            v = Visitor.objects.select_related('host_user', 'logged_by').get(id=visitor_id)
        except Visitor.DoesNotExist:
            return Response({'error': 'Visitor not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(VisitorSerializer(v).data)

    def patch(self, request: Request, visitor_id: str) -> Response:
        try:
            v = Visitor.objects.get(id=visitor_id)
        except Visitor.DoesNotExist:
            return Response({'error': 'Visitor not found'}, status=status.HTTP_404_NOT_FOUND)

        editable = {'full_name', 'phone_number', 'purpose', 'host_user',
                    'host_department', 'notes', 'status'}
        for k, val in request.data.items():
            if k in editable:
                setattr(v, k, val)
        v.save()
        return Response(VisitorSerializer(v).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsSecurityOrAdmin | IsAdmin | IsDirector])
def visitor_check_out(request: Request, visitor_id: str) -> Response:
    """Record that this visitor has left campus."""
    try:
        v = Visitor.objects.get(id=visitor_id)
    except Visitor.DoesNotExist:
        return Response({'error': 'Visitor not found'}, status=status.HTTP_404_NOT_FOUND)

    if v.status == 'CHECKED_OUT':
        return Response({'error': 'Already checked out',
                         'exit_time': v.exit_time.isoformat() if v.exit_time else None},
                        status=status.HTTP_409_CONFLICT)

    v.check_out(by_user=request.user)
    logger.info("Visitor %s (CNIC %s) checked out by %s",
                v.full_name, v.cnic, request.user.email)
    return Response(VisitorSerializer(v).data)


@api_view(['GET'])
@permission_classes([AllowAny])  # Internal-token auth handled inline
def lookup_user_by_card(request: Request) -> Response:
    """
    Internal endpoint used by the FastAPI face engine after card OCR.

    Looks up a user by either `enrollment_number` (the printed card ID like
    "03-134222-110") or the legacy auto-generated `university_id`. Returns
    the same shape as `UserSerializer`.

    Auth: X-Internal-Token header matching settings.INTERNAL_SERVICE_TOKEN,
    OR a valid admin user JWT.
    """
    token = request.META.get("HTTP_X_INTERNAL_TOKEN")
    is_internal = bool(token and INTERNAL_SERVICE_TOKEN and token == INTERNAL_SERVICE_TOKEN)
    if not is_internal:
        if not (request.user and request.user.is_authenticated and request.user.role == "ADMIN"):
            return Response(
                {"error": "Authentication required (JWT or X-Internal-Token)"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

    enrollment_number = request.query_params.get("enrollment_number")
    university_id     = request.query_params.get("university_id")

    qs = User.objects.all()
    if enrollment_number:
        qs = qs.filter(enrollment_number=enrollment_number)
    elif university_id:
        qs = qs.filter(university_id=university_id)
    else:
        return Response(
            {"error": "Provide enrollment_number or university_id query param"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = qs.first()
    if not user:
        return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

    return Response(UserSerializer(user).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def record_enrollment_match(request: Request, enrollment_id: str) -> Response:
    """
    Internal endpoint — called by FastAPI when a gate match is made against
    a specific enrollment. Updates last_matched_at + match_count.
    """
    try:
        enrollment = FaceEnrollment.objects.get(id=enrollment_id, is_active=True)
    except FaceEnrollment.DoesNotExist:
        return Response({'error': 'Active enrollment not found'}, status=status.HTTP_404_NOT_FOUND)
    enrollment.record_match()
    return Response({
        'enrollment_id': str(enrollment.id),
        'match_count': enrollment.match_count,
        'last_matched_at': enrollment.last_matched_at.isoformat(),
    })


# ─── Firebase Cloud Messaging (Phase 6) ───────────────────────────────────────

class DeviceTokenView(APIView):
    """
    Device token management for Firebase Cloud Messaging.

    POST /api/auth/device-token/
        Register a new device token (called by React on login)
        Body: { "token": "...", "device_name": "Chrome on Windows" }
        Returns the token record + status

    GET /api/auth/device-tokens/
        List all active tokens for the authenticated user

    DELETE /api/auth/device-token/{token_id}/
        Deactivate a token (e.g., on logout)
    """
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        """Register a new device token."""
        token = (request.data.get('token') or '').strip()
        device_name = (request.data.get('device_name') or '').strip()

        if not token:
            return Response(
                {'error': 'Device token is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .models import DeviceToken

        # Check if this token already exists for this user (idempotent)
        try:
            device = DeviceToken.objects.get(token=token, user=request.user)
            if not device.is_active:
                # Re-activate a previously deactivated token
                device.is_active = True
                device.deactivated_at = None
                device.save(update_fields=['is_active', 'deactivated_at'])
            return Response({
                'id': str(device.id),
                'token': device.token[:20] + '...',  # Don't echo full token
                'device_name': device.device_name,
                'is_active': device.is_active,
                'registered_at': device.registered_at.isoformat(),
                'message': 'Token re-activated',
            })
        except DeviceToken.DoesNotExist:
            pass

        # Create a new token record
        try:
            device = DeviceToken.objects.create(
                user=request.user,
                token=token,
                device_name=device_name,
                ip_address=get_client_ip(request),
                user_agent=get_user_agent(request),
            )
            return Response({
                'id': str(device.id),
                'token': token[:20] + '...',
                'device_name': device.device_name,
                'is_active': device.is_active,
                'registered_at': device.registered_at.isoformat(),
                'message': 'Device token registered',
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response(
                {'error': f'Failed to register token: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def get(self, request: Request) -> Response:
        """List all active device tokens for the user."""
        from .models import DeviceToken

        tokens = DeviceToken.objects.filter(user=request.user, is_active=True)
        data = [{
            'id': str(t.id),
            'device_name': t.device_name,
            'registered_at': t.registered_at.isoformat(),
            'last_used': t.last_used.isoformat(),
        } for t in tokens]
        return Response({
            'count': len(data),
            'devices': data,
        })

    def delete(self, request: Request, token_id: str) -> Response:
        """Deactivate a device token."""
        from .models import DeviceToken

        try:
            device = DeviceToken.objects.get(id=token_id, user=request.user)
        except DeviceToken.DoesNotExist:
            return Response(
                {'error': 'Device token not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        device.deactivate(reason='User logout')
        return Response({
            'message': 'Device token deactivated',
            'device_name': device.device_name,
        })


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def deactivate_device_token(request: Request, token_id: str) -> Response:
    """Deactivate a single device token (alternative endpoint style)."""
    from .models import DeviceToken

    try:
        device = DeviceToken.objects.get(id=token_id, user=request.user)
    except DeviceToken.DoesNotExist:
        return Response(
            {'error': 'Device token not found'},
            status=status.HTTP_404_NOT_FOUND,
        )

    device.deactivate(reason='User logout')
    return Response({'message': 'Device token deactivated'})


# ─── Events ──────────────────────────────────────────────────────────────────
# Two pairs of endpoints:
#   /api/auth/events/                        public read for any authenticated
#                                            user — returns events visible to
#                                            their role + status=PUBLISHED.
#   /api/auth/admin/events/                  admin-only list (all statuses) +
#                                            create
#   /api/auth/admin/events/<id>/             admin-only retrieve / update /
#                                            delete

class EventListView(APIView):
    """GET /api/auth/events/ — events visible to the current user's role."""
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        from django.db.models import Q
        role = request.user.role

        # Visible = published AND (target_roles empty OR role in list).
        # Postgres jsonb supports __contains for membership lookups; this
        # works on the JSONField list we use for target_roles.
        qs = Event.objects.filter(status='PUBLISHED').filter(
            Q(target_roles=[]) | Q(target_roles__contains=[role])
        )

        # Optional ?upcoming=true filter — drop events whose end_time has
        # passed (or whose start_time has passed if they have no end).
        if request.query_params.get('upcoming') == 'true':
            now = timezone.now()
            qs = qs.filter(
                Q(end_time__gte=now) | (Q(end_time__isnull=True) & Q(start_time__gte=now))
            )

        try:
            limit = min(int(request.query_params.get('limit', 50)), 200)
        except (TypeError, ValueError):
            limit = 50
        qs = qs.order_by('start_time')[:limit]

        return Response(EventSerializer(qs, many=True, context={'request': request}).data)


class AdminEventListCreateView(APIView):
    """
    GET  /api/auth/admin/events/  → list all events (any status)
    POST /api/auth/admin/events/  → create a new event
    """
    permission_classes = [IsAuthenticated, IsAdmin | IsDirector]

    def get(self, request: Request) -> Response:
        qs = Event.objects.all()
        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter.upper())
        category = request.query_params.get('category')
        if category:
            qs = qs.filter(category=category.upper())
        return Response(EventSerializer(qs, many=True, context={'request': request}).data)

    def post(self, request: Request) -> Response:
        serializer = EventWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        event = serializer.save(created_by=request.user)
        logger.info(
            'Admin %s created event %s — visible_to=%s',
            request.user.email, event.title, event.target_roles or 'ALL',
        )
        return Response(
            EventSerializer(event, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class AdminEventDetailView(APIView):
    """
    GET    /api/auth/admin/events/<id>/  → single event
    PATCH  /api/auth/admin/events/<id>/  → partial update
    DELETE /api/auth/admin/events/<id>/  → hard delete
    """
    permission_classes = [IsAuthenticated, IsAdmin | IsDirector]

    def get(self, request: Request, event_id: str) -> Response:
        try:
            event = Event.objects.get(id=event_id)
        except Event.DoesNotExist:
            return Response({'error': 'Event not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(EventSerializer(event, context={'request': request}).data)

    def patch(self, request: Request, event_id: str) -> Response:
        try:
            event = Event.objects.get(id=event_id)
        except Event.DoesNotExist:
            return Response({'error': 'Event not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = EventWriteSerializer(event, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        event = serializer.save()
        logger.info('Admin %s updated event %s', request.user.email, event.title)
        return Response(EventSerializer(event, context={'request': request}).data)

    def delete(self, request: Request, event_id: str) -> Response:
        try:
            event = Event.objects.get(id=event_id)
        except Event.DoesNotExist:
            return Response({'error': 'Event not found'}, status=status.HTTP_404_NOT_FOUND)
        title = event.title
        event.delete()
        logger.info('Admin %s deleted event %s', request.user.email, title)
        return Response({'message': f'Event "{title}" deleted'}, status=status.HTTP_200_OK)