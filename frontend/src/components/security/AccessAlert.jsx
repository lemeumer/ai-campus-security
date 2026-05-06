import { useEffect, useRef } from 'react'
import { HiX, HiShieldExclamation, HiBan } from 'react-icons/hi'

/**
 * Full-screen red alert that fires when a gate scan is denied.
 *
 * What it does:
 *   - Full-viewport red overlay that fades in fast and pulses for ~600ms
 *   - Short two-tone error beep via the Web Audio API (no asset download)
 *   - Big "ACCESS DENIED" panel with the reason and detected ID (if any)
 *   - Auto-dismisses after `autoDismissMs`, OR can be clicked through
 *
 * Why this exists:
 *   The dashboard already shows a toast on denial, but security guards need
 *   something they cannot miss when they look up from the camera. A whole-
 *   screen red flash + audible beep is the standard pattern at gates.
 *
 * Props:
 *   open            boolean — when true the alert is mounted and active
 *   onClose         () => void — called when the user dismisses
 *   reason          short string shown beneath the heading
 *   subjectLabel    optional name / ID line under the reason
 *   autoDismissMs   defaults to 4500. Set to 0 to disable auto-dismiss.
 *   playSound       defaults to true. Set false to suppress the beep.
 */
export default function AccessAlert({
  open,
  onClose,
  reason = 'Access denied',
  subjectLabel = null,
  autoDismissMs = 4500,
  playSound = true,
}) {
  const audioCtxRef = useRef(null)

  // Auto-dismiss timer
  useEffect(() => {
    if (!open || !autoDismissMs) return
    const t = setTimeout(() => onClose?.(), autoDismissMs)
    return () => clearTimeout(t)
  }, [open, autoDismissMs, onClose])

  // Play the beep when the alert opens
  useEffect(() => {
    if (!open || !playSound) return
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      const ctx = audioCtxRef.current ?? new Ctx()
      audioCtxRef.current = ctx

      // Two-tone error beep: high then low, 150ms each, square wave for urgency
      const now = ctx.currentTime
      const beep = (freq, start, durMs) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.setValueAtTime(freq, now + start)
        // Quick envelope so it doesn't click
        gain.gain.setValueAtTime(0, now + start)
        gain.gain.linearRampToValueAtTime(0.18, now + start + 0.01)
        gain.gain.linearRampToValueAtTime(0, now + start + durMs / 1000)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now + start)
        osc.stop(now + start + durMs / 1000)
      }
      beep(880, 0,    150)
      beep(560, 0.18, 200)
    } catch (e) {
      // Audio gracefully degrades — alert still works visually.
      console.warn('AccessAlert: audio beep failed', e)
    }
  }, [open, playSound])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 cursor-pointer"
      onClick={onClose}
      role="alertdialog"
      aria-live="assertive"
    >
      {/* Red flash backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, rgba(220,38,38,0.55) 0%, rgba(127,29,29,0.92) 100%)',
          animation: 'access-alert-pulse 0.6s ease-out',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Center panel */}
      <div
        className="relative max-w-lg w-full rounded-3xl shadow-2xl text-center px-8 py-10"
        style={{
          background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
          border: '2px solid rgba(255,255,255,0.25)',
          boxShadow: '0 30px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dismiss button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
          aria-label="Dismiss"
        >
          <HiX className="w-5 h-5" />
        </button>

        {/* Big icon */}
        <div className="w-24 h-24 rounded-full bg-white/15 border-2 border-white/40 mx-auto mb-5 flex items-center justify-center"
             style={{ animation: 'access-alert-shake 0.5s ease-out' }}>
          <HiBan className="w-14 h-14 text-white" strokeWidth={2.5} />
        </div>

        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-red-100 mb-2">
          Gate Alert
        </p>
        <h1 className="text-4xl font-black text-white mb-3 tracking-tight">
          Access Denied
        </h1>

        <p className="text-base text-red-50 leading-relaxed mb-2">
          {reason}
        </p>
        {subjectLabel && (
          <p className="text-xs font-mono text-red-200 mt-1">{subjectLabel}</p>
        )}

        <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 border border-white/20 text-xs font-bold text-white uppercase tracking-widest">
          <HiShieldExclamation className="w-3.5 h-3.5" />
          Logged · Tap anywhere to dismiss
        </div>
      </div>

      {/* Inline keyframes (Tailwind doesn't ship these) */}
      <style>{`
        @keyframes access-alert-pulse {
          0%   { opacity: 0; }
          30%  { opacity: 1; }
          70%  { opacity: 0.85; }
          100% { opacity: 1; }
        }
        @keyframes access-alert-shake {
          0%, 100% { transform: rotate(0deg); }
          20%      { transform: rotate(-8deg); }
          40%      { transform: rotate(7deg); }
          60%      { transform: rotate(-4deg); }
          80%      { transform: rotate(3deg); }
        }
      `}</style>
    </div>
  )
}
