import { useState, useEffect, useMemo, useCallback } from 'react'
import { authApi } from '../../api/auth'
import StatCard from '../../components/ui/StatCard'
import Badge from '../../components/ui/Badge'
import {
  HiUserAdd, HiSearch, HiRefresh, HiClock, HiLogout,
  HiUserGroup, HiCheckCircle, HiExclamationCircle,
} from 'react-icons/hi'
import toast from 'react-hot-toast'

/**
 * /admin/visitors — list every walk-in visitor security has registered.
 *
 * Shows a filterable table of CNIC-registered visitors with their host,
 * purpose, entry/exit times, and a "Check out" action for visitors who
 * are still on campus.
 */

const STATUS_FILTERS = ['ALL', 'ON_CAMPUS', 'CHECKED_OUT', 'EXPIRED']

const STATUS_VARIANT = {
  ON_CAMPUS:   'success',
  CHECKED_OUT: 'default',
  EXPIRED:     'warning',
}

function formatCnic(cnic) {
  if (!cnic) return '—'
  const digits = String(cnic).replace(/\D/g, '')
  if (digits.length !== 13) return cnic
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`
}

function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

export default function AdminVisitorsPage() {
  const [visitors, setVisitors]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [todayOnly, setTodayOnly]       = useState(false)

  const fetchVisitors = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = { limit: 500 }
      if (todayOnly) params.today = 'true'
      const { data } = await authApi.getVisitors(params)
      setVisitors(Array.isArray(data) ? data : (data?.results || []))
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || err.message)
    } finally {
      setLoading(false)
    }
  }, [todayOnly])
  useEffect(() => { fetchVisitors() }, [fetchVisitors])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return visitors.filter((v) => {
      if (statusFilter !== 'ALL' && v.status !== statusFilter) return false
      if (!q) return true
      return [v.full_name, v.cnic, v.phone_number, v.purpose, v.host_name, v.host_department]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q))
    })
  }, [visitors, search, statusFilter])

  const stats = useMemo(() => ({
    total:        visitors.length,
    on_campus:    visitors.filter(v => v.status === 'ON_CAMPUS').length,
    checked_out:  visitors.filter(v => v.status === 'CHECKED_OUT').length,
    expired:      visitors.filter(v => v.status === 'EXPIRED').length,
  }), [visitors])

  const handleCheckOut = async (visitor) => {
    try {
      const { data } = await authApi.checkOutVisitor(visitor.id)
      setVisitors(prev => prev.map(v => v.id === visitor.id ? { ...v, ...data } : v))
      toast.success(`${visitor.full_name} checked out`, { duration: 3000 })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not check out visitor', { duration: 4000 })
    }
  }

  return (
    <div className="space-y-6">

      {/* Banner */}
      <div className="rounded-2xl p-7 text-white relative overflow-hidden"
           style={{ background: 'linear-gradient(135deg, #5b21b6, #7c3aed, #a855f7)' }}>
        <div className="absolute inset-0 opacity-15"
             style={{ backgroundImage: 'radial-gradient(circle at 85% 30%, white, transparent 55%)' }} />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-purple-200 text-xs uppercase tracking-widest mb-1">Walk-in tracking</p>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <HiUserAdd className="w-6 h-6" /> Visitors
            </h2>
            <p className="text-purple-100 text-sm mt-1">
              Every walk-in registered at the gate via CNIC scan.
            </p>
          </div>
          <button
            onClick={fetchVisitors}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white/15 hover:bg-white/25 backdrop-blur-md transition-all border border-white/20 disabled:opacity-50"
          >
            <HiRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total"        value={stats.total}        icon={HiUserGroup}        color="purple" />
        <StatCard label="On campus"    value={stats.on_campus}    icon={HiCheckCircle}      color="green" />
        <StatCard label="Checked out"  value={stats.checked_out}  icon={HiLogout}           color="slate" />
        <StatCard label="Expired"      value={stats.expired}      icon={HiExclamationCircle} color="amber" />
      </div>

      {/* Toolbar + table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

        <div className="px-6 py-4 border-b border-slate-100 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Visitors</h3>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500">{filtered.length} of {visitors.length}</span>
            <label className="flex items-center gap-1.5 ml-3 text-xs font-semibold text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                checked={todayOnly}
                onChange={e => setTodayOnly(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-purple-600"
              />
              Today only
            </label>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative">
              <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                className="input pl-9 text-xs w-full sm:w-56"
                placeholder="Search name, CNIC, host…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              {STATUS_FILTERS.map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all uppercase tracking-wider ${
                    statusFilter === s ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >{s.replace('_', ' ')}</button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
            <div className="w-8 h-8 border-3 border-slate-200 border-t-purple-600 rounded-full animate-spin" />
            <p className="text-xs font-semibold">Loading visitors…</p>
          </div>
        ) : error ? (
          <div className="m-6 rounded-xl p-4 bg-red-50 border border-red-200">
            <p className="text-sm font-bold text-red-900">Couldn't load visitors</p>
            <p className="text-xs text-red-700 mt-0.5">{error}</p>
            <button onClick={fetchVisitors} className="mt-2 text-xs font-bold text-red-700 hover:text-red-900 underline">
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            No visitors match these filters
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl w-full">
              <thead>
                <tr>
                  <th>Visitor</th>
                  <th>CNIC</th>
                  <th>Host</th>
                  <th>Purpose</th>
                  <th>Entered</th>
                  <th>Exited</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => (
                  <tr key={v.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center text-xs font-bold text-purple-700 flex-shrink-0">
                          {(v.full_name || '?').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{v.full_name}</p>
                          {v.phone_number && (
                            <p className="text-xs text-slate-400 truncate">{v.phone_number}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="font-mono text-xs bg-slate-50 px-2 py-1 rounded-lg whitespace-nowrap">
                        {formatCnic(v.cnic)}
                      </span>
                    </td>
                    <td>
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 truncate">{v.host_name || '—'}</p>
                        {v.host_department && (
                          <p className="text-[11px] text-slate-400 truncate">{v.host_department}</p>
                        )}
                      </div>
                    </td>
                    <td>
                      <p className="text-xs text-slate-600 truncate max-w-[180px]">{v.purpose || '—'}</p>
                    </td>
                    <td>
                      <span className="text-xs font-mono text-slate-600 inline-flex items-center gap-1 whitespace-nowrap">
                        <HiClock className="w-3 h-3 text-slate-400" />
                        {formatDateTime(v.entry_time)}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs font-mono text-slate-600 whitespace-nowrap">
                        {v.exit_time ? formatDateTime(v.exit_time) : '—'}
                      </span>
                    </td>
                    <td>
                      <Badge variant={STATUS_VARIANT[v.status] || 'default'}>
                        {String(v.status || '').replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="text-right pr-4">
                      {v.status === 'ON_CAMPUS' ? (
                        <button
                          onClick={() => handleCheckOut(v)}
                          className="text-xs font-bold text-purple-600 hover:text-purple-800 px-2 py-1 rounded transition-colors flex items-center gap-1 whitespace-nowrap"
                        >
                          <HiLogout className="w-3.5 h-3.5" /> Check out
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
