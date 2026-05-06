"""
DRF authentication class for Bearer JWT tokens.

Why this exists separately from JWTAuthenticationMiddleware:
  - Middleware sets request.user on the underlying Django HttpRequest, but
    DRF's `rest_framework.request.Request` wrapper overrides `.user` based
    on configured authenticators. With no DRF authenticator, request.user
    becomes AnonymousUser inside DRF views regardless of what the middleware
    did, and DRF cannot distinguish "not authenticated" from "no permission",
    so it returns a generic 403 "You do not have permission".
  - This class is the proper DRF integration. The middleware is still useful
    for non-DRF Django views (e.g. /admin/), so we keep both.

Token format:  Authorization: Bearer <jwt>
Validation steps:
  1. Decode JWT (HS256 with SECRET_KEY)
  2. Look up the User by id
  3. Check user.is_active and user.status == 'ACTIVE'
  4. Verify the token is bound to an active UserSession (single-source-of-truth
     for revocations / device tracking)
  5. Update session.last_activity
"""

from rest_framework import authentication, exceptions
from django.utils import timezone

from .models import User, UserSession
from .utils import decode_jwt_token


class BearerJWTAuthentication(authentication.BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith(f"{self.keyword} "):
            # No token → let other authenticators try, or fall through to AnonymousUser
            return None

        token = auth_header.split(" ", 1)[1].strip()
        if not token:
            return None

        payload = decode_jwt_token(token)
        if not payload:
            raise exceptions.AuthenticationFailed("Invalid or expired token")

        try:
            user = User.objects.get(id=payload["user_id"])
        except (User.DoesNotExist, KeyError):
            raise exceptions.AuthenticationFailed("User not found")

        if not user.is_active:
            raise exceptions.AuthenticationFailed("Account is deactivated")

        session = UserSession.objects.filter(
            user=user, token=token, is_active=True
        ).first()
        if not session:
            raise exceptions.AuthenticationFailed("Invalid session")

        if session.expires_at < timezone.now():
            session.is_active = False
            session.save(update_fields=["is_active"])
            raise exceptions.AuthenticationFailed("Session expired")

        session.last_activity = timezone.now()
        session.save(update_fields=["last_activity"])

        return (user, token)

    def authenticate_header(self, request):
        # Tells DRF to send "WWW-Authenticate: Bearer" on 401 responses
        return self.keyword
