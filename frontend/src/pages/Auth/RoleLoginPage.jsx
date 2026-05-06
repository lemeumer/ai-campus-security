import { useState } from 'react'
import { Link, useNavigate, useParams, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { HiEye, HiEyeOff, HiLockClosed, HiMail, HiArrowLeft } from 'react-icons/hi'
import { HiShieldCheck } from 'react-icons/hi2'
import toast from 'react-hot-toast'
import { ROLES } from './LoginPage'
import { registerDeviceToken, sendDeviceTokenToBackend } from '../../config/firebase'

/**
 * /login/:role — themed sign-in page for one specific role.
 *
 * Role-match is now enforced client-side: if a user's actual role doesn't
 * match the URL's role, we sign them straight back out and show an error
 * telling them which portal to use. Backend still authenticates by
 * email+password only; this is a defense-in-depth at the UX layer so people
 * can't accidentally end up in the wrong portal.
 */

const ROLE_HOME = {
  STUDENT: '/student', FACULTY: '/faculty', STAFF: '/staff',
  PARENT: '/parent', SECURITY: '/security', ADMIN: '/admin',
  DIRECTOR: '/admin', HR: '/admin',
}

// Roles that are allowed to sign in via each themed login URL.
// /login/admin lets ADMIN, DIRECTOR, and HR through because they share an
// admin portal. The others are strict 1:1.
const ALLOWED_ROLES_FOR = {
  STUDENT:  ['STUDENT'],
  FACULTY:  ['FACULTY'],
  STAFF:    ['STAFF'],
  PARENT:   ['PARENT'],
  SECURITY: ['SECURITY'],
  ADMIN:    ['ADMIN', 'DIRECTOR', 'HR'],
}

export default function RoleLoginPage() {
  const { login, logout } = useAuth()
  const navigate = useNavigate()
  const { role: roleParam } = useParams()

  // Find the role config; if URL is /login/foo, redirect back to the picker.
  const role = ROLES.find((r) => r.role.toLowerCase() === roleParam?.toLowerCase())
  if (!role) return <Navigate to="/" replace />

  const [form, setForm]     = useState({ email: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.email || !form.password) return toast.error('Please fill in all fields')
    setLoading(true)
    try {
      // Send `expected_role` so the backend can reject mismatched logins with
      // 403 BEFORE issuing a token. This is the primary enforcement; the
      // client-side check below is defense-in-depth in case an old backend
      // ignores the header.
      const user = await login({ ...form, expected_role: role.role })

      const allowed = ALLOWED_ROLES_FOR[role.role] || [role.role]
      if (!allowed.includes(user.role)) {
        await logout()
        const correctPath = `/login/${user.role.toLowerCase()}`
        toast.error(
          `This is the ${role.label} portal. Your account is ${user.role}. ` +
          `Use the ${user.role} sign-in instead.`,
          { duration: 6000 }
        )
        navigate(correctPath, { replace: true })
        return
      }

      toast.success(`Welcome back, ${user.first_name}!`)

      // ── Register Firebase device token for push notifications ─────────
      // This is non-blocking so login completes even if Firebase fails
      setTimeout(async () => {
        try {
          const token = await registerDeviceToken()
          if (token) {
            await sendDeviceTokenToBackend(token)
            console.log('[Login] Device token registered for push notifications')
          }
        } catch (err) {
          console.warn('[Login] Firebase registration failed (non-blocking):', err)
        }
      }, 500)

      navigate(ROLE_HOME[user.role] || '/')
    } catch (err) {
      const status = err.response?.status
      const data   = err.response?.data
      let msg
      if (status === 429) {
        msg = '🔒 Too many failed attempts. Locked out for 15 minutes. Reset your password if forgotten.'
      } else if (status === 403 && data?.error === 'wrong_portal') {
        // Backend rejected because the credentials authenticate to a different
        // role than this themed login page expects. Show a clear message and
        // bounce them to the right portal.
        const actual = data.actual_role || 'unknown'
        toast.error(
          `Wrong portal. This account is a ${actual}. Use the ${actual} sign-in instead.`,
          { duration: 6000 }
        )
        navigate(`/login/${actual.toLowerCase()}`, { replace: true })
        return
      } else if (status === 401 || status === 400) {
        msg = '❌ Wrong email or password. Please try again.'
      } else if (!err.response) {
        msg = '⚠️ Cannot reach the server. Make sure Django is running on port 8000.'
      } else {
        msg = data?.error || data?.detail
            || (typeof data === 'object' ? Object.values(data)[0]?.[0] : null)
            || 'Invalid credentials'
      }
      toast.error(String(msg), { duration: 5000 })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-mesh">

      {/* ── Header bar (with back link) ──────────────────────────────── */}
      <header className="px-6 sm:px-10 py-4 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition-all"
        >
          <HiArrowLeft className="w-3.5 h-3.5" />
          All portals
        </Link>

        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/20 flex items-center justify-center backdrop-blur-md">
            <HiShieldCheck className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <p className="text-white font-bold text-[11px] tracking-tight hidden sm:block">AI Campus Security</p>
        </div>
      </header>

      {/* ── Centered card ─────────────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-6 py-4">
        <div className="w-full max-w-md">

          {/* Themed glow behind the card */}
          <div className="relative">
            <div
              className="absolute -inset-8 rounded-[40px] blur-3xl opacity-20 pointer-events-none"
              style={{ background: role.gradient }}
            />

            <div
              className="relative glass rounded-3xl p-6 sm:p-8"
              style={{ borderColor: `${role.color}30` }}
            >
              {/* Role emoji + label header */}
              <div className="flex flex-col items-center text-center mb-5">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-3"
                  style={{
                    background: `${role.color}20`,
                    border: `1px solid ${role.color}40`,
                    boxShadow: `0 6px 24px ${role.glow}`,
                  }}
                >
                  <span className="leading-none">{role.emoji}</span>
                </div>
                <span
                  className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
                  style={{ color: role.color }}
                >
                  {role.label} portal
                </span>
                <h1 className="text-xl font-bold text-white tracking-tight mb-1">Sign in</h1>
                <p className="text-slate-400 text-xs leading-relaxed max-w-xs">
                  {role.sub}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                    Email address
                  </label>
                  <div className="relative">
                    <HiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    <input
                      type="email"
                      className="input-dark pl-10"
                      placeholder={`${role.label.toLowerCase()}@example.com`}
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      autoComplete="email"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Password
                    </label>
                    <Link
                      to="/forgot-password"
                      className="text-xs font-medium transition-colors"
                      style={{ color: role.color }}
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <HiLockClosed className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    <input
                      type={showPw ? 'text' : 'password'}
                      className="input-dark pl-10 pr-11"
                      placeholder="••••••••"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showPw ? <HiEyeOff className="w-4 h-4" /> : <HiEye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
                  style={{
                    background: role.gradient,
                    boxShadow: `0 6px 20px ${role.glow}`,
                  }}
                >
                  {loading
                    ? <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Signing in…
                      </span>
                    : <>Sign in to {role.label} portal →</>
                  }
                </button>
              </form>

              {/* Sign-up link */}
              <div className="mt-5 pt-4 border-t border-white/8 text-center">
                <p className="text-slate-500 text-xs">
                  Don't have an account?{' '}
                  <Link
                    to={`/register?role=${role.role}`}
                    className="font-semibold transition-colors"
                    style={{ color: role.color }}
                  >
                    Register as {role.label} →
                  </Link>
                </p>
              </div>
            </div>
          </div>

          {/* Wrong portal hint */}
          <p className="text-center text-slate-500 text-[11px] mt-4">
            Wrong portal? <Link to="/" className="text-blue-400 hover:text-blue-300 font-semibold">Choose another role</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
