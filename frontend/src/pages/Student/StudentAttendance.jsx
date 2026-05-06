import { useState, useEffect, useMemo } from 'react'
import { authApi } from '../../api/auth'
import { StatusBadge } from '../../components/ui/Badge'
import StatCard from '../../components/ui/StatCard'
import { HiCheckCircle, HiXCircle, HiClock, HiCalendar } from 'react-icons/hi'

const METHOD_LABEL = { BIOMETRIC: '👁 Face Scan', CARD: '🪪 Card', MANUAL: '✍ Manual', RETINA: '👁 Retina' }

export default function StudentAttendance() {
  const [filter, setFilter] = useState('ALL')
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

  const stats = useMemo(() => ({
    present: attendance.filter(a => a.status === 'PRESENT').length,
    absent:  attendance.filter(a => a.status === 'ABSENT').length,
    late:    attendance.filter(a => a.status === 'LATE').length,
    total:   attendance.length,
  }), [attendance])
  const pct = stats.total ? Math.round(((stats.present + stats.late) / stats.total) * 100) : 0
  const filtered = filter === 'ALL' ? attendance : attendance.filter(a => a.status === filter)

  return (
    <div className="space-y-6">

      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mb-1">Spring 2026 Semester</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 border border-blue-100">
          <span className="text-2xl font-black text-blue-700">{pct}%</span>
          <div>
            <p className="text-xs font-bold text-blue-600 leading-tight">Attendance</p>
            <p className="text-[10px] text-blue-400">Rate this semester</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Days Present" value={stats.present} icon={HiCheckCircle} color="green" />
        <StatCard label="Days Absent"  value={stats.absent}  icon={HiXCircle}     color="rose" />
        <StatCard label="Late Arrivals" value={stats.late}   icon={HiClock}       color="amber" />
        <StatCard label="Total Logged"  value={stats.total}  icon={HiCalendar}    color="blue" />
      </div>

      {/* Log table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">Daily Log</h3>
          <div className="flex gap-1.5">
            {['ALL','PRESENT','LATE','ABSENT'].map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  filter === s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-50">
          {loading && (
            <div className="px-6 py-12 text-center text-slate-400 text-sm">Loading…</div>
          )}
          {!loading && attendance.length === 0 && (
            <div className="px-6 py-12 text-center text-slate-400 text-sm">
              No gate activity recorded yet. Your attendance log will populate as soon as you enter or exit campus.
            </div>
          )}
          {!loading && filtered.map(day => (
            <div key={day.date} className="px-6 py-4 hover:bg-slate-50/50 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-4">
                  <div className="w-12 text-center">
                    <p className="text-xs text-slate-400 font-medium">{new Date(day.date).toLocaleString('en',{month:'short'})}</p>
                    <p className="text-xl font-black text-slate-900">{new Date(day.date).getDate()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {new Date(day.date).toLocaleString('en',{weekday:'long'})}
                    </p>
                    <p className="text-xs text-slate-400">{new Date(day.date).toLocaleString('en',{year:'numeric',month:'long',day:'numeric'})}</p>
                  </div>
                </div>
                <StatusBadge status={day.status} />
              </div>

              {day.entries.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 ml-16">
                  {day.entries.map((e, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium"
                      style={{
                        background: e.type === 'ENTRY' ? '#f0fdf4' : '#eff6ff',
                        color: e.type === 'ENTRY' ? '#16a34a' : '#1d4ed8',
                      }}
                    >
                      <span>{e.type === 'ENTRY' ? '→ Entry' : '← Exit'}</span>
                      <span className="font-mono font-bold">{e.time}</span>
                      <span className="text-[10px] opacity-70">{METHOD_LABEL[e.method]}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="ml-16 text-xs text-slate-300 italic">No entries recorded for this day</p>
              )}
            </div>
          ))}
          {!loading && attendance.length > 0 && filtered.length === 0 && (
            <div className="px-6 py-12 text-center text-slate-300 text-sm">No records match this filter</div>
          )}
        </div>
      </div>
    </div>
  )
}
