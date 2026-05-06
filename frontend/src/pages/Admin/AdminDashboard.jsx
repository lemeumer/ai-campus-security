import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../../api/auth'
import StatCard from '../../components/ui/StatCard'
import {
  HiUsers, HiShieldCheck, HiCamera, HiChartBar,
  HiArrowRight, HiClock, HiCheckCircle,
} from 'react-icons/hi'
import { HiChartBarSquare } from 'react-icons/hi2'

/**
 * /admin — entry-point dashboard for Admin/Director/HR.
 *
 * This page is intentionally lightweight: a banner, a few real KPIs computed
 * from the Users + GateEntries APIs, and big tiles linking to the dedicated
 * sub-pages (Users, Face Enrollment, Gate Control, Reports).
 *
 * Heavy lists/tables live on their own pages so this stays a quick overview.
 */

export default function AdminDashboard() {
  const [users, setUsers]       = useState([])
  const [recentLog, setLog]     = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      authApi.getUsers().catch(() => ({ data: [] })),
      authApi.getGateEntries().catch(() => ({ data: [] })),
    ]).then(([uRes, gRes]) => {
      if (cancelled) return
      const uList = uRes.data?.results || uRes.data || []
      setUsers(Array.isArray(uList) ? uList : [])
      setLog(Array.isArray(gRes.data) ? gRes.data : [])
    }).finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [])

  const stats = useMemo(() => {
    const total       = users.length
    const enrolled    = users.filter(u => u.is_face_enrolled).length
    const todayEntries = recentLog.filter(e => {
      // Server returns time as 'HH:MM' so we don't have full date — count all
      // for now; a future endpoint should return ISO timestamps.
      return e.type === 'ENTRY'
    }).length
    return {
      total,
      enrolled,
      coverage: total ? Math.round((enrolled / total) * 100) : 0,
      todayEntries,
    }
  }, [users, recentLog])

  return (
    <div className="space-y-6">

      {/* Banner */}
      <div className="rounded-2xl p-7 text-white relative overflow-hidden"
           style={{ background: 'linear-gradient(135deg, #1e293b, #334155)' }}>
        <div className="absolute inset-0 opacity-10"
             style={{ backgroundImage: 'radial-gradient(circle at 85% 50%, white, transparent 60%)' }} />
        <div className="relative">
          <p className="text-slate-300 text-sm mb-1">System Overview</p>
          <h2 className="text-2xl font-bold">Admin Control Panel</h2>
          <p className="text-slate-400 text-sm mt-1">
            Manage users, monitor gate activity, and configure system settings
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users"       value={loading ? '—' : stats.total}              icon={HiUsers}          color="blue" />
        <StatCard label="Face Enrolled"     value={loading ? '—' : stats.enrolled}           icon={HiCheckCircle}    color="green" />
        <StatCard label="Coverage"          value={loading ? '—' : `${stats.coverage}%`}     icon={HiShieldCheck}    color="purple" />
        <StatCard label="Recent Entries"    value={loading ? '—' : stats.todayEntries}       icon={HiChartBarSquare} color="amber" />
      </div>

      {/* Quick-access tiles for each admin section */}
      <div>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 px-1">Quick access</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <AdminTile
            to="/admin/users"
            label="Users"
            description="Browse, search, edit accounts"
            icon={HiUsers}
            gradient="linear-gradient(135deg,#1e40af,#3b82f6)"
          />
          <AdminTile
            to="/admin/enrollment"
            label="Face Enrollment"
            description="Capture biometric profiles"
            icon={HiCamera}
            gradient="linear-gradient(135deg,#059669,#10b981)"
          />
          <AdminTile
            to="/security"
            label="Gate Control"
            description="Live gate verification"
            icon={HiShieldCheck}
            gradient="linear-gradient(135deg,#d97706,#f59e0b)"
          />
          <AdminTile
            to="/admin/reports"
            label="Reports"
            description="Attendance & gate analytics"
            icon={HiChartBar}
            gradient="linear-gradient(135deg,#7c3aed,#a855f7)"
          />
        </div>
      </div>

      {/* Recent activity widget — real data from gate_entries */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Recent Gate Activity</h3>
            <p className="text-xs text-slate-400 mt-0.5">Latest entry/exit events across all gates</p>
          </div>
          <Link
            to="/security"
            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            View all <HiArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="divide-y divide-slate-50">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs">Loading…</div>
          ) : recentLog.length === 0 ? (
            <div className="py-12 text-center text-slate-300 text-sm">
              No gate activity yet — entries will appear here as they happen
            </div>
          ) : recentLog.slice(0, 6).map((e) => (
            <div key={e.id} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold"
                  style={{
                    background: e.type === 'ENTRY' ? '#dcfce7' : '#dbeafe',
                    color:      e.type === 'ENTRY' ? '#16a34a' : '#1d4ed8',
                  }}>
                  {e.type === 'ENTRY' ? '→' : '←'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{e.name}</p>
                  <p className="text-xs text-slate-400">
                    {e.role} · {e.university_id} · <span className="font-mono">{e.method}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500 flex-shrink-0">
                <HiClock className="w-3 h-3" />
                {e.time}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Tile component ──────────────────────────────────────────────────────────
function AdminTile({ to, label, description, icon: Icon, gradient }) {
  return (
    <Link
      to={to}
      className="block rounded-2xl p-5 text-white relative overflow-hidden transition-transform active:scale-[0.98] hover:shadow-lg"
      style={{ background: gradient }}
    >
      <div className="absolute inset-0 opacity-10"
           style={{ backgroundImage: 'radial-gradient(circle at 85% 30%, white, transparent 55%)' }} />
      <div className="relative">
        <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center mb-3">
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-sm font-bold mb-0.5">{label}</p>
        <p className="text-[11px] text-white/75 leading-snug">{description}</p>
        <div className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider opacity-80">
          Open <HiArrowRight className="w-2.5 h-2.5" />
        </div>
      </div>
    </Link>
  )
}
