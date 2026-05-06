import { useState, useEffect, useMemo } from 'react'
import { authApi } from '../../api/auth'
import {
  HiSearch, HiLocationMarker, HiClock, HiCalendar, HiExternalLink,
} from 'react-icons/hi'
import toast from 'react-hot-toast'

/**
 * /student/events — read-only list of admin-published events targeted at
 * STUDENTS (or "everyone"). Cards link out to the admin-supplied URL when
 * one is set, otherwise stay informational. Faculty / staff / parent
 * portals reuse the same shape via PortalEvents underneath.
 */

const CAT_STYLE = {
  ACADEMIC: { bg: '#eff6ff', color: '#1d4ed8', dot: '#3b82f6' },
  SPORTS:   { bg: '#f0fdf4', color: '#15803d', dot: '#22c55e' },
  CULTURAL: { bg: '#faf5ff', color: '#6d28d9', dot: '#8b5cf6' },
  WORKSHOP: { bg: '#fffbeb', color: '#b45309', dot: '#f59e0b' },
  SEMINAR:  { bg: '#ecfeff', color: '#0e7490', dot: '#06b6d4' },
  NOTICE:   { bg: '#fff1f2', color: '#be123c', dot: '#ef4444' },
  OTHER:    { bg: '#f8fafc', color: '#475569', dot: '#64748b' },
}
const CATEGORIES = ['ALL','ACADEMIC','SPORTS','CULTURAL','WORKSHOP','SEMINAR','NOTICE']

export default function StudentEvents() {
  const [events,  setEvents]  = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [cat,     setCat]     = useState('ALL')

  useEffect(() => {
    setLoading(true)
    authApi.getEvents({ upcoming: 'true', limit: 100 })
      .then(res => setEvents(Array.isArray(res.data) ? res.data : []))
      .catch(() => toast.error('Could not load events'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events.filter(e => {
      if (cat !== 'ALL' && e.category !== cat) return false
      if (!q) return true
      return [e.title, e.venue, e.description].filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q))
    })
  }, [events, search, cat])

  return (
    <div className="space-y-6">
      {/* Top controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <HiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            className="input pl-10 text-sm"
            placeholder="Search events…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 flex-shrink-0 overflow-x-auto">
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                cat === c ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-blue-50 border border-blue-100">
        <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
          <HiCalendar className="w-4 h-4 text-blue-700" />
        </div>
        <div>
          <p className="text-sm font-semibold text-blue-900">Upcoming events</p>
          <p className="text-xs text-blue-600">{filtered.length} showing · {events.length} upcoming</p>
        </div>
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">Loading events…</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <HiCalendar className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-500 font-semibold">No events match</p>
          <p className="text-xs text-slate-400 mt-1">
            {events.length === 0 ? 'No events have been announced yet.' : 'Try a different search or category.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(ev => <EventCard key={ev.id} event={ev} />)}
        </div>
      )}
    </div>
  )
}

function EventCard({ event }) {
  const style = CAT_STYLE[event.category] || CAT_STYLE.OTHER
  const start = new Date(event.start_time)
  const end   = event.end_time ? new Date(event.end_time) : null

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
      <div className="h-1.5 w-full" style={{ background: style.dot }} />

      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start justify-between mb-4">
          <div
            className="w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
            style={{ background: style.bg }}
          >
            <span className="text-base font-black leading-none" style={{ color: style.color }}>
              {start.getDate()}
            </span>
            <span className="text-[10px] font-semibold uppercase" style={{ color: style.color }}>
              {start.toLocaleString('en', { month: 'short' })}
            </span>
          </div>
          <span
            className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide"
            style={{ background: style.bg, color: style.color }}
          >
            {event.category}
          </span>
        </div>

        <h3 className="text-sm font-bold text-slate-900 mb-2 leading-snug">{event.title}</h3>
        {event.description && (
          <p className="text-xs text-slate-500 leading-relaxed mb-3 line-clamp-3">
            {event.description}
          </p>
        )}

        <div className="space-y-1.5 mb-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <HiClock className="w-3.5 h-3.5 flex-shrink-0" />
            {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {end && ` – ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          </div>
          {event.venue && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <HiLocationMarker className="w-3.5 h-3.5 flex-shrink-0" /> {event.venue}
            </div>
          )}
        </div>

        {event.link ? (
          <a
            href={event.link}
            target="_blank" rel="noreferrer"
            className="mt-auto w-full py-2.5 rounded-xl text-xs font-bold text-white transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
            style={{ background: style.dot, boxShadow: `0 4px 12px ${style.dot}44` }}
          >
            Open link <HiExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <div
            className="mt-auto w-full py-2.5 rounded-xl text-xs font-bold text-center"
            style={{ background: style.bg, color: style.color, border: `1px solid ${style.dot}30` }}
          >
            Mark your calendar
          </div>
        )}
      </div>
    </div>
  )
}
