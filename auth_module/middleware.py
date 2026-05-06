# middleware.py - Custom Authentication Middleware
from django.utils.deprecation import MiddlewareMixin
from django.http import JsonResponse
from .models import User, UserSession
from .utils import decode_jwt_token
from django.utils import timezone


class JWTAuthenticationMiddleware(MiddlewareMixin):
    """
    Middleware to authenticate users using JWT tokens
    Attaches user object to request if token is valid
    """

    def process_request(self, request):
        # Skip authentication for certain paths
        exempt_paths = [
            "/api/auth/login/",
            "/api/auth/register/",
            "/api/auth/password-reset/",
            "/api/auth/password-reset-confirm/",
        ]

        if request.path in exempt_paths:
            return None

        # Get token from Authorization header
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")

        if not auth_header.startswith("Bearer "):
            return None

        token = auth_header.split(" ")[1]

        # Decode token
        payload = decode_jwt_token(token)

        if not payload:
            return JsonResponse({"error": "Invalid or expired token"}, status=401)

        # Get user from payload
        try:
            user = User.objects.get(id=payload["user_id"])

            # Check if user is active
            if not user.is_active:
                return JsonResponse({"error": "Account is deactivated"}, status=401)

            # Verify session is active
            session = UserSession.objects.filter(
                user=user, token=token, is_active=True
            ).first()

            if not session:
                return JsonResponse({"error": "Invalid session"}, status=401)

            # Check if session has expired
            if session.expires_at < timezone.now():
                session.is_active = False
                session.save()
                return JsonResponse({"error": "Session expired"}, status=401)

            # Update last activity
            session.last_activity = timezone.now()
            session.save(update_fields=["last_activity"])

            # Attach user to request
            request.user = user

        except User.DoesNotExist:
            return JsonResponse({"error": "User not found"}, status=401)

        return None


class SecurityLoggingMiddleware(MiddlewareMixin):
    """
    Middleware to log security-related events
    """

    def process_request(self, request):
        # Log sensitive operations
        sensitive_paths = [
            "/api/auth/login/",
            "/api/auth/logout/",
            "/api/auth/password-change/",
            "/api/users/",
        ]

        if any(request.path.startswith(path) for path in sensitive_paths):
            # You can implement custom logging here
            pass

        return None


class RateLimitMiddleware(MiddlewareMixin):
    """
    Middleware to implement rate limiting
    """

    def process_request(self, request):
        # Implement rate limiting logic
        # This is a placeholder - use Redis or similar for production
        pass
