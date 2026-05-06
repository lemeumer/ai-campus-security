import { useState } from 'react'
import {
  HiX, HiCheck, HiUserAdd, HiIdentification, HiExclamation,
  HiKey, HiPhone,
} from 'react-icons/hi'
import toast from 'react-hot-toast'
import { authApi } from '../../api/auth'

/**
 * Admin-only modal for creating a new user account directly. Unlike
 * self-registration, accounts created here are auto-approved (status=ACTIVE,
 * is_active=True) — they skip the pending queue. Backed by
 * POST /api/auth/admin/users/.
 *
 * Required (per backend serializer):
 *   email, username, password, password_confirm,
 *   first_name, last_name, role, cnic
 *
 * Optional: phone_number, department, program, semester, designation,
 *           university_id (auto-generated if blank for STUDENT/FACULTY/STAFF/SECURITY),
 *           campus card fields, child_university_id (PARENT only).
 */

const ROLE_OPTIONS = ['STUDENT', 'FACULTY', 'STAFF', 'PARENT', 'SECURITY', 'ADMIN', 'DIRECTOR', 'HR']
const ROLES_NEEDING_DEPT = ['STUDENT', 'FACULTY', 'STAFF']

const EMPTY = {
  first_name: '', last_name: '', email: '', username: '',
  phone_number: '', cnic: '',
  password: '', password_confirm: '',
  role: 'STUDENT', department: '', program: '', semester: '',
  designation: '',
  university_id: '',
  enrollment_number: '', campus: '', card_serial_no: '',
  card_issued_on: '', card_valid_upto: '',
  child_university_id: '',
  emergency_contact_name: '', emergency_contact_phone: '',
}

export default function AddUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    if (!form.first_name.trim() || !form.last_name.trim()) return 'First and last name are required'
    if (!form.email.includes('@')) return 'Valid email is required'
    if (!form.username.trim()) return 'Username is required'
    if (form.password.length < 8) return 'Password must be at least 8 characters'
    if (form.password !== form.password_confirm) return 'Passwords do not match'
    if (form.cnic.replace(/\D/g, '').length !== 13) return 'CNIC must be exactly 13 digits'
    if (ROLES_NEEDING_DEPT.includes(form.role) && !form.department.trim())
      return 'Department is required for this role'
    if (form.role === 'STUDENT' && !form.program.trim())
      return 'Program is required for students'
    return null
  }

  const handleSave = async () => {
    const err = validate()
    if (err) { setError(err); return }
    setSaving(true); setError(null)
    try {
      // Strip empty strings so backend can apply defaults / nullables cleanly.
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v !== '' && v != null)
      )
      payload.cnic = String(payload.cnic).replace(/\D/g, '')
      if (payload.semester) payload.semester = parseInt(payload.semester, 10)

      const { data } = await authApi.adminCreateUser(payload)
      toast.success(`Created ${data.user?.full_name || data.user?.email}`, { duration: 3500 })
      onCreated?.(data.user)
      onClose?.()
    } catch (e) {
      const body = e.response?.data
      const msg = body?.error
        || body?.detail
        || (typeof body === 'object' && body
              ? Object.entries(body).map(([f, v]) => `${f}: ${Array.isArray(v) ? v[0] : v}`).join(' • ')
              : e.message)
      setError(msg || 'Could not create user')
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
          style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}
        >
          <div className="flex items-center gap-3 text-white min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center flex-shrink-0">
              <HiUserAdd className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight">Add user</p>
              <p className="text-emerald-100 text-xs">Create a new account — auto-approved (no pending queue)</p>
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

          <Section title="Personal" icon={HiUserAdd}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name *">
                <input className="input" value={form.first_name} onChange={e => set('first_name', e.target.value)} />
              </Field>
              <Field label="Last name *">
                <input className="input" value={form.last_name} onChange={e => set('last_name', e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email *">
                <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
              </Field>
              <Field label="Username *">
                <input className="input" value={form.username} onChange={e => set('username', e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <input className="input" value={form.phone_number} onChange={e => set('phone_number', e.target.value)} />
              </Field>
              <Field label="CNIC * (13 digits)">
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

          <Section title="Password" icon={HiKey}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Password * (min 8)">
                <input
                  className="input font-mono"
                  type="text"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                />
              </Field>
              <Field label="Confirm password *">
                <input
                  className="input font-mono"
                  type="text"
                  autoComplete="new-password"
                  value={form.password_confirm}
                  onChange={e => set('password_confirm', e.target.value)}
                />
              </Field>
            </div>
            <p className="text-[11px] text-slate-500">
              Communicate this password to the user through a secure channel — they can change it after first login.
            </p>
          </Section>

          <Section title="Role & department" icon={HiIdentification}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role *">
                <select className="input" value={form.role} onChange={e => set('role', e.target.value)}>
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label={`Department${ROLES_NEEDING_DEPT.includes(form.role) ? ' *' : ''}`}>
                <input className="input" value={form.department} onChange={e => set('department', e.target.value)} />
              </Field>
            </div>
            {(form.role === 'STUDENT' || form.role === 'FACULTY' || form.role === 'STAFF') && (
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Program${form.role === 'STUDENT' ? ' *' : ''}`}>
                  <input className="input" value={form.program} onChange={e => set('program', e.target.value)} />
                </Field>
                {form.role === 'STUDENT' ? (
                  <Field label="Semester">
                    <input className="input" type="number" min="1" max="12" value={form.semester} onChange={e => set('semester', e.target.value)} />
                  </Field>
                ) : (
                  <Field label="Designation">
                    <input className="input" value={form.designation} onChange={e => set('designation', e.target.value)} />
                  </Field>
                )}
              </div>
            )}
            {form.role === 'PARENT' && (
              <Field label="Child's University ID">
                <input
                  className="input font-mono"
                  placeholder="BU-2025-CS-1234"
                  value={form.child_university_id}
                  onChange={e => set('child_university_id', e.target.value)}
                />
              </Field>
            )}
            <Field label="System ID (university_id) — leave blank to auto-generate">
              <input
                className="input font-mono"
                placeholder="auto-generated for STUDENT / FACULTY / STAFF / SECURITY"
                value={form.university_id}
                onChange={e => set('university_id', e.target.value)}
              />
            </Field>
          </Section>

          <Section title="Campus card (optional)" icon={HiIdentification}>
            <p className="text-xs text-slate-500 -mt-1 mb-2">
              Filling these lets the user pass the gate by tapping their card.
              You can add them later via Edit user.
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
                <input className="input" placeholder="Lahore Campus" value={form.campus} onChange={e => set('campus', e.target.value)} />
              </Field>
              <Field label="Card S.No">
                <input className="input font-mono" value={form.card_serial_no} onChange={e => set('card_serial_no', e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Issued on">
                <input className="input" placeholder="SEP-2022" value={form.card_issued_on} onChange={e => set('card_issued_on', e.target.value)} />
              </Field>
              <Field label="Valid upto">
                <input className="input" placeholder="SEP-2028" value={form.card_valid_upto} onChange={e => set('card_valid_upto', e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Emergency contact (optional)" icon={HiPhone}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <input className="input" value={form.emergency_contact_name} onChange={e => set('emergency_contact_name', e.target.value)} />
              </Field>
              <Field label="Phone">
                <input className="input" value={form.emergency_contact_phone} onChange={e => set('emergency_contact_phone', e.target.value)} />
              </Field>
            </div>
          </Section>
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
              background: 'linear-gradient(135deg, #047857, #10b981)',
              boxShadow: '0 4px 16px rgba(16,185,129,0.35)',
            }}
          >
            {saving ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <HiCheck className="w-4 h-4" />
                Create user
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
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
