import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { authApi } from '../../api/auth'
import StatCard from '../../components/ui/StatCard'
import { StatusBadge } from '../../components/ui/Badge'
// Events module is not yet wired to a backend, sample data is fine here.
import { SAMPLE_EVENTS } from '../../utils/sampleData'
import { HiClock, HiCheckCircle, HiTicket, HiTrendingUp, HiArrowRight } from 'react-icons/hi'

const METHOD_LABEL = { BIOMETRIC: 'Face', CARD: 'Card', MANUAL: 'Manual', RETINA: 'Retina' }

// Used by /faculty AND /staff (Staff/StaffPortal re-exports this file).
export default function FacultyPortal() {
  const { user } = useAuth()

  const [attendance, setAttendance] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    authApi.getAttendance()
      .then(res => {
        if (cancelled) return
        setAttendance(Array.isArray(res.data) ? res.data : [])
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [])

  const { present, late, total, pct, todayEntry, onCampus } = useMemo(() => {
    const total = attendance.length
    const present = attendance.filter(d => d.status === 'PRESENT').length
    const late    = attendance.filter(d => d.status === 'LATE').length
    const pct     = total ? Math.round(((present + late) / total) * 100) : 0
    const today   = new Date().toISOString().slice(0, 10)
    const todayDay = attendance.find(d => d.date === today)
    const todayEntry = todayDay?.entries?.[0] || null
    // On-campus if their latest event today is an ENTRY
    const lastToday = todayDay?.entries?.[todayDay.entries.length - 1]
    const onCampus = lastToday?.type === 'ENTRY'
    return { present, late, total, pct, todayEntry, onCampus }
  }, [attendance])

  const isStaff = user?.role === 'STAFF'

  return (
    <div className="space-y-6">
      {/* Banner — colour flips when off campus so the status reads at a glance. */}
      <div className="rounded-2xl p-7 text-white relative overflow-hidden"
        style={{
          background: onCampus
            ? (isStaff
                ? 'linear-gradient(135deg, #1e40af, #3b82f6, #60a5fa)'
                : 'linear-gradient(135deg, #5b21b6, #7c3aed, #8b5cf6)')
            : 'linear-gradient(135deg, #334155, #475569, #64748b)',
        }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white, transparent 60%)' }} />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-white/70 text-sm font-medium mb-1">Good {getGreeting()},</p>
            <h2 className="text-2xl font-bold">{user?.first_name} {user?.last_name}</h2>
            <p className="text-white/70 text-sm mt-1">
              {user?.designation || (isStaff ? 'Staff' : 'Faculty')} · {user?.department || ''} · {user?.enrollment_number || user?.university_id || ''}
            </p>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-4xl font-black">{loading ? '—' : `${pct}%`}</div>
            <p className="text-white/70 text-xs mt-1">Attendance rate</p>
          </div>
        </div>
        <div className="relative mt-5 inline-flex items-center gap-2.5 bg-white/15 backdrop-blur-sm px-4 py-2 rounded-full">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{
              background: onCampus ? '#bbf7d0' : '#cbd5e1',
              animation: onCampus ? 'pulse 1.5s infinite' : 'none',
            }}
          />
          <span className="text-white text-sm font-bold">
            {loading
              ? 'Loading attendance…'
              : onCampus
                ? 'On campus today'
                : todayEntry
                  ? `Off campus (last seen ${todayEntry.time})`
                  : 'Not detected on campus today'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Attendance Rate" value={loading ? '—' : `${pct}%`}      icon={HiTrendingUp}  color={isStaff ? 'blue' : 'purple'} />
        <StatCard label="Days Present"    value={loading ? '—' : `${present}/${total}`} icon={HiCheckCircle} color="green" />
        <StatCard label="Today's Entry"   value={todayEntry?.time || '—'}        icon={HiClock}       color="blue"
                  trend={todayEntry ? METHOD_LABEL[todayEntry.method] : ''} />
        <StatCard label="Events"          value={SAMPLE_EVENTS.length}           icon={HiTicket}      color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
            <h3 className="text-sm font-bold text-slate-900">Recent Attendance</h3>
            <Link to={isStaff ? '/staff/attendance' : '/faculty/attendance'}
                  className="text-xs text-blue-600 font-semibold flex items-center gap-1">
              View all <HiArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {loading && (
              <div className="px-6 py-12 text-center text-xs text-slate-400">Loading…</div>
            )}
            {!loading && attendance.length === 0 && (
              <div className="px-6 py-12 text-center text-sm text-slate-400">
                No gate activity yet. Your attendance will populate as soon as you enter or exit campus.
              </div>
            )}
            {!loading && attendance.slice(0, 5).map(day => (
              <div key={day.date} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="text-center w-10">
                    <p className="text-xs text-slate-400">{new Date(day.date).toLocaleString('en',{month:'short'})}</p>
                    <p className="text-lg font-bold text-slate-900">{new Date(day.date).getDate()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {new Date(day.date).toLocaleString('en',{weekday:'long'})}
                    </p>
                    {day.entries?.[0] && (
                      <p className="text-xs text-slate-400">
                        Entry {day.entries[0].time} · {METHOD_LABEL[day.entries[0].method] || day.entries[0].method}
                      </p>
                    )}
                  </div>
                </div>
                <StatusBadge status={day.status} />
              </div>
            ))}
          </div>
        </div>

        {/* Events — sample, events module unbuilt */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
            <h3 className="text-sm font-bold text-slate-900">Upcoming Events</h3>
            <Link to={isStaff ? '/staff/profile' : '/faculty/events'}
                  className="text-xs text-blue-600 font-semibold flex items-center gap-1">
              All <HiArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="p-4 space-y-3">
            {SAMPLE_EVENTS.slice(0, 4).map(ev => (
              <div key={ev.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
                <div className="w-9 h-9 rounded-xl bg-purple-100 flex flex-col items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-purple-700">{new Date(ev.date).getDate()}</span>
                  <span className="text-[9px] text-purple-500 uppercase">{new Date(ev.date).toLocaleString('en',{month:'short'})}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{ev.title}</p>
                  <p className="text-[11px] text-slate-400">{ev.time} · {ev.venue}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}
