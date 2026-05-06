import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { authApi } from '../../api/auth'
import {
  HiShieldCheck, HiCheck, HiChevronRight, HiChevronLeft,
  HiInformationCircle, HiClock, HiMail, HiArrowRight,
} from 'react-icons/hi'
import toast from 'react-hot-toast'

const ROLES = ['STUDENT', 'FACULTY', 'STAFF', 'PARENT', 'SECURITY', 'ADMIN']
// Departments offered for student enrollment (matches the programs the
// university actually runs). Other roles can type a free-text department.
const DEPARTMENTS = ['BS CS', 'BS IT', 'BS PSY', 'BBA', 'BS BIT']
const ROLE_META = {
  STUDENT:  { emoji: '🎓', color: '#10b981', label: 'Student',       note: 'University ID is auto-generated (e.g. BU-2025-CS-1234)', warn: false },
  FACULTY:  { emoji: '👨‍🏫', color: '#8b5cf6', label: 'Faculty',       note: 'Faculty ID will be assigned (e.g. FAC-2025-CS-1234)', warn: false },
  STAFF:    { emoji: '💼', color: '#3b82f6', label: 'Staff',         note: 'Employee ID will be assigned (e.g. STF-2025-ADM-1234)', warn: false },
  SECURITY: { emoji: '🛡️', color: '#f59e0b', label: 'Security',      note: 'Badge ID will be assigned (e.g. SEC-2025-1234)', warn: false },
  PARENT:   { emoji: '👨‍👩‍👧', color: '#ec4899', label: 'Parent',        note: null, warn: false },
  ADMIN:    { emoji: '⚙️', color: '#ef4444', label: 'Administrator', note: 'Admin accounts require approval from IT Director', warn: true },
}
const ROLE_HOME = {
  STUDENT: '/student', FACULTY: '/faculty', STAFF: '/staff',
  PARENT: '/parent', SECURITY: '/security', ADMIN: '/admin',
  DIRECTOR: '/admin', HR: '/admin',
}

const STEPS = ['Personal Info', 'Security & ID', 'Role Details']

export default function RegisterPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initRole = ROLES.includes(params.get('role')) ? params.get('role') : 'STUDENT'

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  // After a successful registration we land on a "thank you / pending
  // approval" success screen instead of bouncing the user into a portal.
  // Self-registrations are gated by admin review — see auth_module/views.py
  // (UserRegistrationView). The auto-login path stayed in place for
  // future scenarios where a registration might be auto-approved.
  const [submitted, setSubmitted] = useState(null)  // null | { user, requires_approval }
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', username: '', phone_number: '',
    password: '', password_confirm: '', cnic: '',
    role: initRole, department: '', program: '', semester: '', designation: '',
    // Parent → student verification: parent must enter BOTH child's
    // university_id AND child's CNIC. Backend cross-checks; only when the
    // pair matches a real ACTIVE student does registration succeed.
    child_university_id: '', child_cnic: '',
    // Real campus card fields (printed on the physical card).
    // Self-registration only collects enrollment + campus — those two are
    // what the gate uses to recognise the card. Serial / issue date /
    // expiry can be filled in later by an admin via the Edit user modal
    // if they ever become operationally relevant.
    enrollment_number: '', campus: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const meta = ROLE_META[form.role]

  const validate = [
    () => {
      if (!form.first_name.trim() || !form.last_name.trim()) return 'First and last name are required'
      if (!form.email.includes('@')) return 'Valid email is required'
      if (!form.username.trim()) return 'Username is required'
    },
    () => {
      if (form.password.length < 8) return 'Password must be at least 8 characters'
      if (form.password !== form.password_confirm) return 'Passwords do not match'
      if (form.cnic.replace(/\D/g, '').length !== 13) return 'Enter exactly 13 digit CNIC'
    },
    () => {
      if (['STUDENT', 'FACULTY', 'STAFF'].includes(form.role) && !form.department) return 'Department is required'
      if (form.role === 'STUDENT' && !form.program.trim()) return 'Program is required'
      if (form.role === 'PARENT') {
        if (!form.child_university_id.trim()) return "Child's University ID is required"
        if (form.child_cnic.replace(/\D/g, '').length !== 13)
          return "Child's CNIC must be 13 digits. This confirms you are the real parent."
      }
    },
  ]

  const next = () => {
    const err = validate[step]?.()
    if (err) return toast.error(err)
    if (step < 2) setStep(s => s + 1)
    else handleSubmit()
  }

  const handleSubmit = async () => {
    const err = validate[2]?.()
    if (err) return toast.error(err)
    setLoading(true)
    try {
      const payload = {
        first_name: form.first_name, last_name: form.last_name,
        email: form.email, username: form.username, phone_number: form.phone_number,
        password: form.password, password_confirm: form.password_confirm,
        cnic: form.cnic.replace(/\D/g, ''),
        role: form.role, department: form.department, program: form.program,
        ...(form.semester && { semester: parseInt(form.semester, 10) }),
        ...(form.designation && { designation: form.designation }),
        ...(form.child_university_id && { child_university_id: form.child_university_id.trim() }),
        ...(form.child_cnic && { child_cnic: form.child_cnic.replace(/\D/g, '') }),
        // Real campus card fields (admin types these in if the user already
        // has a physical card; otherwise left blank and a card scan can fill
        // them later via OCR).
        ...(form.enrollment_number && { enrollment_number: form.enrollment_number.trim() }),
        ...(form.campus && { campus: form.campus.trim() }),
      }
      const { data } = await authApi.register(payload)

      // ── Pending-approval path (default for self-registrations) ────────
      // Backend returns 201 with `requires_approval: true` and the user
      // payload. Don't auto-login (it would 403 with `pending_approval`)
      // — show a friendly "request submitted" screen and stop.
      if (data?.requires_approval !== false) {
        setSubmitted({
          user: data?.user || { email: form.email, full_name: `${form.first_name} ${form.last_name}`, role: form.role },
          requires_approval: true,
        })
        return
      }

      // ── Auto-active path (e.g. backend later flags certain roles as
      // immediately active). Only reached when requires_approval is
      // explicitly false. Auto-login + redirect.
      const user = await login({ email: form.email, password: form.password })
      toast.success(`Welcome, ${user.first_name}!`)
      navigate(ROLE_HOME[user.role] || '/')
    } catch (err) {
      // Friendly error parsing — surface the FIELD that failed, not just generic msg
      const data = err.response?.data
      const FIELD_LABELS = {
        email: 'Email', username: 'Username', cnic: 'CNIC', password: 'Password',
        password_confirm: 'Password confirmation', first_name: 'First name',
        last_name: 'Last name', university_id: 'University ID', phone_number: 'Phone',
        role: 'Role', department: 'Department', non_field_errors: '',
      }
      let msg = 'Registration failed'
      if (typeof data === 'string') {
        msg = data
      } else if (data && typeof data === 'object') {
        // Find first field with error
        const [field, errs] = Object.entries(data)[0] || []
        const errText = Array.isArray(errs) ? errs[0] : errs
        const label = FIELD_LABELS[field] ?? field
        // Translate common Django messages to friendlier ones
        const friendly = String(errText)
          .replace('user with this email already exists.', 'This email is already registered')
          .replace('user with this username already exists.', 'This username is already taken')
          .replace('user with this cnic already exists.', 'This CNIC is already registered')
          .replace('This password is too common.', 'Password is too common. Pick something more unique.')
          .replace('This password is too short. It must contain at least 8 characters.', 'Password must be at least 8 characters')
          .replace('This password is entirely numeric.', 'Password cannot be all numbers')
          .replace('The password is too similar to the email.', 'Password is too similar to your email')
        msg = label ? `${label}: ${friendly}` : friendly
      }
      toast.error(String(msg), { duration: 5000 })
    } finally { setLoading(false) }
  }

  const inp = "input-dark"

  // ── Pending-approval success view ──────────────────────────────────────
  // Shown after a successful registration. No error UI here — the account
  // is created on the backend and waiting for admin sign-off, which is
  // expected behaviour, not an error.
  if (submitted) {
    return <RegistrationSubmitted info={submitted} navigate={navigate} />
  }

  return (
    <div className="min-h-screen bg-mesh flex items-center justify-center p-6">
      <div className="w-full max-w-md">

        {/* Brand */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-2xl bg-blue-500/20 border border-blue-400/20 flex items-center justify-center">
            <HiShieldCheck className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">Campus Security System</p>
            <p className="text-slate-500 text-xs">Bahria University</p>
          </div>
        </div>

        {/* Step progress */}
        <div className="flex items-center gap-0 mb-8">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step > i ? 'bg-blue-500 text-white' :
                  step === i ? 'bg-blue-600 text-white ring-4 ring-blue-500/20' :
                  'bg-white/10 text-slate-500'
                }`}>
                  {step > i ? <HiCheck className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${step >= i ? 'text-blue-400' : 'text-slate-600'}`}>
                  {label}
                </span>
              </div>
              {i < 2 && <div className={`flex-1 h-px mx-2 mb-4 transition-all ${step > i ? 'bg-blue-500' : 'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        {/* Form card */}
        <div className="glass rounded-3xl p-8">

          {/* Step 0 — Personal */}
          {step === 0 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Personal information</h2>
              <p className="text-slate-400 text-sm mb-6">Your basic details</p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 font-medium block mb-1.5">First Name *</label>
                    <input className={inp} placeholder="Ahmed" value={form.first_name} onChange={e => set('first_name', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-medium block mb-1.5">Last Name *</label>
                    <input className={inp} placeholder="Ali" value={form.last_name} onChange={e => set('last_name', e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5">Email *</label>
                  <input className={inp} type="email" placeholder="ahmed@bahria.edu.pk" value={form.email} onChange={e => set('email', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5">Username *</label>
                  <input className={inp} placeholder="ahmedali" value={form.username} onChange={e => set('username', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5">Phone Number</label>
                  <input className={inp} placeholder="+923001234567" value={form.phone_number} onChange={e => set('phone_number', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Step 1 — Security */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Security & identity</h2>
              <p className="text-slate-400 text-sm mb-6">Set your credentials</p>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5">Password *</label>
                  <input className={inp} type="password" placeholder="Min. 8 characters" value={form.password} onChange={e => set('password', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5">Confirm Password *</label>
                  <input className={inp} type="password" placeholder="Repeat password" value={form.password_confirm} onChange={e => set('password_confirm', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5">
                    CNIC * <span className="text-slate-600">(13 digits, no dashes)</span>
                  </label>
                  <input
                    className={inp}
                    placeholder="3520112345678"
                    maxLength={13}
                    value={form.cnic}
                    onChange={e => set('cnic', e.target.value.replace(/\D/g, '').slice(0, 13))}
                  />
                  <p className="text-slate-600 text-xs mt-1">Enter your Pakistani CNIC without dashes</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — Role */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Role & details</h2>
              <p className="text-slate-400 text-sm mb-5">Choose your role and fill in specifics</p>

              {/* Role picker */}
              <div className="grid grid-cols-3 gap-2 mb-5">
                {ROLES.map(r => {
                  const m = ROLE_META[r]
                  return (
                    <button
                      key={r} type="button"
                      onClick={() => set('role', r)}
                      className="p-3 rounded-xl border text-center transition-all duration-150"
                      style={{
                        background: form.role === r ? `${m.color}15` : 'rgba(255,255,255,0.04)',
                        borderColor: form.role === r ? `${m.color}40` : 'rgba(255,255,255,0.08)',
                      }}
                    >
                      <span className="text-xl block">{m.emoji}</span>
                      <span className={`text-xs font-semibold block mt-1 ${form.role === r ? 'text-white' : 'text-slate-400'}`}>
                        {m.label}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="space-y-3">
                {/* STUDENT */}
                {form.role === 'STUDENT' && <>
                  <div>
                    <label className="text-xs text-slate-400 font-medium block mb-1.5">Department *</label>
                    <select className={inp} value={form.department} onChange={e => set('department', e.target.value)}>
                      <option value="" className="bg-slate-900">Select department…</option>
                      {DEPARTMENTS.map(d => <option key={d} value={d} className="bg-slate-900">{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-medium block mb-1.5">Program *</label>
                    <input className={inp} placeholder="e.g. BS Software Engineering" value={form.program} onChange={e => set('program', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-medium block mb-1.5">Semester</label>
                    <select className={inp} value={form.semester} onChange={e => set('semester', e.target.value)}>
                      <option value="" className="bg-slate-900">Select semester…</option>
                      {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s} className="bg-slate-900">Semester {s}</option>)}
                    </select>
                  </div>
                </>}
                {/* FACULTY */}
                {form.role === 'FACULTY' && <>
                  <div>
                    <label className="text-xs text-slate-400 font-medium block mb-1.5">Department *</label>
                    <input className={inp} placeholder="e.g. Computer Science" value={form.department} onChange={e => set('department', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-medium block mb-1.5">Designation</label>
                    <input className={inp} placeholder="e.g. Assistant Professor" value={form.designation} onChange={e => set('designation', e.target.value)} />
                  </div>
                </>}
                {/* STAFF */}
                {form.role === 'STAFF' && <>
                  <div>
                    <label className="text-xs text-slate-400 font-medium block mb-1.5">Department *</label>
                    <input className={inp} placeholder="e.g. Administration" value={form.department} onChange={e => set('department', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-medium block mb-1.5">Designation</label>
                    <input className={inp} placeholder="e.g. Administrative Officer" value={form.designation} onChange={e => set('designation', e.target.value)} />
                  </div>
                </>}
                {/* PARENT — proof-of-relationship verification */}
                {form.role === 'PARENT' && (
                  <div className="space-y-3">
                    <div className="rounded-xl p-3 border border-pink-400/25 bg-pink-500/10">
                      <p className="text-[11px] text-pink-200 leading-relaxed">
                        <strong>Why we ask for both:</strong> we require your child's
                        University ID <em>and</em> their 13-digit CNIC so only real
                        family members can register. Both must match the same active
                        student account or registration is blocked.
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 font-medium block mb-1.5">
                        Child's University ID *
                      </label>
                      <input
                        className={inp}
                        placeholder="e.g. BU-2025-CS-1234"
                        value={form.child_university_id}
                        onChange={e => set('child_university_id', e.target.value)}
                      />
                      <p className="text-slate-600 text-xs mt-1">
                        Printed on your child's campus card / student portal
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 font-medium block mb-1.5">
                        Child's CNIC * <span className="text-slate-600">(13 digits, no dashes)</span>
                      </label>
                      <input
                        className={inp}
                        placeholder="3520112345678"
                        maxLength={13}
                        value={form.child_cnic}
                        onChange={e => set('child_cnic', e.target.value.replace(/\D/g, '').slice(0, 13))}
                      />
                      <p className="text-slate-600 text-xs mt-1">
                        Pakistani CNIC of your son or daughter. This is what proves you are their parent.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Campus card (optional, for users who already have one) ── */}
                {/* Trimmed to enrollment + campus only — admins can fill the
                    serial / issue / expiry fields later via the Edit user
                    modal if those ever become operationally needed. */}
                {['STUDENT', 'FACULTY', 'STAFF'].includes(form.role) && (
                  <div className="pt-3 mt-3 border-t border-white/8">
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mb-2">
                      Campus card (optional)
                    </p>
                    <p className="text-[11px] text-slate-600 leading-relaxed mb-3">
                      Already have a physical campus card? Add the enrollment number
                      and campus below so the gate recognises you when you tap the
                      card. You can also skip this and an admin can fill it in later.
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-slate-400 font-medium block mb-1.5">Enrollment number</label>
                        <input
                          className={inp}
                          placeholder="e.g. 03-134222-110"
                          value={form.enrollment_number}
                          onChange={e => set('enrollment_number', e.target.value)}
                        />
                        <p className="text-slate-600 text-[10px] mt-1">As printed on the card under "Enrollment:"</p>
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 font-medium block mb-1.5">Campus</label>
                        <input
                          className={inp}
                          placeholder="e.g. Lahore Campus"
                          value={form.campus}
                          onChange={e => set('campus', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {/* Note */}
                {meta.note && (
                  <div
                    className="flex items-start gap-2.5 p-3 rounded-xl text-xs"
                    style={{
                      background: `${meta.color}10`,
                      border: `1px solid ${meta.color}25`,
                      color: meta.color,
                    }}
                  >
                    <HiInformationCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{meta.note}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <button type="button" onClick={() => setStep(s => s - 1)} className="btn-secondary flex-1">
                <HiChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
            <button
              type="button" onClick={next} disabled={loading}
              className="flex-1 py-3 rounded-xl font-semibold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              style={{
                background: step === 2
                  ? `linear-gradient(135deg, ${meta.color}, ${meta.color}cc)`
                  : 'linear-gradient(135deg, #3b82f6, #6366f1)',
                boxShadow: step === 2
                  ? `0 8px 24px ${meta.color}33`
                  : '0 8px 24px rgba(59,130,246,0.25)',
              }}
            >
              {step < 2 ? <>Continue <HiChevronRight className="w-4 h-4" /></> :
               loading ? 'Creating account…' : `Register as ${meta.label}`}
            </button>
          </div>
        </div>

        <p className="text-center text-slate-500 text-xs mt-5">
          Already have an account?{' '}
          <Link to="/" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">Sign in</Link>
        </p>
      </div>
    </div>
  )
}

/* ─── Post-registration success screen ─────────────────────────────────── */

function RegistrationSubmitted({ info, navigate }) {
  const user = info?.user || {}
  const meta = ROLE_META[user.role] || ROLE_META.STUDENT
  const displayName = user.full_name || (user.first_name && `${user.first_name} ${user.last_name || ''}`).trim() || 'there'

  return (
    <div className="min-h-screen bg-mesh flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-9 h-9 rounded-2xl bg-blue-500/20 border border-blue-400/20 flex items-center justify-center">
            <HiShieldCheck className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">Campus Security System</p>
            <p className="text-slate-500 text-xs">Bahria University</p>
          </div>
        </div>

        {/* Success card */}
        <div className="glass rounded-3xl p-8 text-center">
          {/* Success check icon with role accent */}
          <div className="relative mx-auto mb-6 w-20 h-20">
            <div
              className="absolute inset-0 rounded-full blur-xl opacity-50"
              style={{ background: meta.color }}
            />
            <div
              className="relative w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                background: `${meta.color}25`,
                border: `2px solid ${meta.color}50`,
              }}
            >
              <HiCheck className="w-10 h-10" style={{ color: meta.color }} />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">Request submitted!</h1>
          <p className="text-slate-300 text-sm mb-1">
            Thank you{displayName !== 'there' ? `, ${displayName.split(' ')[0]}` : ''}.
            Your registration has been received.
          </p>
          {user.email && (
            <p className="text-slate-500 text-xs mb-6">
              Account: <span className="text-slate-300 font-mono">{user.email}</span>
            </p>
          )}

          {/* Pending banner */}
          <div className="rounded-2xl p-4 mb-5 text-left"
               style={{
                 background: 'rgba(245,158,11,0.10)',
                 border: '1px solid rgba(245,158,11,0.25)',
               }}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center flex-shrink-0">
                <HiClock className="w-4 h-4 text-amber-300" />
              </div>
              <div className="min-w-0">
                <p className="text-amber-200 font-bold text-sm">Pending admin approval</p>
                <p className="text-amber-100/70 text-xs mt-1 leading-relaxed">
                  Your account is waiting for an administrator to review and activate
                  it. This usually happens within one working day.
                </p>
              </div>
            </div>
          </div>

          {/* What to expect */}
          <ul className="text-left space-y-2.5 mb-6 text-xs text-slate-400">
            <li className="flex items-start gap-2.5">
              <HiMail className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <span>You'll receive a <strong className="text-slate-200">confirmation email</strong> the moment your account is approved.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <HiShieldCheck className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <span>Sign-in stays disabled until then. This is by design, not a bug.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <HiInformationCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <span>If a week passes without a decision, contact campus IT and reference your email above.</span>
            </li>
          </ul>

          {/* CTA */}
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
              boxShadow: '0 4px 18px rgba(59,130,246,0.35)',
            }}
          >
            Back to sign in <HiArrowRight className="w-4 h-4" />
          </button>
        </div>

        <p className="text-center text-slate-500 text-xs mt-5">
          Need help?{' '}
          <Link to="/contact" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
            Contact us
          </Link>
        </p>
      </div>
    </div>
  )
}
