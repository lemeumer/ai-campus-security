import { useState, useEffect, useMemo, useCallback } from 'react'
import toast from 'react-hot-toast'
import { authApi } from '../../api/auth'
import StatCard from '../../components/ui/StatCard'
import {
  HiClipboardList, HiCheckCircle, HiExclamationCircle, HiXCircle,
  HiRefresh, HiSearch, HiUser, HiShieldCheck, HiLockClosed, HiCamera,
  HiClock, HiChat, HiPaperAirplane,
} from 'react-icons/hi'

/**
 * /admin/logs — aggregated audit log for admin / director / HR.
 *
 * Shows login attempts, gate entries, face enrollment events, and session
 * activity in one chronological feed. Filterable by kind, severity, and a
 * free-text search across actor and detail.
 */

const KIND_META = {
  login:      { label: 'Login',      icon: HiLockClosed,    color: '#3b82f6' },
  gate:       { label: 'Gate',       icon: HiShieldCheck,   color: '#10b981' },
  enrollment: { label: 'Enrollment', icon: HiCamera,        color: '#8b5cf6' },
  session:    { label: 'Session',    icon: HiUser,          color: '#f59e0b' },
}
const SEVERITY_META = {
  ok:    { color: '#16a34a', bg: '#f0fdf4' },
  warn:  { color: '#d97706', bg: '#fffbeb' },
  error: { color: '#dc2626', bg: '#fee2e2' },
}
const KIND_FILTERS     = ['ALL', 'login', 'gate', 'enrollment', 'session']
const SEVERITY_FILTERS = ['ALL', 'ok', 'warn', 'error']

export default function AdminLogsPage() {
  const [entries, setEntries]         = useState([])
  const [counts, setCounts]           = useState({})
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [search, setSearch]           = useState('')
  const [kindFilter, setKindFilter]   = useState('ALL')
  const [sevFilter, setSevFilter]     = useState('ALL')

  const fetchLogs = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = { limit: 500 }
      // Kind/severity filters could be sent server-side; for the demo we
      // fetch all and filter client-side so the user can flip filters
      // without re-hitting the network.
      const { data } = await authApi.getAdminLogs(params)
      setEntries(data.entries || [])
      setCounts(data.counts || {})
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || err.message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { fetchLogs() }, [fetchLogs])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter((e) => {
      if (kindFilter !== 'ALL' && e.kind !== kindFilter) return false
      if (sevFilter  !== 'ALL' && e.severity !== sevFilter) return false
      if (!q) return true
      return [e.title, e.detail, e.actor, e.target, JSON.stringify(e.meta || {})]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q))
    })
  }, [entries, search, kindFilter, sevFilter])

  return (
    <div className="space-y-6">

      {/* Banner */}
      <div className="rounded-2xl p-7 text-white relative overflow-hidden"
           style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b, #334155)' }}>
        <div className="absolute inset-0 opacity-10"
             style={{ backgroundImage: 'radial-gradient(circle at 85% 30%, white, transparent 55%)' }} />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-slate-300 text-xs uppercase tracking-widest mb-1">Audit trail</p>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <HiClipboardList className="w-6 h-6" /> System Logs
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Logins, gate scans, enrollments, and sessions in one feed.
            </p>
          </div>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 backdrop-blur-md transition-all border border-white/15 disabled:opacity-50"
          >
            <HiRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* SMS test panel — verifies the Twilio pipeline without waiting for
          a real gate event. In dev mode (no Twilio creds) the result toast
          tells you the SMS was logged to the Django console instead. */}
      <TestSmsPanel />

      {/* Severity counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total events" value={counts.total ?? '—'} icon={HiClipboardList}      color="blue" />
        <StatCard label="OK"           value={counts.ok ?? '—'}    icon={HiCheckCircle}        color="green" />
        <StatCard label="Warnings"     value={counts.warn ?? '—'}  icon={HiExclamationCircle}  color="amber" />
        <StatCard label="Errors"       value={counts.error ?? '—'} icon={HiXCircle}            color="rose" />
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">

          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Events</h3>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500">{filtered.length} of {entries.length}</span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative">
              <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                className="input pl-9 text-xs w-full sm:w-56"
                placeholder="Search actor, detail, IP…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              {KIND_FILTERS.map((k) => (
                <button
                  key={k}
                  onClick={() => setKindFilter(k)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all uppercase tracking-wider ${
                    kindFilter === k ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >{k}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Severity sub-filter */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-100 bg-slate-50">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Severity:</span>
          {SEVERITY_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setSevFilter(s)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                sevFilter === s
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-500 hover:text-slate-800 border border-slate-200'
              }`}
            >{s}</button>
          ))}
        </div>

        {/* Body */}
        {loading ? (
          <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
            <div className="w-8 h-8 border-3 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-xs font-semibold">Loading logs…</p>
          </div>
        ) : error ? (
          <div className="m-6 rounded-xl p-4 bg-red-50 border border-red-200">
            <p className="text-sm font-bold text-red-900">Couldn't load logs</p>
            <p className="text-xs text-red-700 mt-0.5">{error}</p>
            <button onClick={fetchLogs} className="mt-2 text-xs font-bold text-red-700 hover:text-red-900 underline">
              Try again
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm">
                No log entries match these filters
              </div>
            ) : filtered.map((e) => (
              <LogRow key={e.id} entry={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Sub-components ──────────────────────────────────────────────────── */

function LogRow({ entry }) {
  const kind = KIND_META[entry.kind] || { label: entry.kind, icon: HiClipboardList, color: '#64748b' }
  const sev  = SEVERITY_META[entry.severity] || SEVERITY_META.ok
  const Icon = kind.icon
  const ts   = new Date(entry.timestamp)
  const tsLabel = `${ts.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · ${ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`

  return (
    <div className="px-6 py-3.5 hover:bg-slate-50/50 transition-colors flex items-start gap-4">
      {/* Kind icon */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${kind.color}18`, color: kind.color }}
      >
        <Icon className="w-4 h-4" />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
            style={{ background: `${kind.color}18`, color: kind.color }}
          >
            {kind.label}
          </span>
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
            style={{ background: sev.bg, color: sev.color }}
          >
            {entry.severity}
          </span>
          <p className="text-sm font-semibold text-slate-800 truncate">{entry.title}</p>
        </div>

        <p className="text-xs text-slate-500 mt-0.5 truncate">
          <span className="font-semibold text-slate-700">{entry.actor}</span>
          {entry.target && <> → <span className="font-semibold text-slate-700">{entry.target}</span></>}
          {entry.detail && <> · {entry.detail}</>}
        </p>

        {entry.meta && Object.keys(entry.meta).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {Object.entries(entry.meta)
              .filter(([, v]) => v !== null && v !== undefined && v !== '')
              .slice(0, 5)
              .map(([k, v]) => (
                <span key={k} className="text-[10px] text-slate-400 font-mono">
                  <span className="text-slate-500">{k}=</span>
                  <span className="text-slate-600">{String(v).slice(0, 40)}</span>
                </span>
              ))}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400 flex-shrink-0">
        <HiClock className="w-3 h-3" />
        {tsLabel}
      </div>
    </div>
  )
}

/* ─── Twilio test panel ───────────────────────────────────────────────── */

function TestSmsPanel() {
  const [to, setTo]         = useState('')
  const [body, setBody]     = useState('')
  const [sending, setSending] = useState(false)
  // mode tells us whether the last send was 'live' (real Twilio) or 'dev'
  const [last, setLast]     = useState(null)

  const handleSend = async (e) => {
    e?.preventDefault?.()
    if (!to.trim()) return toast.error('Enter a phone number first')
    setSending(true)
    try {
      const { data } = await authApi.testSms({
        to: to.trim(),
        body: body.trim() || undefined,
      })
      setLast(data)
      if (data.mode === 'live') {
        toast.success(`SMS sent live to ${data.to}`, { duration: 4500 })
      } else if (data.mode === 'dev') {
        toast(
          'Dev mode: SMS was NOT sent. It was logged to the Django console instead. Add Twilio creds to .env to go live.',
          { icon: 'ℹ️', duration: 6000 },
        )
      } else {
        toast.success('Sent', { duration: 3000 })
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || err.message
      toast.error(`Send failed: ${msg}`, { duration: 5000 })
      setLast({ ok: false, mode: 'error', error: msg })
    } finally {
      setSending(false)
    }
  }

  const live = last?.twilio_configured

  return (
    <form
      onSubmit={handleSend}
      className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <HiChat className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Test parent SMS</h3>
            <p className="text-xs text-slate-500">
              Sends through the same pipeline that fires when a student passes the gate.
            </p>
          </div>
        </div>
        <span
          className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full"
          style={{
            background: live ? '#f0fdf4' : '#fffbeb',
            color:      live ? '#15803d' : '#b45309',
            border: `1px solid ${live ? '#86efac' : '#fde68a'}`,
          }}
        >
          {live ? 'Live · Twilio' : 'Dev mode · console only'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="sm:col-span-1">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
            Phone (E.164)
          </label>
          <input
            className="input text-sm font-mono"
            placeholder="+923001234567"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={sending}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
            Message (optional)
          </label>
          <input
            className="input text-sm"
            placeholder="Default: 'AI Campus Security: test message from the admin panel.'"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={sending}
          />
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        <p className="text-[11px] text-slate-400">
          {live
            ? 'Twilio creds are loaded — this will send a real SMS and may use trial credit.'
            : 'No Twilio creds in .env yet. Sends print to the Django console; nothing is delivered.'}
        </p>
        <button
          type="submit"
          disabled={sending}
          className="px-4 py-2 rounded-xl font-bold text-xs text-white transition-all active:scale-95 disabled:opacity-60 flex items-center gap-2"
          style={{
            background: live
              ? 'linear-gradient(135deg, #059669, #10b981)'
              : 'linear-gradient(135deg, #1e40af, #3b82f6)',
            boxShadow: '0 4px 16px rgba(59,130,246,0.3)',
          }}
        >
          {sending ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <HiPaperAirplane className="w-3.5 h-3.5 rotate-90" />
              Send test SMS
            </>
          )}
        </button>
      </div>

      {/* Last-result preview */}
      {last && last.body && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
            {last.mode === 'live' ? 'Sent message' : 'Would-send preview'}
          </p>
          <p className="text-sm text-slate-800 font-mono">{last.body}</p>
          <p className="text-[11px] text-slate-400 mt-1">
            to {last.to}
            {last.mode === 'dev' && <> · logged to Django console (no real send)</>}
          </p>
        </div>
      )}
    </form>
  )
}
