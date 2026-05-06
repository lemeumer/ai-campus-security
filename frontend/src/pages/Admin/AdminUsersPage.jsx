import { useState, useEffect, useMemo, useCallback } from 'react'
import { authApi } from '../../api/auth'
import Badge, { StatusBadge } from '../../components/ui/Badge'
import StatCard from '../../components/ui/StatCard'
import EditUserModal from '../../components/admin/EditUserModal'
import AddUserModal from '../../components/admin/AddUserModal'
import { useAuth } from '../../context/AuthContext'
import {
  HiUsers, HiSearch, HiUserAdd, HiShieldCheck, HiAcademicCap, HiPlus, HiTrash,
} from 'react-icons/hi'
import toast from 'react-hot-toast'

/**
 * /admin/users — dedicated page for browsing and managing all user accounts.
 * Used to be a panel embedded in AdminDashboard; lifted out so the dashboard
 * stays a quick overview and this page can grow with user-management features
 * (edit, suspend, role changes, bulk actions).
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
const ROLE_FILTERS = ['ALL', 'STUDENT', 'FACULTY', 'STAFF', 'SECURITY', 'PARENT', 'ADMIN']

export default function AdminUsersPage() {
  const [users, setUsers]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [editingUser, setEditingUser] = useState(null)
  const [adding, setAdding] = useState(false)
  // Per-row "in flight" lock so a stuck network call can't double-fire
  // Suspend / Delete on the same user.
  const [busyId, setBusyId] = useState(null)
  const { user: currentUser } = useAuth()

  const fetchUsers = useCallback(() => {
    setLoading(true)
    return authApi.getUsers()
      .then(res => {
        const list = res.data?.results || res.data || []
        setUsers(Array.isArray(list) ? list : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleSaved = (updated) => {
    // Patch the row in place so the table reflects the change without a refetch.
    setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, ...updated } : u))
  }

  const handleCreated = (created) => {
    // Prepend the new user so it's visible at the top of the list.
    if (created) setUsers(prev => [created, ...prev])
    else fetchUsers()  // fall back to refetch if response shape was unexpected
  }

  // Toggle a user between ACTIVE and SUSPENDED via PATCH. We update both
  // `status` and `is_active` so login is actually blocked when suspended
  // (UserLoginView gates on both). Optimistic UI: patch the row in place
  // so the table reflects the change without a refetch.
  const handleToggleStatus = async (u) => {
    const becomingActive = u.status !== 'ACTIVE'
    const newStatus      = becomingActive ? 'ACTIVE' : 'SUSPENDED'
    setBusyId(u.id)
    try {
      const { data } = await authApi.updateUser(u.id, {
        status:    newStatus,
        is_active: becomingActive,
      })
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, ...data } : x))
      toast.success(`${becomingActive ? 'Activated' : 'Suspended'} ${data.full_name || u.full_name}`)
    } catch (e) {
      const msg = e.response?.data?.error || e.response?.data?.detail || e.message
      toast.error(msg || `Could not ${becomingActive ? 'activate' : 'suspend'} user`)
    } finally {
      setBusyId(null)
    }
  }

  // Hard delete — backend cascades to face enrolments, gate entries, sessions.
  // Backend also refuses to delete the calling admin or any ADMIN-role user,
  // so the worst the UI can do here is bounce off a 400/403 with a clear msg.
  const handleDelete = async (u) => {
    if (currentUser?.id === u.id) {
      toast.error("You can't delete your own account from here.")
      return
    }
    const ok = window.confirm(
      `Permanently delete ${u.full_name || u.email}?\n\n` +
      `This removes the user, their face enrolments, gate entries, and sessions. ` +
      `It cannot be undone.\n\n` +
      `If you'd rather just block their login, click Suspend instead.`
    )
    if (!ok) return
    setBusyId(u.id)
    try {
      await authApi.deleteUser(u.id)
      setUsers(prev => prev.filter(x => x.id !== u.id))
      toast.success(`${u.full_name || u.email} deleted`)
    } catch (e) {
      const msg = e.response?.data?.error || e.response?.data?.detail || e.message
      toast.error(msg || 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false
      if (!q) return true
      return [u.full_name, u.first_name, u.last_name, u.email, u.university_id, u.department]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q))
    })
  }, [users, search, roleFilter])

  const stats = useMemo(() => ({
    total:    users.length,
    students: users.filter(u => u.role === 'STUDENT').length,
    faculty:  users.filter(u => u.role === 'FACULTY').length,
    active:   users.filter(u => u.status === 'ACTIVE').length,
  }), [users])

  return (
    <div className="space-y-6">

      {/* Banner */}
      <div className="rounded-2xl p-7 text-white relative overflow-hidden"
           style={{ background: 'linear-gradient(135deg, #1e293b, #334155)' }}>
        <div className="absolute inset-0 opacity-10"
             style={{ backgroundImage: 'radial-gradient(circle at 85% 50%, white, transparent 60%)' }} />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-slate-300 text-sm mb-1">User Management</p>
            <h2 className="text-2xl font-bold">All Users</h2>
            <p className="text-slate-400 text-sm mt-1">Browse, search, and manage every account in the system</p>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-white transition-all active:scale-95 flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #047857, #10b981)',
              boxShadow: '0 4px 16px rgba(16,185,129,0.35)',
            }}
          >
            <HiPlus className="w-4 h-4" />
            Add user
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={stats.total}    icon={HiUsers}        color="blue" />
        <StatCard label="Students"    value={stats.students} icon={HiAcademicCap}  color="green" />
        <StatCard label="Faculty"     value={stats.faculty}  icon={HiUserAdd}      color="purple" />
        <StatCard label="Active"      value={stats.active}   icon={HiShieldCheck}  color="amber" />
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">{filtered.length} users</h3>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <div className="relative">
              <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                className="input pl-9 text-xs w-full sm:w-56"
                placeholder="Search name, email or ID…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              {ROLE_FILTERS.map(r => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                    roleFilter === r ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >{r}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="tbl w-full">
            <thead>
              <tr>
                <th>User</th>
                <th>Campus ID</th>
                <th>Department</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400 text-sm">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-300 text-sm">No users found</td></tr>
              ) : filtered.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-sm font-bold text-blue-600 flex-shrink-0">
                        {ROLE_EMOJI[u.role] || u.full_name?.[0] || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{u.full_name || `${u.first_name} ${u.last_name}`}</p>
                        <p className="text-xs text-slate-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td><span className="font-mono text-xs bg-slate-50 px-2 py-1 rounded-lg">{u.university_id || '—'}</span></td>
                  <td><span className="text-sm">{u.department || '—'}</span></td>
                  <td><Badge variant={ROLE_COLORS[u.role] || 'default'}>{u.role}</Badge></td>
                  <td><StatusBadge status={u.status} /></td>
                  <td>
                    <div className="flex items-center gap-3 justify-end pr-2">
                      <button
                        onClick={() => setEditingUser(u)}
                        disabled={busyId === u.id}
                        className="text-xs text-blue-600 font-semibold hover:text-blue-800 transition-colors disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleStatus(u)}
                        disabled={busyId === u.id}
                        className={`text-xs font-semibold transition-colors disabled:opacity-50 ${
                          u.status === 'ACTIVE' ? 'text-red-500 hover:text-red-700' : 'text-emerald-600 hover:text-emerald-800'
                        }`}
                        title={u.status === 'ACTIVE' ? 'Block login (account stays in DB)' : 'Re-enable login'}
                      >
                        {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDelete(u)}
                        disabled={busyId === u.id || currentUser?.id === u.id || u.role === 'ADMIN'}
                        className="text-slate-400 hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={
                          currentUser?.id === u.id ? "You can't delete yourself" :
                          u.role === 'ADMIN'      ? "ADMIN accounts can't be deleted from here" :
                          'Permanently delete user (cascades to face enrolments, gate entries, sessions)'
                        }
                      >
                        <HiTrash className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Add modal */}
      {adding && (
        <AddUserModal
          onClose={() => setAdding(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
