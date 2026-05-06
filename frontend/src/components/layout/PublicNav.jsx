import { Link, NavLink } from 'react-router-dom'
import { useState } from 'react'
import { HiShieldCheck, HiArrowRight, HiMenu, HiX } from 'react-icons/hi'

/**
 * Top navigation bar for all public-facing pages (landing, About, Features,
 * Contact, Register, role login). Fixed dark-glass styling so it sits cleanly
 * over the bg-mesh background used across these pages.
 *
 * The "Sign in" link points to `/` (the role picker). "Register" is the only
 * other action surfaced here. Every other auth flow lives behind a role
 * choice, which is why we send users through the picker first.
 */

const LINKS = [
  { to: '/',         label: 'Home' },
  { to: '/features', label: 'Features' },
  { to: '/about',    label: 'About' },
  { to: '/contact',  label: 'Contact' },
]

export default function PublicNav() {
  const [open, setOpen] = useState(false)

  return (
    <header className="px-6 sm:px-10 py-4 flex items-center justify-between flex-shrink-0 relative z-30">
      {/* Brand */}
      <Link to="/" className="flex items-center gap-2.5 group">
        <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/20 flex items-center justify-center backdrop-blur-md group-hover:bg-blue-500/30 transition-colors">
          <HiShieldCheck className="w-4 h-4 text-blue-400" />
        </div>
        <div className="leading-tight">
          <p className="text-white font-bold text-[13px] tracking-tight">
            AI Based <span className="text-gradient">Campus Security</span>
          </p>
          <p className="text-slate-500 text-[9px] font-semibold tracking-[0.18em] uppercase mt-0.5">
            System
          </p>
        </div>
      </Link>

      {/* Desktop links. Frosted pill bar with an active highlight. */}
      <nav className="hidden md:flex items-center gap-1 px-1.5 py-1 rounded-full
        bg-white/[0.04] border border-white/10 backdrop-blur-xl
        shadow-[0_4px_18px_-8px_rgba(2,6,23,0.7)]">
        {LINKS.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) =>
              `relative px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
                isActive
                  ? 'text-white [background:linear-gradient(135deg,rgba(59,130,246,0.25),rgba(139,92,246,0.18))] ring-1 ring-inset ring-white/15'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>

      {/* Desktop actions */}
      <div className="hidden md:flex items-center gap-2">
        <Link
          to="/"
          className="text-[11px] font-bold text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition-all"
        >
          Sign in
        </Link>
        <Link
          to="/register"
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white px-3.5 py-1.5 rounded-lg transition-all active:scale-95"
          style={{
            background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
            boxShadow: '0 4px 18px rgba(59,130,246,0.35)',
          }}
        >
          Get started <HiArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="md:hidden w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-white flex items-center justify-center"
        aria-label="Toggle menu"
      >
        {open ? <HiX className="w-5 h-5" /> : <HiMenu className="w-5 h-5" />}
      </button>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden absolute top-full right-6 mt-2 w-56 rounded-2xl border border-white/10 bg-[#0d1526] backdrop-blur-xl shadow-2xl p-2 space-y-1">
          {LINKS.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  isActive
                    ? 'text-white bg-white/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
          <div className="border-t border-white/5 mt-1 pt-2 space-y-1">
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 rounded-lg text-xs font-bold text-white text-center"
              style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)' }}
            >
              Get started
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
