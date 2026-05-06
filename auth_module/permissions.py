# permissions.py - Custom Permission Classes
from rest_framework import permissions


class IsAdmin(permissions.BasePermission):
    """
    Permission class for Admin users only
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == "ADMIN"
        )


class IsDirector(permissions.BasePermission):
    """
    Permission class for Director users
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == "DIRECTOR"
        )


class IsSecurity(permissions.BasePermission):
    """
    Permission class for Security personnel
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == "SECURITY"
        )


class IsSecurityOrAdmin(permissions.BasePermission):
    """
    Permission class for Security or Admin users
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in ["SECURITY", "ADMIN"]
        )


class IsHR(permissions.BasePermission):
    """
    Permission class for HR users
    """

    def has_permission(self, request, view):
        return (
            request.user and request.user.is_authenticated and request.user.role == "HR"
        )


class IsFaculty(permissions.BasePermission):
    """
    Permission class for Faculty users
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == "FACULTY"
        )


class IsStudent(permissions.BasePermission):
    """
    Permission class for Student users
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == "STUDENT"
        )


class IsParent(permissions.BasePermission):
    """
    Permission class for Parent users
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == "PARENT"
        )


class IsOwnerOrAdmin(permissions.BasePermission):
    """
    Permission class allowing owners to edit their own data or admins to edit any data
    """

    def has_object_permission(self, request, view, obj):
        # Admin can access anything
        if request.user.role == "ADMIN":
            return True

        # Owner can access their own data
        if hasattr(obj, "user"):
            return obj.user == request.user

        return obj == request.user


class CanManageUsers(permissions.BasePermission):
    """
    Permission class for users who can manage other users (Admin, Director, HR)
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in ["ADMIN", "DIRECTOR", "HR"]
        )


class CanAccessGate(permissions.BasePermission):
    """
    Permission class for gate access (Security, Admin)
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in ["SECURITY", "ADMIN"]
        )


class CanViewReports(permissions.BasePermission):
    """
    Permission class for viewing reports (Admin, Director, HR)
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in ["ADMIN", "DIRECTOR", "HR"]
        )


class IsActiveUser(permissions.BasePermission):
    """
    Permission class for active users only
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.is_active
            and request.user.status == "ACTIVE"
        )


class IsVerifiedUser(permissions.BasePermission):
    """
    Permission class for verified users only
    """

    def has_permission(self, request, view):
        return (
            request.user and request.user.is_authenticated and request.user.is_verified
        )


class CanManageEvents(permissions.BasePermission):
    """
    Permission class for event management (Admin, Director)
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in ["ADMIN", "DIRECTOR"]
        )


class CanAccessParentPortal(permissions.BasePermission):
    """
    Permission for parent portal access
    Parents can only view their own children's data
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == "PARENT"
        )

    def has_object_permission(self, request, view, obj):
        # Check if the student is child of this parent
        from .models import ParentStudentRelation

        if request.user.role == "PARENT":
            return ParentStudentRelation.objects.filter(
                parent=request.user, student=obj
            ).exists()

        return False
