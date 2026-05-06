import { useState, useEffect, useCallback } from 'react'
import { authApi } from '../../api/auth'
import Badge from '../../components/ui/Badge'
import StatCard from '../../components/ui/StatCard'
import {
  HiClock, HiCheck, HiX, HiUserGroup, HiExclamation, HiRefresh, HiTrash,
} from 'react-icons/hi'
import toast from 'react-hot-toast'

/**
 * /admin/pending — queue of self-registered accounts awaiting admin approval.
 * Self-registration sets status=PENDING + is_active=False; users land here
 * until an admin clicks Approve (→ ACTIVE, login allowed) or Reject (→
 * REJECTED, login blocked, optional reason captured for audit).
 *
 * Admin-created accounts via "Add user" never appear here — they're
 * auto-approved.
 */

const ROLE_COLORS = {
  STUDENT: 'info', FACULTY: 'purple', STAFF: 'success',
  SECURITY: 'warning', ADMIN: 'danger', PARENT: 'default',
  DIRECTOR: 'danger', HR: 'info',
}
const ROLE_EMOJI = {
  STUDENT: '🎓', FACULTY: '👨‍🏫', STAFF: '💼',
  SECURITY: '🛡️', ADMIN: '⚙️', PARENT: '👨‍👩‍👧',
  DIRECTOR: '👔', HR: '🧑‍💼',
}

export default function AdminPendingPage() {
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId]   = useState(null)
  const [rejectingUser, setRejectingUser] = useState(null)
  const [rejectReason, setRejectReason]   = useState('')

  const fetchPending = useCallback(() => {
    setLoading(true)
    return authApi.getPendingRegistrations()
      .then(res => {
        const list = res.data?.pending || []
        setUsers(Array.isArray(list) ? list : [])
      })
      .catch(() => toast.error('Could not load pending registrations'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchPending() }, [fetchPending])

  const handleApprove = async (user) => {
    setBusyId(user.id)
    try {
      await authApi.approveRegistration(user.id)
      toast.success(`${user.full_name || user.email} approved`)
      // Drop from list (the queue only shows PENDING)
      setUsers(prev => prev.filter(u => u.id !== user.id))
    } catch (e) {
      const msg = e.response?.data?.error || e.response?.data?.detail || e.message
      toast.error(msg || 'Approve failed')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (user) => {
    const ok = window.confirm(
      `Permanently delete the registration for ${user.email}? ` +
      `This cannot be undone. Use this only for spam / test accounts. ` +
      `For real users you'd rather block, click Reject instead.`
    )
    if (!ok) return
    setBusyId(user.id)
    try {
      await authApi.deletePendingRegistration(user.id)
      toast.success(`${user.email} deleted`)
      setUsers(prev => prev.filter(u => u.id !== user.id))
    } catch (e) {
      const msg = e.response?.data?.error || e.response?.data?.detail || e.message
      toast.error(msg || 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  const handleConfirmReject = async () => {
    if (!rejectingUser) return
    setBusyId(rejectingUser.id)
    try {
      await authApi.rejectRegistration(rejectingUser.id, rejectReason.trim())
      toast.success(`${rejectingUser.full_name || rejectingUser.email} rejected`)
      setUsers(prev => prev.filter(u => u.id !== rejectingUser.id))
      setRejectingUser(null)
      setRejectReason('')
    } catch (e) {
      const msg = e.response?.data?.error || e.response?.data?.detail || e.message
      toast.error(msg || 'Reject failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="rounded-2xl p-7 text-white relative overflow-hidden"
           style={{ background: 'linear-gradient(135deg, #b45309, #f59e0b)' }}>
        <div className="absolute inset-0 opacity-10"
             style={{ backgroundImage: 'radial-gradient(circle at 85% 50%, white, transparent 60%)' }} />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-amber-100 text-sm mb-1">Approval Queue</p>
            <h2 className="text-2xl font-bold">Pending Registrations</h2>
            <p className="text-amber-100/80 text-sm mt-1">
              Review accounts that registered themselves — approve to enable login, or reject with a reason.
            </p>
          </div>
          <button
            onClick={fetchPending}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs text-white transition-all bg-white/15 hover:bg-white/25 active:scale-95 flex-shrink-0 disabled:opacity-50"
          >
            <HiRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pending now"  value={users.length} icon={HiClock}     color="amber" />
        <StatCard label="Students"     value={users.filter(u => u.role === 'STUDENT').length}  icon={HiUserGroup} color="blue" />
        <StatCard label="Faculty/Staff" value={users.filter(u => ['FACULTY','STAFF'].includes(u.role)).length} icon={HiUserGroup} color="purple" />
        <StatCard label="Other"         value={users.filter(u => !['STUDENT','FACULTY','STAFF'].includes(u.role)).length} icon={HiUserGroup} color="green" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">{users.length} awaiting review</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="tbl w-full">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Department / Program</th>
                <th>Campus ID</th>
                <th>Submitted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400 text-sm">Loading…</td></tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
                        <HiCheck className="w-6 h-6 text-emerald-500" />
                      </div>
                      <p className="text-sm font-semibold text-slate-700">All caught up</p>
                      <p className="text-xs text-slate-400">No pending registrations to review.</p>
                    </div>
                  </td>
                </tr>
              ) : users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-sm font-bold text-amber-600 flex-shrink-0">
                        {ROLE_EMOJI[u.role] || u.full_name?.[0] || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {u.full_name || `${u.first_name} ${u.last_name}`}
                        </p>
                        <p className="text-xs text-slate-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td><Badge variant={ROLE_COLORS[u.role] || 'default'}>{u.role}</Badge></td>
                  <td>
                    <div className="text-xs">
                      <p className="text-slate-700">{u.department || '—'}</p>
                      {u.program && <p className="text-slate-400">{u.program}</p>}
                    </div>
                  </td>
                  <td>
                    <span className="font-mono text-xs bg-slate-50 px-2 py-1 rounded-lg">
                      {u.university_id || '—'}
                    </span>
                  </td>
                  <td>
                    <span className="text-xs text-slate-500">
                      {u.date_joined || u.created_at
                        ? new Date(u.date_joined || u.created_at).toLocaleString()
                        : '—'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2 justify-end pr-2">
                      <button
                        onClick={() => handleApprove(u)}
                        disabled={busyId === u.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white transition-all active:scale-95 disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}
                        title="Approve registration → user can sign in + receives welcome email"
                      >
                        <HiCheck className="w-3.5 h-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => { setRejectingUser(u); setRejectReason('') }}
                        disabled={busyId === u.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-red-600 hover:text-white border border-red-200 hover:border-red-600 hover:bg-red-600 bg-white transition-all active:scale-95 disabled:opacity-50"
                        title="Reject — keeps the row for audit and emails the user"
                      >
                        <HiX className="w-3.5 h-3.5" />
                        Reject
                      </button>
                      <button
                        onClick={() => handleDelete(u)}
                        disabled={busyId === u.id}
                        className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-50"
                        title="Hard-delete (spam / test accounts only — cannot be undone)"
                      >
                        <HiTrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject confirmation modal */}
      {rejectingUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }}
          onClick={() => !busyId && setRejectingUser(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div
              className="px-6 py-4 flex items-center justify-between border-b border-slate-200"
              style={{ background: 'linear-gradient(135deg, #b91c1c, #ef4444)' }}
            >
              <div className="flex items-center gap-3 text-white">
                <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center">
                  <HiExclamation className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-sm leading-tight">Reject registration?</p>
                  <p className="text-red-100 text-xs">{rejectingUser.email}</p>
                </div>
              </div>
              <button
                onClick={() => !busyId && setRejectingUser(null)}
                className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                The user will not be able to log in. The account is preserved
                with status <span className="font-bold">REJECTED</span> for
                audit; the reason below is shown to the user when they try to sign in.
              </p>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                  Reason (optional, shown to user)
                </label>
                <textarea
                  className="input min-h-[80px] resize-y"
                  placeholder="e.g. Could not verify identity / duplicate account / outside campus scope"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
              <button
                onClick={() => setRejectingUser(null)}
                disabled={!!busyId}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                disabled={!!busyId}
                className="px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-60 flex items-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, #b91c1c, #ef4444)',
                  boxShadow: '0 4px 16px rgba(239,68,68,0.35)',
                }}
              >
                {busyId ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Rejecting…
                  </>
                ) : (
                  <>
                    <HiX className="w-4 h-4" />
                    Confirm reject
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
