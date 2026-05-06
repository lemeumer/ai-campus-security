import { useState, useEffect } from 'react'
import {
  HiX, HiCheck, HiCalendar, HiExclamation, HiLink,
} from 'react-icons/hi'
import toast from 'react-hot-toast'
import { authApi } from '../../api/auth'

/**
 * Create / edit modal for campus events.
 *
 * Props:
 *   event    null = create mode; existing event = edit mode
 *   onClose  () => void
 *   onSaved  (event, mode: 'create'|'update') => void
 *
 * `target_roles` is rendered as a chip-toggle row. Selecting nothing means
 * "visible to everyone" — explicitly noted under the field.
 */

const CATEGORIES = ['ACADEMIC', 'SPORTS', 'CULTURAL', 'WORKSHOP', 'SEMINAR', 'NOTICE', 'OTHER']
const STATUSES   = ['DRAFT', 'PUBLISHED', 'CANCELLED']
const ROLES      = ['STUDENT', 'FACULTY', 'STAFF', 'PARENT', 'SECURITY', 'ADMIN']

// HTML <input type="datetime-local"> wants 'YYYY-MM-DDTHH:mm' (no seconds, no TZ).
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(local) {
  if (!local) return null
  const d = new Date(local)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export default function EventModal({ event, onClose, onSaved }) {
  const isEdit = !!event
  const [form, setForm] = useState(() => ({
    title:        event?.title        || '',
    description:  event?.description  || '',
    category:     event?.category     || 'ACADEMIC',
    start_time:   toLocalInput(event?.start_time),
    end_time:     toLocalInput(event?.end_time),
    venue:        event?.venue        || '',
    link:         event?.link         || '',
    target_roles: event?.target_roles || [],
    status:       event?.status       || 'PUBLISHED',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!event) return
    setForm({
      title:        event.title        || '',
      description:  event.description  || '',
      category:     event.category     || 'ACADEMIC',
      start_time:   toLocalInput(event.start_time),
      end_time:     toLocalInput(event.end_time),
      venue:        event.venue        || '',
      link:         event.link         || '',
      target_roles: event.target_roles || [],
      status:       event.status       || 'PUBLISHED',
    })
  }, [event?.id])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const toggleRole = (r) => {
    setForm(f => f.target_roles.includes(r)
      ? { ...f, target_roles: f.target_roles.filter(x => x !== r) }
      : { ...f, target_roles: [...f.target_roles, r] }
    )
  }

  const handleSave = async () => {
    setError(null)
    if (!form.title.trim()) { setError('Title is required'); return }
    if (!form.start_time)   { setError('Start time is required'); return }
    if (form.link && !/^https?:\/\//i.test(form.link.trim())) {
      setError('Link must start with http:// or https://')
      return
    }

    const payload = {
      title:        form.title.trim(),
      description:  form.description.trim(),
      category:     form.category,
      start_time:   fromLocalInput(form.start_time),
      end_time:     fromLocalInput(form.end_time),
      venue:        form.venue.trim(),
      link:         form.link.trim(),
      target_roles: form.target_roles,
      status:       form.status,
    }

    setSaving(true)
    try {
      const { data } = isEdit
        ? await authApi.updateAdminEvent(event.id, payload)
        : await authApi.createAdminEvent(payload)
      toast.success(isEdit ? 'Event updated' : 'Event created')
      onSaved?.(data, isEdit ? 'update' : 'create')
      onClose?.()
    } catch (e) {
      const body = e.response?.data
      const msg = body?.error
        || body?.detail
        || (typeof body === 'object' && body
              ? Object.entries(body).map(([f, v]) => `${f}: ${Array.isArray(v) ? v[0] : v}`).join(' • ')
              : e.message)
      setError(msg || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between border-b border-slate-200"
          style={{ background: 'linear-gradient(135deg,#6d28d9,#a855f7)' }}
        >
          <div className="flex items-center gap-3 text-white">
            <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center">
              <HiCalendar className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">
                {isEdit ? 'Edit event' : 'New event'}
              </p>
              <p className="text-purple-100 text-xs">
                {isEdit ? event.title : 'Create a campus announcement, workshop, or notice'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="rounded-xl p-3 flex items-start gap-2.5 bg-red-50 border border-red-200">
              <HiExclamation className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-800 font-medium">{error}</p>
            </div>
          )}

          <Field label="Title *">
            <input
              className="input"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Tech Talk: Modern AI in Pakistan"
            />
          </Field>

          <Field label="Description">
            <textarea
              className="input min-h-[90px] resize-y"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What's the event about? Who should attend? What to bring?"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start time *">
              <input
                className="input"
                type="datetime-local"
                value={form.start_time}
                onChange={e => set('start_time', e.target.value)}
              />
            </Field>
            <Field label="End time">
              <input
                className="input"
                type="datetime-local"
                value={form.end_time}
                onChange={e => set('end_time', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Venue">
            <input
              className="input"
              value={form.venue}
              onChange={e => set('venue', e.target.value)}
              placeholder="e.g. Auditorium, Block A · Room 204"
            />
          </Field>

          <Field label="External link (optional)">
            <div className="relative">
              <HiLink className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                className="input pl-9"
                type="url"
                value={form.link}
                onChange={e => set('link', e.target.value)}
                placeholder="https://forms.gle/… or https://us02web.zoom.us/…"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Registration form, Zoom link, PDF notice — appears as a button in the portals.
            </p>
          </Field>

          <div>
            <label className="text-[11px] font-semibold text-slate-500 block mb-1.5">
              Target audience
            </label>
            <div className="flex flex-wrap gap-2">
              {ROLES.map(r => {
                const active = form.target_roles.includes(r)
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(r)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                      active
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {r}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              {form.target_roles.length === 0
                ? 'Nothing selected → visible to everyone (all roles).'
                : `Visible only to: ${form.target_roles.join(', ')}.`}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-60 flex items-center gap-2"
            style={{
              background: 'linear-gradient(135deg,#6d28d9,#a855f7)',
              boxShadow: '0 4px 16px rgba(168,85,247,0.35)',
            }}
          >
            {saving ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <HiCheck className="w-4 h-4" />
                {isEdit ? 'Save changes' : 'Create event'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-slate-500 block mb-1.5">{label}</label>
      {children}
    </div>
  )
}
