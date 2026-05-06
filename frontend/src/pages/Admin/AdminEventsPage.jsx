import { useState, useEffect, useCallback, useMemo } from 'react'
import { authApi } from '../../api/auth'
import StatCard from '../../components/ui/StatCard'
import Badge from '../../components/ui/Badge'
import EventModal from '../../components/admin/EventModal'
import {
  HiCalendar, HiPlus, HiSearch, HiPencil, HiTrash,
  HiExternalLink, HiLocationMarker, HiClock, HiUsers,
} from 'react-icons/hi'
import toast from 'react-hot-toast'

/**
 * /admin/events — admin CRUD for campus events. Each event can:
 *   - be targeted at a subset of roles (or visible to ALL when target_roles = [])
 *   - carry an external link admins paste in (registration form, Zoom, PDF…)
 *   - sit in DRAFT until ready, PUBLISHED to show in portals, or CANCELLED
 *     to take down without losing the audit row.
 */

const CATEGORY_COLORS = {
  ACADEMIC: 'info', SPORTS: 'success', CULTURAL: 'purple',
  WORKSHOP: 'warning', SEMINAR: 'info', NOTICE: 'danger', OTHER: 'default',
}
const STATUS_VARIANTS = {
  PUBLISHED: 'success', DRAFT: 'default', CANCELLED: 'danger',
}

export default function AdminEventsPage() {
  const [events, setEvents]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [editing, setEditing] = useState(null)   // event being edited or 'new'

  const fetchEvents = useCallback(() => {
    setLoading(true)
    return authApi.getAdminEvents()
      .then(res => setEvents(Array.isArray(res.data) ? res.data : []))
      .catch(() => toast.error('Could not load events'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events.filter(e => {
      if (statusFilter !== 'ALL' && e.status !== statusFilter) return false
      if (!q) return true
      return [e.title, e.venue, e.category, (e.target_roles || []).join(' ')]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q))
    })
  }, [events, search, statusFilter])

  const stats = useMemo(() => ({
    total:     events.length,
    published: events.filter(e => e.status === 'PUBLISHED').length,
    draft:     events.filter(e => e.status === 'DRAFT').length,
    upcoming:  events.filter(e =>
      e.status === 'PUBLISHED' &&
      new Date(e.end_time || e.start_time) >= new Date()
    ).length,
  }), [events])

  const handleSaved = (saved, mode) => {
    if (mode === 'create') {
      setEvents(prev => [saved, ...prev])
    } else {
      setEvents(prev => prev.map(e => e.id === saved.id ? saved : e))
    }
  }

  const handleDelete = async (event) => {
    const ok = window.confirm(`Delete "${event.title}"? This cannot be undone.`)
    if (!ok) return
    try {
      await authApi.deleteAdminEvent(event.id)
      setEvents(prev => prev.filter(e => e.id !== event.id))
      toast.success('Event deleted')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Delete failed')
    }
  }

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="rounded-2xl p-7 text-white relative overflow-hidden"
           style={{ background: 'linear-gradient(135deg,#6d28d9,#a855f7)' }}>
        <div className="absolute inset-0 opacity-10"
             style={{ backgroundImage: 'radial-gradient(circle at 85% 50%, white, transparent 60%)' }} />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-purple-200 text-sm mb-1">Campus Events</p>
            <h2 className="text-2xl font-bold">Events Management</h2>
            <p className="text-purple-200/80 text-sm mt-1">
              Create announcements, workshops, seminars, and notices that appear in role-specific portals.
            </p>
          </div>
          <button
            onClick={() => setEditing('new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-purple-700 bg-white hover:bg-purple-50 transition-all active:scale-95 flex-shrink-0"
          >
            <HiPlus className="w-4 h-4" />
            New event
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total events" value={stats.total}     icon={HiCalendar} color="purple" />
        <StatCard label="Published"    value={stats.published} icon={HiCalendar} color="green" />
        <StatCard label="Drafts"       value={stats.draft}     icon={HiCalendar} color="amber" />
        <StatCard label="Upcoming"     value={stats.upcoming}  icon={HiClock}    color="blue" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">{filtered.length} events</h3>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                className="input pl-9 text-xs w-full sm:w-56"
                placeholder="Search title or venue…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              {['ALL','PUBLISHED','DRAFT','CANCELLED'].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                    statusFilter === s ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >{s}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="tbl w-full">
            <thead>
              <tr>
                <th>Event</th>
                <th>When</th>
                <th>Audience</th>
                <th>Status</th>
                <th>Link</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400 text-sm">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-16">
                  <div className="flex flex-col items-center gap-2">
                    <HiCalendar className="w-10 h-10 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-700">No events yet</p>
                    <p className="text-xs text-slate-400">Click "New event" to create one</p>
                  </div>
                </td></tr>
              ) : filtered.map(e => (
                <tr key={e.id}>
                  <td>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{e.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant={CATEGORY_COLORS[e.category] || 'default'}>{e.category}</Badge>
                        {e.venue && (
                          <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                            <HiLocationMarker className="w-3 h-3" />
                            {e.venue}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="text-xs">
                      <p className="text-slate-700 font-medium">
                        {new Date(e.start_time).toLocaleDateString()}
                      </p>
                      <p className="text-slate-400">
                        {new Date(e.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {e.end_time && ` – ${new Date(e.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      </p>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1 flex-wrap">
                      <HiUsers className="w-3.5 h-3.5 text-slate-400" />
                      {(e.target_roles && e.target_roles.length > 0)
                        ? e.target_roles.map(r => (
                            <span key={r} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {r}
                            </span>
                          ))
                        : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">EVERYONE</span>
                      }
                    </div>
                  </td>
                  <td><Badge variant={STATUS_VARIANTS[e.status] || 'default'}>{e.status}</Badge></td>
                  <td>
                    {e.link ? (
                      <a
                        href={e.link}
                        target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold max-w-[180px] truncate"
                      >
                        <HiExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{e.link.replace(/^https?:\/\//, '')}</span>
                      </a>
                    ) : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td>
                    <div className="flex items-center gap-2 justify-end pr-2">
                      <button
                        onClick={() => setEditing(e)}
                        className="text-slate-500 hover:text-blue-600 transition-colors p-1.5 rounded-lg hover:bg-blue-50"
                        title="Edit"
                      >
                        <HiPencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(e)}
                        className="text-slate-500 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-red-50"
                        title="Delete"
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

      {/* Modal */}
      {editing && (
        <EventModal
          event={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
