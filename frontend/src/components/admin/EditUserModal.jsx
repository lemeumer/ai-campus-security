import { useState, useEffect } from 'react'
import {
  HiX, HiCheck, HiUser, HiIdentification, HiExclamation,
  HiLockClosed, HiPhone, HiKey,
} from 'react-icons/hi'
import toast from 'react-hot-toast'
import { authApi } from '../../api/auth'

/**
 * Admin-only modal for editing every field on a user record.
 *
 * What admins can edit:
 *   identity      first_name, last_name, email, username, phone_number, cnic
 *   id            university_id (override of auto-generated), enrollment_number
 *   role/status   role, status, is_active, is_verified, department, program,
 *                 semester, designation
 *   campus card   campus, card_serial_no, card_issued_on, card_valid_upto
 *   emergency     emergency_contact_name, emergency_contact_phone
 *   password      "Reset password" sub-section (sets a new password and revokes
 *                  active sessions)
 *
 * What's intentionally NOT here:
 *   is_staff      Django superuser flag — toggling it bypasses every permission
 *                  check, only safe to set from the shell
 *   profile_picture  needs a multipart upload flow, separate concern
 *
 * Props:
 *   user      the user record to edit (read on open, never mutated in place)
 *   onClose   () => void
 *   onSaved   (updatedUser) => void   called after a successful PATCH
 */

const ROLE_OPTIONS = ['STUDENT', 'FACULTY', 'STAFF', 'PARENT', 'SECURITY', 'ADMIN', 'DIRECTOR', 'HR']
const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'GRADUATED']

export default function EditUserModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState(() => extractForm(user))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Password reset is opt-in per modal-open: admin clicks "Reset password"
  // to expose the input, types a new value, and submits. Hidden by default
  // so the field doesn't get accidentally submitted.
  const [showPwReset, setShowPwReset] = useState(false)
  const [newPassword, setNewPassword] = useState('')

  // Reset form whenever a different user is opened
  useEffect(() => {
    setForm(extractForm(user))
    setError(null)
    setShowPwReset(false)
    setNewPassword('')
  }, [user?.id])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true); setError(null)
    try {
      // Diff vs. the originally-loaded user; only changed fields go on the wire.
      const original = extractForm(user)
      const payload = {}
      for (const k of Object.keys(form)) {
        if (form[k] !== original[k]) payload[k] = form[k]
      }
      if (showPwReset && newPassword.trim()) {
        if (newPassword.length < 8) {
          setError('New password must be at least 8 characters'); setSaving(false); return
        }
        payload.password = newPassword
      }
      if (Object.keys(payload).length === 0) {
        toast('No changes to save', { icon: 'ℹ️' })
        onClose?.()
        return
      }
      const { data } = await authApi.updateUser(user.id, payload)
      const passwordChanged = !!payload.password
      toast.success(
        passwordChanged
          ? `Password reset for ${data.full_name || data.email}`
          : `Updated ${data.full_name || data.email}`,
        { duration: 3500 }
      )
      onSaved?.(data)
      onClose?.()
    } catch (err) {
      const msg = err.response?.data?.error
        || err.response?.data?.detail
        || (typeof err.response?.data === 'object'
              ? Object.entries(err.response.data).map(([f, v]) => `${f}: ${Array.isArray(v) ? v[0] : v}`).join(' • ')
              : err.message)
      setError(msg || 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

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
          style={{ background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)' }}
        >
          <div className="flex items-center gap-3 text-white min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center flex-shrink-0">
              <HiUser className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight truncate">Edit user</p>
              <p className="text-blue-100 text-xs truncate">
                {user.full_name || `${user.first_name} ${user.last_name}`} · {user.email}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors flex-shrink-0"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {error && (
            <div className="rounded-xl p-3 flex items-start gap-2.5 bg-red-50 border border-red-200">
              <HiExclamation className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-800 font-medium">{error}</p>
            </div>
          )}

          {/* ── Personal ────────────────────────────────────────────── */}
          <Section title="Personal" icon={HiUser}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name">
                <input className="input" value={form.first_name} onChange={e => set('first_name', e.target.value)} />
              </Field>
              <Field label="Last name">
                <input className="input" value={form.last_name} onChange={e => set('last_name', e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email">
                <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
              </Field>
              <Field label="Username">
                <input className="input" value={form.username} onChange={e => set('username', e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <input className="input" value={form.phone_number} onChange={e => set('phone_number', e.target.value)} />
              </Field>
              <Field label="CNIC (13 digits)">
                <input
                  className="input font-mono"
                  maxLength={13}
                  placeholder="3520112345678"
                  value={form.cnic}
                  onChange={e => set('cnic', e.target.value.replace(/\D/g, '').slice(0, 13))}
                />
              </Field>
            </div>
          </Section>

          {/* ── Role + status + flags ──────────────────────────────── */}
          <Section title="Role & status" icon={HiUser}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role">
                <select className="input" value={form.role} onChange={e => set('role', e.target.value)}>
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Department">
                <input className="input" value={form.department} onChange={e => set('department', e.target.value)} />
              </Field>
              <Field label="Program">
                <input className="input" value={form.program} onChange={e => set('program', e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Semester">
                <input
                  className="input"
                  type="number" min="1" max="12"
                  value={form.semester || ''}
                  onChange={e => set('semester', e.target.value)}
                />
              </Field>
              <Field label="Designation">
                <input className="input" value={form.designation} onChange={e => set('designation', e.target.value)} />
              </Field>
            </div>
            {/* Account flags */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <CheckboxField
                label="Login allowed"
                description="Uncheck to lock the account"
                checked={!!form.is_active}
                onChange={v => set('is_active', v)}
              />
              <CheckboxField
                label="Email verified"
                description="Bypass any verification flow"
                checked={!!form.is_verified}
                onChange={v => set('is_verified', v)}
              />
            </div>
          </Section>

          {/* ── System & university IDs ─────────────────────────────── */}
          <Section title="Identifiers" icon={HiIdentification}>
            <p className="text-xs text-slate-500 -mt-1 mb-2">
              The auto-generated System ID is editable in case you want to
              override it; the User ID (UUID) is permanent.
            </p>
            <Field label="System ID (university_id)">
              <input
                className="input font-mono"
                placeholder="BU-2026-CS-1234"
                value={form.university_id}
                onChange={e => set('university_id', e.target.value)}
              />
            </Field>
          </Section>

          {/* ── Campus card ─────────────────────────────────────────── */}
          <Section title="Campus card" icon={HiIdentification}>
            <p className="text-xs text-slate-500 -mt-1 mb-2">
              Fields printed on the user's physical campus card. Filling these
              lets the user pass the gate by tapping the card (no face needed).
            </p>
            <Field label="Enrollment number">
              <input
                className="input font-mono"
                placeholder="03-134222-110"
                value={form.enrollment_number}
                onChange={e => set('enrollment_number', e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Campus">
                <input
                  className="input"
                  placeholder="Lahore Campus"
                  value={form.campus}
                  onChange={e => set('campus', e.target.value)}
                />
              </Field>
              <Field label="Card S.No">
                <input
                  className="input font-mono"
                  placeholder="36192"
                  value={form.card_serial_no}
                  onChange={e => set('card_serial_no', e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Issued on">
                <input
                  className="input"
                  placeholder="SEP-2022"
                  value={form.card_issued_on}
                  onChange={e => set('card_issued_on', e.target.value)}
                />
              </Field>
              <Field label="Valid upto">
                <input
                  className="input"
                  placeholder="SEP-2028"
                  value={form.card_valid_upto}
                  onChange={e => set('card_valid_upto', e.target.value)}
                />
              </Field>
            </div>
          </Section>

          {/* ── Emergency contact ───────────────────────────────────── */}
          <Section title="Emergency contact" icon={HiPhone}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact name">
                <input
                  className="input"
                  placeholder="Father / Mother / Guardian"
                  value={form.emergency_contact_name}
                  onChange={e => set('emergency_contact_name', e.target.value)}
                />
              </Field>
              <Field label="Contact phone">
                <input
                  className="input"
                  placeholder="+92 300 1234567"
                  value={form.emergency_contact_phone}
                  onChange={e => set('emergency_contact_phone', e.target.value)}
                />
              </Field>
            </div>
          </Section>

          {/* ── Password reset (opt-in) ─────────────────────────────── */}
          <Section title="Password" icon={HiKey}>
            {!showPwReset ? (
              <button
                type="button"
                onClick={() => setShowPwReset(true)}
                className="text-xs font-bold text-red-600 hover:text-red-800 px-3 py-2 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 transition-all flex items-center gap-2"
              >
                <HiLockClosed className="w-3.5 h-3.5" />
                Reset password
              </button>
            ) : (
              <div className="space-y-2">
                <div className="rounded-lg p-2.5 flex items-start gap-2 bg-amber-50 border border-amber-200">
                  <HiExclamation className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-800 leading-snug">
                    The user will be signed out of every active session and will
                    need to log in again with the new password. Communicate the
                    new password to them through a secure channel.
                  </p>
                </div>
                <Field label="New password (min 8 characters)">
                  <input
                    className="input font-mono"
                    type="text"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => { setShowPwReset(false); setNewPassword('') }}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                >
                  Cancel password reset
                </button>
              </div>
            )}
          </Section>

          {/* ── Read-only reference ─────────────────────────────────── */}
          <div className="rounded-xl p-3 bg-slate-50 border border-slate-200">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Read-only</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">User UUID</span><span className="font-mono text-slate-700 truncate ml-2">{user.id?.slice(0, 8)}…</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Joined</span><span className="text-slate-700 truncate ml-2">{user.date_joined ? new Date(user.date_joined).toLocaleDateString() : '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Last login</span><span className="text-slate-700 truncate ml-2">{user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Face enrolled</span><span className="text-slate-700 truncate ml-2">{user.is_face_enrolled ? 'Yes' : 'No'}</span></div>
            </div>
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
              background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
              boxShadow: '0 4px 16px rgba(59,130,246,0.35)',
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
                Save changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function extractForm(user) {
  if (!user) return {}
  return {
    first_name:               user.first_name               || '',
    last_name:                user.last_name                || '',
    email:                    user.email                    || '',
    username:                 user.username                 || '',
    phone_number:             user.phone_number             || '',
    cnic:                     user.cnic                     || '',
    role:                     user.role                     || 'STUDENT',
    status:                   user.status                   || 'ACTIVE',
    is_active:                user.is_active                ?? true,
    is_verified:              user.is_verified              ?? false,
    department:               user.department               || '',
    program:                  user.program                  || '',
    semester:                 user.semester                 || '',
    designation:              user.designation              || '',
    university_id:            user.university_id            || '',
    enrollment_number:        user.enrollment_number        || '',
    campus:                   user.campus                   || '',
    card_serial_no:           user.card_serial_no           || '',
    card_issued_on:           user.card_issued_on           || '',
    card_valid_upto:          user.card_valid_upto          || '',
    emergency_contact_name:   user.emergency_contact_name   || '',
    emergency_contact_phone:  user.emergency_contact_phone  || '',
  }
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="w-4 h-4 text-slate-400" />}
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">{title}</h3>
      </div>
      {children}
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

function CheckboxField({ label, description, checked, onChange }) {
  return (
    <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 mt-0.5 rounded accent-blue-600 cursor-pointer"
      />
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-800">{label}</p>
        {description && <p className="text-[10px] text-slate-500 leading-snug">{description}</p>}
      </div>
    </label>
  )
}
