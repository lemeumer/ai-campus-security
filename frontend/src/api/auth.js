import { api } from './client'

export const authApi = {
  login: (data) => api.post('/login/', data),
  register: (data) => api.post('/register/', data),
  logout: () => api.post('/logout/'),
  getProfile: () => api.get('/profile/'),
  updateProfile: (data) => api.put('/profile/', data),
  changePassword: (data) => api.post('/password-change/', data),
  requestPasswordReset: (data) => api.post('/password-reset/', data),
  confirmPasswordReset: (data) => api.post('/password-reset-confirm/', data),
  verifyToken: () => api.get('/verify-token/'),
  getUsers: (params) => api.get('/users/', { params }),
  // Admin: read or update any user. Sensitive fields (password, CNIC,
  // university_id) are NOT editable via this endpoint by design.
  getUser:    (userId) => api.get(`/users/${userId}/`),
  updateUser: (userId, data) => api.patch(`/users/${userId}/`, data),
  // Admin: hard-delete a user. Cascades to face enrolments, gate entries
  // and sessions via DB FKs. Backend refuses if userId is the current
  // admin or has role=ADMIN.
  deleteUser: (userId) => api.delete(`/users/${userId}/`),

  // ── Admin user management: create / pending queue / approve / reject ───
  // Admin-initiated account creation. Account is auto-active (no pending queue).
  // Body shape matches UserRegistrationSerializer (email, password,
  // password_confirm, first_name, last_name, role, cnic, ...).
  adminCreateUser: (payload) => api.post('/admin/users/', payload),
  // List of self-registered accounts awaiting admin approval
  getPendingRegistrations: () => api.get('/admin/pending/'),
  // Approve a pending account → flips to ACTIVE; the user can log in.
  approveRegistration: (userId) => api.post(`/admin/users/${userId}/approve/`),
  // Reject a pending account → status=REJECTED + login blocked.
  // body: { reason?: 'free-text explanation' }
  rejectRegistration: (userId, reason = '') =>
    api.post(`/admin/users/${userId}/reject/`, { reason }),
  // Hard-delete a pending/rejected account (spam cleanup).
  // Backend refuses to delete ACTIVE accounts — admin must reject first.
  deletePendingRegistration: (userId) =>
    api.delete(`/admin/users/${userId}/delete-pending/`),
  getSessions: () => api.get('/sessions/'),
  revokeSession: (id) => api.delete(`/sessions/${id}/`),
  getAttendance: (params) => api.get('/attendance/', { params }),
  getStudentActivity: (studentId) => api.get(`/student-activity/${studentId}/`),
  gateEntry: (data) => api.post('/gate-entry/', data),
  // Recent gate-entry log (last 100 events) for the security dashboard
  getGateEntries: () => api.get('/gate-entry/'),

  // ── Face enrollment (admin only) ────────────────────────────────────────
  // List all enrollments (active + history) for a single user
  getEnrollments: (userId) => api.get(`/users/${userId}/face-enrollments/`),
  // Create a new enrollment — body: { frames: [...b64], notes?: string }
  // Returns 409 if user already has an active enrollment
  createEnrollment: (userId, payload) =>
    api.post(`/users/${userId}/face-enrollments/`, payload),
  // Soft-delete an enrollment with audit reason
  // body: { reason: 'ADMIN_REMOVED' | 'REPLACED' | ..., notes?: string }
  deactivateEnrollment: (enrollmentId, payload = { reason: 'ADMIN_REMOVED' }) =>
    api.delete(`/face-enrollments/${enrollmentId}/`, { data: payload }),
  // Single enrollment detail
  getEnrollment: (enrollmentId) =>
    api.get(`/face-enrollments/${enrollmentId}/`),
  // Increment match counter on an enrollment — called after every successful
  // gate-side face match so we have per-enrollment usage stats.
  recordEnrollmentMatch: (enrollmentId) =>
    api.post(`/face-enrollments/${enrollmentId}/match/`),
  // Admin: aggregated audit log. Supports ?kind=, ?severity=, ?since=, ?limit=
  getAdminLogs: (params) => api.get('/admin/logs/', { params }),

  // ── Visitors ─────────────────────────────────────────────────────────
  // List visitors. Filters: ?status=, ?today=true, ?search=, ?limit=
  getVisitors:        (params) => api.get('/visitors/', { params }),
  // Create a visitor record at the gate
  createVisitor:      (payload) => api.post('/visitors/', payload),
  // Single visitor detail / partial update
  getVisitor:         (id) => api.get(`/visitors/${id}/`),
  updateVisitor:      (id, payload) => api.patch(`/visitors/${id}/`, payload),
  // Mark visitor as checked-out (records exit_time + flips status)
  checkOutVisitor:    (id) => api.post(`/visitors/${id}/exit/`),

  // ── Admin: Twilio test SMS ───────────────────────────────────────────
  // POST { to: '+923001234567', body: 'optional override' }
  // Returns { ok, mode: 'live'|'dev', to, body, twilio_configured, ... }.
  // 'dev' mode logs to Django console when Twilio creds aren't set.
  testSms: (payload) => api.post('/admin/test-sms/', payload),

  // ── Firebase Cloud Messaging (Phase 6) ────────────────────────────────
  // Register a device token for push notifications
  registerDeviceToken: (payload) => api.post('/device-token/', payload),
  // List all active device tokens for the current user
  getDeviceTokens: () => api.get('/device-tokens/'),
  // Deactivate a device token (e.g., on logout)
  deactivateDeviceToken: (tokenId) => api.delete(`/device-token/${tokenId}/`),

  // ── Events ────────────────────────────────────────────────────────────
  // Per-role event feed for portals. Filters: ?upcoming=true, ?limit=50
  getEvents:           (params) => api.get('/events/', { params }),

  // Admin events CRUD. Body shape (see EventWriteSerializer):
  //   { title, description, category, start_time, end_time, venue,
  //     link, target_roles: [...], status, poster? }
  getAdminEvents:      (params)         => api.get('/admin/events/', { params }),
  createAdminEvent:    (payload)        => api.post('/admin/events/', payload),
  getAdminEvent:       (id)             => api.get(`/admin/events/${id}/`),
  updateAdminEvent:    (id, payload)    => api.patch(`/admin/events/${id}/`, payload),
  deleteAdminEvent:    (id)             => api.delete(`/admin/events/${id}/`),
}
