import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { authApi } from '../../api/auth'
import StatCard from '../../components/ui/StatCard'
import {
  HiCheckCircle, HiClock, HiLocationMarker, HiBell,
  HiUserGroup, HiExclamation,
} from 'react-icons/hi'

/**
 * Parent portal — shows the parent's actual linked children, not hardcoded data.
 *
 * Data flow:
 *   AuthContext.user.children   ← real list from ParentStudentRelation table
 *   authApi.getStudentActivity  ← gate-entry history for the selected child,
 *                                  used to derive IN/OUT and last entry/exit.
 */
export default function ParentPortal() {
  const { user } = useAuth()
  const children = user?.children || []

  const [selectedId, setSelectedId] = useState(null)
  const [activity, setActivity]     = useState([])
  const [loading, setLoading]       = useState(false)

  // Default-select the first child once the user loads
  useEffect(() => {
    if (!selectedId && children.length > 0) {
      setSelectedId(children[0].id)
    }
  }, [children, selectedId])

  const child = useMemo(
    () => children.find((c) => c.id === selectedId) || null,
    [children, selectedId]
  )

  // Fetch this child's recent gate entries for the activity feed + IN/OUT state
  const loadActivity = useCallback(async (studentId) => {
    if (!studentId) return
    setLoading(true)
    try {
      const res = await authApi.getStudentActivity(studentId)
      setActivity(res.data || [])
    } catch {
      setActivity([])
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { loadActivity(selectedId) }, [selectedId, loadActivity])

  // Derived state — last entry/exit times and current on-campus status
  const { onCampus, lastEntry, lastExit, todayCount } = useMemo(() => {
    const today = new Date().toDateString()
    const entries = activity.filter(a => a.type === 'ENTRY')
    const exits   = activity.filter(a => a.type === 'EXIT')
    const todayEntries = activity.filter(a => new Date(a.timestamp).toDateString() === today)
    // The latest event determines IN/OUT
    const latest = activity[0]
    return {
      onCampus:   latest?.type === 'ENTRY',
      lastEntry:  entries[0] ? new Date(entries[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
      lastExit:   exits[0]   ? new Date(exits[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })   : null,
      todayCount: todayEntries.length,
    }
  }, [activity])

  // ─── No children linked ─────────────────────────────────────────────────
  if (children.length === 0) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl p-7 text-white relative overflow-hidden"
             style={{ background: 'linear-gradient(135deg, #be185d, #ec4899, #f472b6)' }}>
          <h2 className="text-2xl font-bold">Parent Portal</h2>
          <p className="text-pink-100 text-sm mt-1">
            Welcome, {user?.first_name}.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
            <HiExclamation className="w-8 h-8 text-amber-500" />
          </div>
          <p className="text-base font-bold text-slate-800">No children linked to your account</p>
          <p className="text-sm text-slate-500 max-w-md">
            An administrator hasn't yet linked any students to your parent profile.
            Please contact the registrar to have your child's record connected.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Banner ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-7 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #be185d, #ec4899, #f472b6)' }}>
        <div className="absolute inset-0 opacity-10"
             style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white, transparent 60%)' }} />
        <div className="relative">
          <p className="text-pink-100 text-sm mb-1">Parent Portal</p>
          <h2 className="text-2xl font-bold">Child Campus Monitor</h2>
          <p className="text-pink-200 text-sm mt-1">
            Real-time updates on your {children.length === 1 ? "child's" : "children's"} campus activity
          </p>
        </div>
        <div className="relative mt-4 inline-flex items-center gap-2 bg-white/15 px-3 py-1.5 rounded-full">
          <HiBell className="w-3.5 h-3.5 text-white" />
          <span className="text-white text-xs font-semibold">
            {children.length} {children.length === 1 ? 'child' : 'children'} linked
          </span>
        </div>
      </div>

      {/* ── Child selector ───────────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap">
        {children.map((c) => {
          const isActive = selectedId === c.id
          return (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className="flex items-center gap-3 p-4 rounded-2xl border transition-all"
              style={{
                background:  isActive ? '#fdf2f8' : '#fff',
                borderColor: isActive ? '#f9a8d4' : '#f1f5f9',
                boxShadow:   isActive ? '0 4px 14px rgba(236,72,153,0.15)' : '',
              }}
            >
              <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center text-pink-700 font-bold">
                {c.full_name?.[0] || '?'}
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-slate-900">{c.full_name}</p>
                <p className="text-xs text-slate-400">{c.university_id || c.email}</p>
                {c.relationship && (
                  <p className="text-[10px] text-pink-500 font-semibold uppercase tracking-wider mt-0.5">
                    {c.relationship}
                  </p>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {child && (
        <>
          {/* ── Stats ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Status"
              value={loading ? '—' : (onCampus ? 'On Campus' : 'Off Campus')}
              icon={HiLocationMarker}
              color={onCampus ? 'green' : 'slate'}
            />
            <StatCard label="Last Entry"   value={lastEntry || '—'}             icon={HiClock} color="blue" />
            <StatCard label="Last Exit"    value={lastExit  || (onCampus ? 'Still inside' : '—')} icon={HiClock} color="purple" />
            <StatCard label="Today's Visits" value={todayCount}                  icon={HiCheckCircle} color="green" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Child details */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-5">Student Details</h3>
              <div className="space-y-3.5">
                {[
                  ['Full Name',    child.full_name],
                  ['Campus ID',    child.university_id || '—'],
                  ['Program',      child.program || '—'],
                  ['Department',   child.department || '—'],
                  ['Semester',     child.semester ? `Semester ${child.semester}` : '—'],
                  ['Account',      child.status],
                  ['Relationship', child.relationship || '—'],
                ].map(([label, val]) => (
                  <div key={label} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                    <span className="text-xs text-slate-400 font-medium">{label}</span>
                    <span className="text-sm font-semibold text-slate-800">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Activity feed */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-50">
                <h3 className="text-sm font-bold text-slate-900">Recent Activity</h3>
              </div>
              <div className="p-5 space-y-3">
                {loading && (
                  <div className="py-12 flex flex-col items-center gap-2 text-slate-400">
                    <div className="w-6 h-6 border-2 border-slate-200 border-t-pink-600 rounded-full animate-spin" />
                    <p className="text-xs">Loading activity…</p>
                  </div>
                )}
                {!loading && activity.length === 0 && (
                  <div className="py-12 flex flex-col items-center gap-2 text-slate-400">
                    <HiUserGroup className="w-8 h-8 opacity-50" />
                    <p className="text-xs font-semibold">No gate activity yet</p>
                    <p className="text-[11px] text-slate-400 max-w-xs text-center">
                      Entries will appear here as soon as your child enters or exits the campus.
                    </p>
                  </div>
                )}
                {!loading && activity.map((act) => (
                  <div
                    key={act.id}
                    className="flex items-start gap-3 p-3 rounded-xl"
                    style={{ background: act.type === 'ENTRY' ? '#f0fdf4' : '#eff6ff' }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                      style={{
                        background: act.type === 'ENTRY' ? '#dcfce7' : '#dbeafe',
                        color:      act.type === 'ENTRY' ? '#16a34a' : '#1d4ed8',
                      }}
                    >
                      {act.type === 'ENTRY' ? '→' : '←'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800">{act.description}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(act.timestamp).toLocaleString('en-GB', {
                          day: 'numeric', month: 'short',
                          hour: '2-digit', minute: '2-digit',
                        })}
                        {act.method && <span className="ml-1.5 text-slate-300">· {act.method}</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  )
}
