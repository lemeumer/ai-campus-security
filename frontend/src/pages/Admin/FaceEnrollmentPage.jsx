import { useState, useEffect, useMemo, useCallback } from 'react'
import { authApi } from '../../api/auth'
import Badge, { StatusBadge } from '../../components/ui/Badge'
import StatCard from '../../components/ui/StatCard'
import Modal from '../../components/ui/Modal'
import FaceEnrollModal from '../../components/admin/FaceEnrollModal'
import {
  HiSearch, HiUserAdd, HiRefresh, HiTrash, HiShieldCheck,
  HiUsers, HiExclamation, HiCheckCircle, HiClock, HiX,
} from 'react-icons/hi'
import toast from 'react-hot-toast'

/**
 * /admin/enrollment — dedicated portal for facial-recognition enrollment.
 *
 * Why a separate page (not a modal-on-Users):
 *   Admin needs to see at a glance who is/isn't enrolled, search by name/ID,
 *   filter by role, and run bulk-style operations. Enrollment is a regulated
 *   operation (face data is biometric PII) so it deserves its own dedicated
 *   surface with audit-friendly controls.
 *
 * Roles that can access:  ADMIN, DIRECTOR, HR  (route gate handles this)
 * Backend ownership:      auth_module.views.FaceEnrollmentListCreateView
 * Pipeline:               5-frame capture → FastAPI → Django → Postgres
 */

const ROLE_OPTIONS = ['ALL', 'STUDENT', 'FACULTY', 'STAFF', 'SECURITY', 'PARENT']
const STATUS_OPTIONS = ['ALL', 'ENROLLED', 'NOT_ENROLLED']
const ROLE_EMOJI = { STUDENT: '🎓', FACULTY: '👨‍🏫', STAFF: '💼', SECURITY: '🛡️', ADMIN: '⚙️', PARENT: '👨‍👩‍👧' }
const ROLE_COLORS = {
  STUDENT: 'info', FACULTY: 'purple', STAFF: 'success',
  SECURITY: 'warning', ADMIN: 'danger', PARENT: 'default',
}

export default function FaceEnrollmentPage() {
  // ── Data state ────────────────────────────────────────────────────────────
  const [users, setUsers]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [loadError, setLoadError]       = useState(null)

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search, setSearch]             = useState('')
  const [roleFilter, setRoleFilter]     = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // ── Modal state ───────────────────────────────────────────────────────────
  const [enrollUser, setEnrollUser]     = useState(null)         // user being enrolled in the wizard
  const [removeTarget, setRemoveTarget] = useState(null)         // { user, enrollmentId } pending confirmation
  const [removing, setRemoving]         = useState(false)

  // ── Fetch users ───────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await authApi.getUsers()
      const list = res.data?.results || res.data || []
      setUsers(Array.isArray(list) ? list : [])
    } catch (err) {
      setLoadError(err.response?.data?.detail || err.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  // ── Derived: filtered list ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false
      if (statusFilter === 'ENROLLED' && !u.is_face_enrolled) return false
      if (statusFilter === 'NOT_ENROLLED' && u.is_face_enrolled) return false
      if (!q) return true
      const haystack = [
        u.full_name, u.first_name, u.last_name,
        u.email, u.university_id, u.department,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [users, search, roleFilter, statusFilter])

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const enrolled = users.filter((u) => u.is_face_enrolled).length
    const total    = users.length
    const percent  = total ? Math.round((enrolled / total) * 100) : 0
    return {
      total,
      enrolled,
      pending:  total - enrolled,
      percent,
    }
  }, [users])

  // ── Open enrollment wizard ────────────────────────────────────────────────
  const startEnrollment = useCallback((user) => {
    if (user.is_face_enrolled) {
      toast.error(
        `${user.first_name} already has an active enrollment. Remove it first to re-enroll.`,
        { duration: 4500 }
      )
      return
    }
    setEnrollUser(user)
  }, [])

  // ── Open re-enroll flow (must remove first) ───────────────────────────────
  const startReEnroll = useCallback(async (user) => {
    try {
      const { data } = await authApi.getEnrollments(user.id)
      const active = (data?.results || data || []).find((e) => e.is_active)
      if (!active) {
        // Race: it was already removed elsewhere — just open the wizard.
        setEnrollUser(user)
        return
      }
      setRemoveTarget({ user, enrollmentId: active.id, mode: 'replace' })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not load enrollment record')
    }
  }, [])

  // ── Open remove confirmation ──────────────────────────────────────────────
  const startRemove = useCallback(async (user) => {
    try {
      const { data } = await authApi.getEnrollments(user.id)
      const active = (data?.results || data || []).find((e) => e.is_active)
      if (!active) {
        toast(`${user.first_name} has no active enrollment`, { icon: 'ℹ️' })
        // Refresh in case the badge was stale.
        loadUsers()
        return
      }
      setRemoveTarget({ user, enrollmentId: active.id, mode: 'remove' })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not load enrollment record')
    }
  }, [loadUsers])

  // ── Confirm deactivation ──────────────────────────────────────────────────
  const confirmRemove = useCallback(async () => {
    if (!removeTarget) return
    const { user, enrollmentId, mode } = removeTarget
    setRemoving(true)
    try {
      await authApi.deactivateEnrollment(enrollmentId, {
        reason: mode === 'replace' ? 'REPLACED' : 'ADMIN_REMOVED',
        notes: mode === 'replace'
          ? 'Replaced via admin re-enrollment flow'
          : 'Removed by admin from enrollment portal',
      })
      toast.success(`Enrollment removed for ${user.first_name}`, { duration: 3500 })
      setRemoveTarget(null)
      // Refresh the row's badge state immediately
      await loadUsers()
      // If we're in replace mode, immediately open the wizard
      if (mode === 'replace') {
        // Use the freshly-loaded user (badge should now read NOT_ENROLLED)
        setEnrollUser({ ...user, is_face_enrolled: false })
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || 'Removal failed')
    } finally {
      setRemoving(false)
    }
  }, [removeTarget, loadUsers])

  // ── Wizard success → refresh + close ──────────────────────────────────────
  const handleEnrollSuccess = useCallback(() => {
    setEnrollUser(null)
    loadUsers()
  }, [loadUsers])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Banner ──────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-7 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)' }}
      >
        <div
          className="absolute inset-0 opacity-15"
          style={{ backgroundImage: 'radial-gradient(circle at 90% 30%, white, transparent 55%)' }}
        />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-blue-100 text-xs uppercase tracking-widest mb-1">Biometric Enrollment</p>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <HiShieldCheck className="w-6 h-6" /> Face Enrollment Portal
            </h2>
            <p className="text-blue-100 text-sm mt-1 max-w-xl">
              Capture and manage facial recognition profiles. Each enrollment records 5 angles,
              runs liveness detection, and is logged with an audit trail.
            </p>
          </div>
          <button
            onClick={loadUsers}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white/15 hover:bg-white/25 backdrop-blur-md transition-all border border-white/20 disabled:opacity-50"
          >
            <HiRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users"        value={stats.total}    icon={HiUsers}         color="blue" />
        <StatCard label="Enrolled"           value={stats.enrolled} icon={HiCheckCircle}   color="green" />
        <StatCard label="Pending Enrollment" value={stats.pending}  icon={HiClock}         color="amber" />
        <StatCard label="Coverage"           value={`${stats.percent}%`} icon={HiShieldCheck} color="purple" />
      </div>

      {/* ── Toolbar + table card ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

        {/* Toolbar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-bold text-slate-900 whitespace-nowrap">Users</h3>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500">{filtered.length} of {users.length}</span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <div className="relative">
              <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                className="input pl-9 text-xs w-full sm:w-64"
                placeholder="Search name, email, ID, department…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Role filter pills */}
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              {ROLE_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                    roleFilter === r
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Status sub-filter */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-100 bg-slate-50">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Face status:</span>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                statusFilter === s
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-500 hover:text-slate-800 border border-slate-200'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Body — loading / error / table */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <div className="w-8 h-8 border-3 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-xs font-semibold">Loading users…</p>
          </div>
        ) : loadError ? (
          <div className="m-6 rounded-xl p-4 flex items-start gap-3 bg-red-50 border border-red-200">
            <HiExclamation className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-900">Couldn't load users</p>
              <p className="text-xs text-red-700 mt-0.5">{loadError}</p>
              <button
                onClick={loadUsers}
                className="mt-2 text-xs font-bold text-red-700 hover:text-red-900 underline"
              >
                Try again
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl w-full">
              <thead>
                <tr>
                  <th>User</th>
                  <th>University ID</th>
                  <th>Role</th>
                  <th>Account</th>
                  <th>Face Status</th>
                  <th className="text-right pr-6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    onEnroll={() => startEnrollment(u)}
                    onReEnroll={() => startReEnroll(u)}
                    onRemove={() => startRemove(u)}
                  />
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-16">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <HiUsers className="w-8 h-8 opacity-50" />
                        <p className="text-sm font-semibold">No users match your filters</p>
                        {(search || roleFilter !== 'ALL' || statusFilter !== 'ALL') && (
                          <button
                            onClick={() => { setSearch(''); setRoleFilter('ALL'); setStatusFilter('ALL') }}
                            className="text-xs text-blue-600 font-semibold hover:text-blue-800 mt-1"
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Enrollment wizard modal ────────────────────────────────────── */}
      {enrollUser && (
        <FaceEnrollModal
          user={enrollUser}
          onClose={() => setEnrollUser(null)}
          onSuccess={handleEnrollSuccess}
        />
      )}

      {/* ── Remove / replace confirmation modal ────────────────────────── */}
      <Modal
        open={!!removeTarget}
        onClose={() => !removing && setRemoveTarget(null)}
        title={removeTarget?.mode === 'replace' ? 'Replace enrollment?' : 'Remove enrollment?'}
        size="md"
      >
        {removeTarget && (
          <div className="space-y-4">
            <div className="rounded-xl p-4 flex items-start gap-3 bg-amber-50 border border-amber-200">
              <HiExclamation className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-bold text-amber-900 mb-1">
                  {removeTarget.mode === 'replace'
                    ? `This will deactivate ${removeTarget.user.first_name}'s current face enrollment, then start a fresh 5-pose capture.`
                    : `This will deactivate ${removeTarget.user.first_name}'s active face enrollment.`}
                </p>
                <p className="text-amber-800">
                  The record stays in the database for audit purposes — it isn't deleted, just marked inactive.
                  {removeTarget.mode === 'remove' && ' The user will not be recognized at the gate until re-enrolled.'}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 flex items-center gap-3 bg-slate-50">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-lg flex-shrink-0">
                {ROLE_EMOJI[removeTarget.user.role] || removeTarget.user.first_name?.[0]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">
                  {removeTarget.user.first_name} {removeTarget.user.last_name}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {removeTarget.user.role} · {removeTarget.user.university_id || removeTarget.user.email}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRemoveTarget(null)}
                disabled={removing}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemove}
                disabled={removing}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-2 disabled:opacity-60"
                style={{
                  background: removeTarget.mode === 'replace'
                    ? 'linear-gradient(135deg, #1e40af, #3b82f6)'
                    : 'linear-gradient(135deg, #be123c, #ef4444)',
                  boxShadow: removeTarget.mode === 'replace'
                    ? '0 4px 12px rgba(59,130,246,0.3)'
                    : '0 4px 12px rgba(239,68,68,0.3)',
                }}
              >
                {removing ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Working…
                  </>
                ) : removeTarget.mode === 'replace' ? (
                  <>
                    <HiRefresh className="w-3.5 h-3.5" />
                    Remove & re-enroll
                  </>
                ) : (
                  <>
                    <HiTrash className="w-3.5 h-3.5" />
                    Remove enrollment
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ─── Sub-components ──────────────────────────────────────────────────────── */

function UserRow({ user, onEnroll, onReEnroll, onRemove }) {
  const enrolled = !!user.is_face_enrolled
  const enrolledAt = user.last_enrolled_at
    ? new Date(user.last_enrolled_at).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : null

  return (
    <tr>
      <td>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-sm font-bold text-blue-600 flex-shrink-0">
            {ROLE_EMOJI[user.role] || user.first_name?.[0] || '?'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {user.full_name || `${user.first_name} ${user.last_name}`}
            </p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
        </div>
      </td>
      <td>
        <span className="font-mono text-xs bg-slate-50 px-2 py-1 rounded-lg">
          {user.university_id || '—'}
        </span>
      </td>
      <td><Badge variant={ROLE_COLORS[user.role] || 'default'}>{user.role}</Badge></td>
      <td><StatusBadge status={user.status} /></td>
      <td>
        {enrolled ? (
          <div className="flex flex-col gap-0.5">
            <Badge variant="success">
              <HiCheckCircle className="w-3 h-3" /> Enrolled
            </Badge>
            {enrolledAt && (
              <span className="text-[10px] text-slate-400 ml-1">
                {enrolledAt}
              </span>
            )}
          </div>
        ) : (
          <Badge variant="warning">
            <HiClock className="w-3 h-3" /> Not enrolled
          </Badge>
        )}
      </td>
      <td className="text-right pr-6">
        <div className="flex items-center justify-end gap-2">
          {enrolled ? (
            <>
              <button
                onClick={onReEnroll}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 px-2 py-1 rounded transition-colors flex items-center gap-1"
              >
                <HiRefresh className="w-3.5 h-3.5" /> Re-enroll
              </button>
              <button
                onClick={onRemove}
                className="text-xs font-bold text-red-500 hover:text-red-700 px-2 py-1 rounded transition-colors flex items-center gap-1"
              >
                <HiTrash className="w-3.5 h-3.5" /> Remove
              </button>
            </>
          ) : (
            <button
              onClick={onEnroll}
              disabled={user.status !== 'ACTIVE'}
              title={user.status !== 'ACTIVE' ? 'Account must be ACTIVE to enroll' : ''}
              className="text-xs font-bold text-white px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #059669, #10b981)',
                boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
              }}
            >
              <HiUserAdd className="w-3.5 h-3.5" /> Enroll
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
