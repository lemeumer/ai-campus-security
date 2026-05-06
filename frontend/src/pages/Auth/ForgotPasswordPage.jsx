import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { HiShieldCheck, HiMail, HiCheckCircle, HiLockClosed, HiArrowLeft } from 'react-icons/hi'
import toast from 'react-hot-toast'

const STEPS = ['email', 'confirm', 'done']

export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams()
  // If the user lands here from the password-reset email (?token=...), jump
  // straight to the new-password step with the token pre-filled.
  const tokenFromUrl = searchParams.get('token') || ''

  const [step, setStep]       = useState(tokenFromUrl ? 'confirm' : 'email')
  const [email, setEmail]     = useState('')
  const [token, setToken]     = useState(tokenFromUrl)
  const [newPw, setNewPw]     = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // If someone navigates here with a token mid-session, sync the state.
    if (tokenFromUrl && tokenFromUrl !== token) {
      setToken(tokenFromUrl)
      setStep('confirm')
    }
  }, [tokenFromUrl])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleRequestReset = async (e) => {
    e.preventDefault()
    if (!email) return toast.error('Email is required')
    setLoading(true)
    try {
      await authApi.requestPasswordReset({ email })
      toast.success('Check your inbox. A reset link has been sent if that email is registered.', { duration: 6000 })
      setStep('confirm')
    } catch (err) {
      if (!err.response) toast.error('⚠️ Cannot reach the server. Is Django running?')
      else toast.error('Reset request failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmReset = async (e) => {
    e.preventDefault()
    if (newPw !== confirm) return toast.error('Passwords do not match')
    if (newPw.length < 8)  return toast.error('Password must be at least 8 characters')
    setLoading(true)
    try {
      await authApi.confirmPasswordReset({ token, new_password: newPw, new_password_confirm: confirm })
      setStep('done')
    } catch {
      toast.error('Invalid or expired token. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-mesh min-h-screen flex">

      {/* ── Left branding panel ───────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 p-10 border-r border-white/5">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
            <HiShieldCheck className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">Campus Security</p>
            <p className="text-slate-500 text-xs">Bahria University</p>
          </div>
        </div>

        {/* Info card */}
        <div className="glass-dark rounded-2xl p-6 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-400/20 flex items-center justify-center">
            <HiLockClosed className="w-6 h-6 text-blue-300" />
          </div>
          <h3 className="text-white font-bold text-lg leading-snug">Secure password recovery</h3>
          <p className="text-slate-400 text-sm leading-relaxed">
            Enter your registered university email and we'll send you a one-time reset token.
            The token expires after 15 minutes for your security.
          </p>
          <div className="space-y-2 pt-2">
            {[
              'Check your university email inbox',
              'Paste the reset token in the next step',
              'Choose a new secure password',
            ].map((txt, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-blue-300">{i + 1}</span>
                </div>
                <p className="text-slate-400 text-xs">{txt}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-600 text-xs">© {new Date().getFullYear()} Bahria University · All rights reserved</p>
      </div>

      {/* ── Right form panel ─────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">

          {/* Step indicator */}
          {step !== 'done' && (
            <div className="flex items-center gap-2 mb-8">
              {['Request', 'Reset', 'Done'].map((label, i) => {
                const idx  = STEPS.indexOf(step)
                const done = i < idx
                const curr = i === idx
                return (
                  <div key={label} className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all"
                        style={curr
                          ? { background: '#3b82f6', color: '#fff' }
                          : done
                            ? { background: '#10b981', color: '#fff' }
                            : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)' }
                        }
                      >
                        {done ? '✓' : i + 1}
                      </div>
                      <span className="text-xs font-medium"
                        style={{ color: curr ? '#93c5fd' : done ? '#6ee7b7' : 'rgba(255,255,255,0.25)' }}>
                        {label}
                      </span>
                    </div>
                    {i < 2 && <div className="w-8 h-px" style={{ background: done ? '#10b981' : 'rgba(255,255,255,0.08)' }} />}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Glass card ───────────────────────────── */}
          <div className="glass rounded-3xl p-8">

            {/* Email step */}
            {step === 'email' && (
              <>
                <div className="w-14 h-14 rounded-2xl bg-blue-500/15 border border-blue-400/20 flex items-center justify-center mb-6">
                  <HiMail className="w-7 h-7 text-blue-300" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-1.5">Reset your password</h2>
                <p className="text-slate-400 text-sm mb-7">Enter the email address tied to your campus account.</p>

                <form onSubmit={handleRequestReset} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1.5 uppercase tracking-wider">University Email</label>
                    <input
                      className="input-dark"
                      type="email"
                      placeholder="you@bahria.edu.pk"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)', boxShadow: '0 4px 16px rgba(59,130,246,0.35)' }}
                  >
                    {loading
                      ? <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Sending…
                        </span>
                      : 'Send Reset Token →'
                    }
                  </button>
                </form>
              </>
            )}

            {/* Confirm step */}
            {step === 'confirm' && (
              <>
                <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-400/20 flex items-center justify-center mb-6">
                  <HiLockClosed className="w-7 h-7 text-amber-300" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-1.5">Enter new password</h2>
                <p className="text-slate-400 text-sm mb-6">
                  {tokenFromUrl
                    ? 'Token loaded from your reset email. Choose a new password below.'
                    : 'Open the reset email we sent you, copy the token, and paste it below.'}
                </p>

                <form onSubmit={handleConfirmReset} className="space-y-4">
                  {[
                    { key: 'token',   label: 'Reset Token',        placeholder: 'Paste token from email',  type: 'text',     val: token,   set: setToken },
                    { key: 'newPw',   label: 'New Password',        placeholder: 'Minimum 8 characters',   type: 'password', val: newPw,   set: setNewPw },
                    { key: 'confirm', label: 'Confirm New Password', placeholder: 'Repeat your password',  type: 'password', val: confirm, set: setConfirm },
                  ].map(({ key, label, placeholder, type, val, set }) => (
                    <div key={key}>
                      <label className="text-xs font-semibold text-slate-400 block mb-1.5 uppercase tracking-wider">{label}</label>
                      <input
                        className="input-dark"
                        type={type}
                        placeholder={placeholder}
                        value={val}
                        onChange={e => set(e.target.value)}
                      />
                    </div>
                  ))}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)', boxShadow: '0 4px 16px rgba(245,158,11,0.35)' }}
                  >
                    {loading
                      ? <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Resetting…
                        </span>
                      : 'Reset Password →'
                    }
                  </button>
                </form>
              </>
            )}

            {/* Done step */}
            {step === 'done' && (
              <div className="text-center py-4">
                <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-400/20 flex items-center justify-center mx-auto mb-6">
                  <HiCheckCircle className="w-10 h-10 text-emerald-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Password updated!</h2>
                <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                  Your password has been reset successfully.<br />You can now sign in with your new credentials.
                </p>
                <Link
                  to="/"
                  className="block w-full py-3 rounded-xl font-bold text-sm text-white text-center transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg,#059669,#10b981)', boxShadow: '0 4px 16px rgba(16,185,129,0.35)' }}
                >
                  Back to Sign In →
                </Link>
              </div>
            )}
          </div>

          {/* Back link */}
          {step !== 'done' && (
            <p className="text-center text-slate-500 text-sm mt-6 flex items-center justify-center gap-1.5">
              <HiArrowLeft className="w-3.5 h-3.5" />
              <Link to="/" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
                Back to sign in
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
