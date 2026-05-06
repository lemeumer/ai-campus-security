# serializers.py - Data Serialization & Validation
from rest_framework import serializers
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from .models import User, ParentStudentRelation, UserSession, FaceEnrollment, Visitor, Event
import re


class UserRegistrationSerializer(serializers.ModelSerializer):
    """Serializer for user registration with auto-generated ID support"""

    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)
    # ── Parent-specific link fields ───────────────────────────────────────
    # Parent self-registration requires BOTH the child's university_id AND
    # the child's CNIC, so a random person can't register as a parent of any
    # student they happen to know the ID of. The CNIC is private (printed on
    # the student's national ID) — knowing it is reasonable proof of being
    # a real family member. The child must already be ACTIVE.
    child_university_id = serializers.CharField(write_only=True, required=False, allow_blank=True)
    child_cnic          = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'email', 'username', 'password', 'password_confirm',
            'first_name', 'last_name', 'phone_number', 'cnic',
            'role', 'university_id', 'department', 'program', 'semester',
            'designation', 'child_university_id', 'child_cnic',
            # Real campus card fields (typed in by admin during registration
            # OR auto-filled later from a card-OCR scan).
            'enrollment_number', 'campus', 'card_serial_no',
            'card_issued_on', 'card_valid_upto',
        ]

    def validate(self, attrs):
        # Check passwords match
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({"password": "Passwords don't match"})

        # Validate CNIC format (13 digits for Pakistani CNIC) - Required for ALL roles now
        if attrs.get('cnic'):
            clean_cnic = attrs['cnic'].replace('-', '').replace(' ', '')
            if not re.match(r'^\d{13}$', clean_cnic):
                raise serializers.ValidationError({"cnic": "Invalid CNIC format. Must be exactly 13 digits without dashes."})
            attrs['cnic'] = clean_cnic  # Store clean version (numbers only)
        else:
            raise serializers.ValidationError({"cnic": "CNIC is required for all users."})

        # ── Parent verification ──────────────────────────────────────────
        # When registering as a parent, both the child's university_id and
        # the child's CNIC must be provided AND match the same active student
        # record. We never reveal the student's name in the error — fishing
        # for valid IDs returns the same generic message as a typo.
        if attrs.get('role') == 'PARENT':
            child_uid  = (attrs.get('child_university_id') or '').strip()
            child_cnic = (attrs.get('child_cnic') or '').replace('-', '').replace(' ', '').strip()
            if not child_uid:
                raise serializers.ValidationError(
                    {"child_university_id": "Child's University ID is required for parent registration."}
                )
            if not child_cnic:
                raise serializers.ValidationError(
                    {"child_cnic": "Child's CNIC is required to verify your relationship."}
                )
            if not re.match(r'^\d{13}$', child_cnic):
                raise serializers.ValidationError(
                    {"child_cnic": "Child's CNIC must be exactly 13 digits."}
                )
            try:
                student = User.objects.get(
                    university_id=child_uid, role='STUDENT', cnic=child_cnic,
                )
            except User.DoesNotExist:
                raise serializers.ValidationError({
                    "child_university_id":
                        "We could not match a student with that University ID and CNIC. "
                        "Double-check both values, or contact campus IT if your child is "
                        "not yet registered."
                })
            if student.status != 'ACTIVE':
                raise serializers.ValidationError({
                    "child_university_id":
                        "That student account is not active yet. "
                        "Please wait until campus admin activates it before registering."
                })
            attrs['child_cnic'] = child_cnic
            attrs['child_university_id'] = child_uid

        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        # Child link fields are consumed here, not stored on the User model
        child_uid  = validated_data.pop('child_university_id', None)
        validated_data.pop('child_cnic', None)  # only used for verification

        # Ensure empty strings are converted to None for optional fields
        if validated_data.get('university_id') == '':
            validated_data['university_id'] = None

        user = User.objects.create_user(password=password, **validated_data)

        # Link parent to verified student. By this point validate() has
        # already confirmed the (university_id, cnic, role=STUDENT) match,
        # so the lookup is guaranteed to succeed for PARENT registrations.
        if user.role == 'PARENT' and child_uid:
            try:
                student = User.objects.get(university_id=child_uid, role='STUDENT')
                ParentStudentRelation.objects.create(
                    parent=user, student=student, relationship='Parent', is_primary=True
                )
            except User.DoesNotExist:
                # Should never reach here for PARENT (validated upstream); but
                # we keep the guard so admin-initiated parent creation with a
                # missing child_university_id doesn't 500.
                pass

        return user


class UserLoginSerializer(serializers.Serializer):
    """Serializer for user login"""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs.get('email')
        password = attrs.get('password')

        if not (email and password):
            raise serializers.ValidationError("Email and password are required")

        # Look up the account first so we can distinguish between
        # "wrong password", "pending approval", "rejected" and "deactivated".
        # `authenticate()` returns None for ALL of these — we don't want to
        # surface "invalid credentials" when the truth is "we haven't approved
        # you yet."
        try:
            existing = User.objects.get(email=email)
        except User.DoesNotExist:
            existing = None

        # If they're PENDING / REJECTED, surface that — even if the password
        # also happens to be wrong. The view layer will turn this into the
        # proper error code; here we just stamp the user onto attrs so the
        # view's approval gate runs.
        if existing and existing.status in ("PENDING", "REJECTED"):
            if not existing.check_password(password):
                raise serializers.ValidationError("Invalid credentials")
            attrs['user'] = existing
            return attrs

        user = authenticate(email=email, password=password)
        if not user:
            raise serializers.ValidationError("Invalid credentials")

        if not user.is_active:
            raise serializers.ValidationError("Account is deactivated")

        attrs['user'] = user
        return attrs


class UserSerializer(serializers.ModelSerializer):
    """Serializer for user profile data"""

    full_name = serializers.CharField(source='get_full_name', read_only=True)
    is_face_enrolled = serializers.SerializerMethodField()
    active_enrollment_count = serializers.SerializerMethodField()
    last_enrolled_at = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'first_name', 'last_name', 'full_name',
            'phone_number', 'cnic', 'role', 'status', 'university_id',
            'department', 'program', 'semester', 'is_active', 'is_verified',
            'profile_picture', 'date_joined', 'last_login',
            'emergency_contact_name', 'emergency_contact_phone',
            'is_face_enrolled', 'active_enrollment_count', 'last_enrolled_at',
            # Real campus card fields
            'enrollment_number', 'campus', 'card_serial_no',
            'card_issued_on', 'card_valid_upto',
        ]
        read_only_fields = ['id', 'date_joined', 'last_login', 'university_id']  # auto-generated

    def get_is_face_enrolled(self, obj) -> bool:
        return FaceEnrollment.objects.filter(user=obj, is_active=True).exists()

    def get_active_enrollment_count(self, obj) -> int:
        return FaceEnrollment.objects.filter(user=obj, is_active=True).count()

    def get_last_enrolled_at(self, obj):
        latest = FaceEnrollment.objects.filter(user=obj, is_active=True).order_by('-enrolled_at').first()
        return latest.enrolled_at.isoformat() if latest else None


class UserDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer including relationships"""
    
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    children = serializers.SerializerMethodField()
    parents = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'first_name', 'last_name', 'full_name',
            'phone_number', 'cnic', 'role', 'status', 'university_id',
            'department', 'program', 'semester', 'designation',
            'is_active', 'is_verified',
            'profile_picture', 'date_joined', 'last_login',
            'emergency_contact_name', 'emergency_contact_phone',
            # Real campus card fields
            'enrollment_number', 'campus', 'card_serial_no',
            'card_issued_on', 'card_valid_upto',
            'children', 'parents',
        ]
        # university_id is editable by admins now (was read-only because it
        # was auto-generated; admins can override with manual values).
        read_only_fields = ['id', 'date_joined', 'last_login']
    
    def get_children(self, obj):
        if obj.role == 'PARENT':
            relations = ParentStudentRelation.objects.filter(parent=obj).select_related('student')
            return [{
                'student_id': str(rel.student.id),
                'id':          str(rel.student.id),                  # alias for UI
                'name':        rel.student.get_full_name(),
                'full_name':   rel.student.get_full_name(),          # alias for UI
                'university_id': rel.student.university_id,
                'email':       rel.student.email,
                'department':  rel.student.department,
                'program':     rel.student.program,
                'semester':    rel.student.semester,
                'status':      rel.student.status,                   # ACTIVE / SUSPENDED — different from on-campus IN/OUT
                'relationship': rel.relationship,
            } for rel in relations]
        return []
    
    def get_parents(self, obj):
        if obj.role == 'STUDENT':
            relations = ParentStudentRelation.objects.filter(student=obj)
            return [{
                'parent_id': str(rel.parent.id),
                'name': rel.parent.get_full_name(),
                'phone': rel.parent.phone_number,
                'relationship': rel.relationship,
                'is_primary': rel.is_primary
            } for rel in relations]
        return []


class PasswordChangeSerializer(serializers.Serializer):
    """Serializer for password change"""
    
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, validators=[validate_password])
    new_password_confirm = serializers.CharField(write_only=True)
    
    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({"new_password": "Passwords don't match"})
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    """Serializer for password reset request"""
    
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Serializer for password reset confirmation"""
    
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, validators=[validate_password])
    new_password_confirm = serializers.CharField(write_only=True)
    
    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({"new_password": "Passwords don't match"})
        return attrs


class ParentStudentRelationSerializer(serializers.ModelSerializer):
    """Serializer for parent-student relationships"""
    
    parent_name = serializers.CharField(source='parent.get_full_name', read_only=True)
    student_name = serializers.CharField(source='student.get_full_name', read_only=True)
    
    class Meta:
        model = ParentStudentRelation
        fields = [
            'id', 'parent', 'student', 'parent_name', 'student_name',
            'relationship', 'is_primary', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class UserSessionSerializer(serializers.ModelSerializer):
    """Serializer for user sessions"""

    class Meta:
        model = UserSession
        fields = [
            'id', 'device_info', 'ip_address', 'is_active',
            'created_at', 'last_activity', 'expires_at'
        ]
        read_only_fields = ['id', 'created_at', 'last_activity']


# ─── Face Enrollment Serializers ──────────────────────────────────────────────

class FaceEnrollmentRequestSerializer(serializers.Serializer):
    """
    Inbound payload from admin frontend for a new enrollment session.
    Receives 5 base64-encoded JPEG frames (front, left, right, up, down).
    Embedding extraction happens via the FastAPI face service.
    """
    frames = serializers.ListField(
        child=serializers.CharField(),
        min_length=3,
        max_length=10,
        help_text="Base64-encoded JPEG frames (data: URL or raw b64)",
    )
    notes = serializers.CharField(required=False, allow_blank=True, max_length=500)


class FaceEnrollmentSerializer(serializers.ModelSerializer):
    """Detail/list view of an enrollment — never exposes the raw embedding bytes."""

    user_name = serializers.CharField(source='user.get_full_name', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)
    enrolled_by_name = serializers.SerializerMethodField()
    deactivated_by_name = serializers.SerializerMethodField()
    embedding_size = serializers.SerializerMethodField()

    class Meta:
        model = FaceEnrollment
        fields = [
            'id', 'user', 'user_name', 'user_email',
            'frame_count', 'quality_score', 'quality_grade', 'liveness_passed',
            'enrolled_by', 'enrolled_by_name', 'enrolled_at', 'enrollment_ip',
            'is_active', 'deactivated_at', 'deactivated_by', 'deactivated_by_name',
            'deactivation_reason', 'last_matched_at', 'match_count',
            'notes', 'embedding_size',
        ]
        read_only_fields = fields  # all fields read-only — created via dedicated view

    def get_enrolled_by_name(self, obj):
        return obj.enrolled_by.get_full_name() if obj.enrolled_by else None

    def get_deactivated_by_name(self, obj):
        return obj.deactivated_by.get_full_name() if obj.deactivated_by else None

    def get_embedding_size(self, obj) -> int:
        return len(obj.embedding) if obj.embedding else 0


class FaceEnrollmentDeactivateSerializer(serializers.Serializer):
    """Payload for soft-deleting an enrollment with audit reason."""
    reason = serializers.ChoiceField(
        choices=FaceEnrollment.DEACTIVATION_REASON_CHOICES,
        default="ADMIN_REMOVED",
    )
    notes = serializers.CharField(required=False, allow_blank=True, max_length=500)


# ─── Visitor ──────────────────────────────────────────────────────────────────

class VisitorSerializer(serializers.ModelSerializer):
    """Visitor record returned by /api/auth/visitors/."""

    host_name        = serializers.SerializerMethodField()
    host_role        = serializers.SerializerMethodField()
    logged_by_name   = serializers.SerializerMethodField()
    duration_minutes = serializers.SerializerMethodField()

    class Meta:
        model = Visitor
        fields = [
            'id', 'full_name', 'cnic', 'phone_number', 'photo',
            'purpose', 'host_user', 'host_name', 'host_role', 'host_department',
            'status', 'entry_time', 'exit_time', 'duration_minutes',
            'logged_by', 'logged_by_name', 'ocr_raw_text', 'notes',
        ]
        read_only_fields = ['id', 'entry_time', 'exit_time', 'logged_by',
                            'host_name', 'host_role', 'logged_by_name',
                            'duration_minutes']

    def get_host_name(self, obj):
        return obj.host_user.get_full_name() if obj.host_user else None

    def get_host_role(self, obj):
        return obj.host_user.role if obj.host_user else None

    def get_logged_by_name(self, obj):
        return obj.logged_by.get_full_name() if obj.logged_by else None

    def get_duration_minutes(self, obj):
        # Useful for visit-length stats. Returns None if still on campus.
        if not obj.exit_time:
            return None
        delta = obj.exit_time - obj.entry_time
        return int(delta.total_seconds() / 60)


class VisitorCreateSerializer(serializers.ModelSerializer):
    """
    Payload security uses to register a new visitor at the gate.

    `cnic` is normalised (digits only) before saving so search by CNIC
    works whether OCR captured it as `35201-1234567-8` or `3520112345678`.
    """

    class Meta:
        model = Visitor
        fields = [
            'full_name', 'cnic', 'phone_number', 'purpose',
            'host_user', 'host_department', 'ocr_raw_text', 'notes',
        ]

    def validate_cnic(self, value):
        cleaned = (value or '').replace('-', '').replace(' ', '').strip()
        if not cleaned.isdigit() or len(cleaned) != 13:
            raise serializers.ValidationError(
                'CNIC must be 13 digits. Got %r.' % value
            )
        return cleaned

    def validate_full_name(self, value):
        v = (value or '').strip()
        if len(v) < 2:
            raise serializers.ValidationError('Visitor name is too short.')
        return v


# ─── Events ──────────────────────────────────────────────────────────────────

class EventSerializer(serializers.ModelSerializer):
    """Read serializer for events shown in portals + admin list."""

    created_by_name = serializers.SerializerMethodField()
    poster_url      = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            'id', 'title', 'description', 'category',
            'start_time', 'end_time', 'venue',
            'link', 'target_roles', 'status',
            'poster', 'poster_url',
            'created_by', 'created_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_by_name',
                            'poster_url', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_poster_url(self, obj):
        if not obj.poster:
            return None
        request = self.context.get('request')
        url = obj.poster.url
        return request.build_absolute_uri(url) if request else url


class EventWriteSerializer(serializers.ModelSerializer):
    """
    Write serializer used by the admin create/update endpoints. We separate
    it from EventSerializer so create/update don't accept computed fields
    (poster_url, created_by_name) and can validate target_roles cleanly.
    """

    class Meta:
        model = Event
        fields = [
            'title', 'description', 'category',
            'start_time', 'end_time', 'venue',
            'link', 'target_roles', 'status', 'poster',
        ]

    def validate_target_roles(self, value):
        if value in (None, ''):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError(
                'target_roles must be a list of role codes (e.g. ["STUDENT","FACULTY"]).'
            )
        valid = {choice[0] for choice in User.ROLE_CHOICES}
        bad = [r for r in value if r not in valid]
        if bad:
            raise serializers.ValidationError(
                f'Unknown role(s): {bad}. Valid: {sorted(valid)}'
            )
        return value

    def validate(self, attrs):
        start = attrs.get('start_time') or getattr(self.instance, 'start_time', None)
        end   = attrs.get('end_time')   or getattr(self.instance, 'end_time', None)
        if start and end and end < start:
            raise serializers.ValidationError(
                {'end_time': 'End time cannot be before start time.'}
            )
        return attrs