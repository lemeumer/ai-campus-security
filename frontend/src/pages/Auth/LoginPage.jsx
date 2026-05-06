import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  HiArrowRight, HiAcademicCap, HiBookOpen, HiBriefcase,
  HiUsers, HiShieldCheck, HiCog, HiSparkles,
} from 'react-icons/hi'
import PublicNav from '../../components/layout/PublicNav'
import Button from '../../components/ui/Button'

/**
 * Landing / role-picker page (route: "/").
 *
 * Layout structure:
 *   Nav  →  Hero (full-viewport)  →  Role grid  →  CTA panel  →  Footer
 *
 * No sign-in form lives on this page; picking a role navigates to
 * `/login/:role`, the dedicated themed login. Functional logic is
 * unchanged from the prior version. Only the visual presentation has
 * been rebuilt around the public-page design system.
 */

// ROLES is exported and consumed by RoleLoginPage. We add an `icon` field
// (react-icons component) for the new card UI here while preserving every
// existing field; `emoji` is still read by the themed login header.
export const ROLES = [
  {
    role: 'STUDENT',
    label: 'Student',
    sub:   'Attendance · academics · events',
    emoji: '🎓',
    icon:  HiAcademicCap,
    color: '#10b981',
    glow:  'rgba(16,185,129,0.3)',
    gradient: 'linear-gradient(135deg,#059669 0%,#10b981 100%)',
  },
  {
    role: 'FACULTY',
    label: 'Faculty',
    sub:   'Classes · scheduling · attendance',
    emoji: '👨‍🏫',
    icon:  HiBookOpen,
    color: '#8b5cf6',
    glow:  'rgba(139,92,246,0.3)',
    gradient: 'linear-gradient(135deg,#7c3aed 0%,#a855f7 100%)',
  },
  {
    role: 'STAFF',
    label: 'Staff',
    sub:   'Employee dashboard · attendance',
    emoji: '💼',
    icon:  HiBriefcase,
    color: '#3b82f6',
    glow:  'rgba(59,130,246,0.3)',
    gradient: 'linear-gradient(135deg,#1e40af 0%,#3b82f6 100%)',
  },
  {
    role: 'PARENT',
    label: 'Parent',
    sub:   "Track your child's campus activity",
    emoji: '👨‍👩‍👧',
    icon:  HiUsers,
    color: '#ec4899',
    glow:  'rgba(236,72,153,0.3)',
    gradient: 'linear-gradient(135deg,#be185d 0%,#ec4899 100%)',
  },
  {
    role: 'SECURITY',
    label: 'Security',
    sub:   'Gate control · access management',
    emoji: '🛡️',
    icon:  HiShieldCheck,
    color: '#f59e0b',
    glow:  'rgba(245,158,11,0.3)',
    gradient: 'linear-gradient(135deg,#d97706 0%,#f59e0b 100%)',
  },
  {
    role: 'ADMIN',
    label: 'Admin',
    sub:   'Full system control · user management',
    emoji: '⚙️',
    icon:  HiCog,
    color: '#ef4444',
    glow:  'rgba(239,68,68,0.3)',
    gradient: 'linear-gradient(135deg,#b91c1c 0%,#ef4444 100%)',
  },
]

export default function LoginPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col bg-mesh">
      <PublicNav />

      {/* ── Hero (full viewport above the fold) ───────────────────────── */}
      <section className="relative flex flex-col items-center justify-center
        px-6 text-center min-h-[calc(100vh-72px)] py-12">
        {/* Decorative top glow. Same gradient family as the other public
            pages so the brand reads consistently. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[480px] -z-10 opacity-80"
          style={{
            background:
              'radial-gradient(60% 60% at 50% 0%, rgba(59,130,246,0.20), transparent 70%)',
          }}
        />

        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full
            bg-blue-500/10 border border-blue-400/30 text-[11px] font-bold
            uppercase tracking-[0.18em] text-blue-300 backdrop-blur-md mb-6"
        >
          <HiSparkles className="w-3.5 h-3.5" />
          AI based campus security
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.05 }}
          className="text-4xl sm:text-6xl lg:text-7xl font-bold text-white
            tracking-tight leading-[1.05] max-w-3xl"
        >
          Choose your <span className="text-gradient">portal</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.1 }}
          className="text-slate-400 text-base sm:text-lg leading-relaxed
            max-w-2xl mt-6"
        >
          Pick the role you're signing in as. Every portal is built around what
          that user actually needs to see, so students get attendance, parents
          get their child's activity, and security manages the gate.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.15 }}
          className="mt-9 flex items-center justify-center gap-3 flex-wrap"
        >
          <Button href="#portals" size="lg">
            Choose a portal <HiArrowRight className="w-4 h-4" />
          </Button>
          <Button to="/features" variant="secondary" size="lg">
            Explore features
          </Button>
        </motion.div>

        {/* Tiny scroll cue. Keeps the eye moving without a heavy animation. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden sm:block"
        >
          <a
            href="#portals"
            className="flex flex-col items-center gap-1 text-[10px] uppercase
              tracking-[0.18em] font-bold text-slate-500 hover:text-slate-300
              transition-colors group"
            aria-label="Scroll to portals"
          >
            <span>Scroll</span>
            <span className="w-px h-7 bg-gradient-to-b from-slate-500 to-transparent
              group-hover:from-slate-300 transition-colors" />
          </a>
        </motion.div>
      </section>

      {/* ── Role grid (3-col feature cards) ───────────────────────────── */}
      <main id="portals" className="flex-1 px-6 sm:px-10 pb-16 pt-2">
        <div className="max-w-6xl mx-auto w-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {ROLES.map((r, i) => (
              <RoleCard
                key={r.role}
                role={r}
                delay={i * 0.05}
                onClick={() => navigate(`/login/${r.role.toLowerCase()}`)}
              />
            ))}
          </div>

          {/* ── CTA ─────────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
            className="mt-14 rounded-3xl px-6 sm:px-12 py-12 sm:py-14
              border border-white/10 backdrop-blur-xl text-center
              shadow-[0_20px_60px_-20px_rgba(59,130,246,0.35)]"
            style={{
              background:
                'linear-gradient(135deg, rgba(30,64,175,0.22), rgba(124,58,237,0.18))',
            }}
          >
            <p className="text-[11px] font-bold text-blue-300 uppercase
              tracking-[0.18em] mb-3">
              Get started
            </p>
            <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight mb-4">
              New to the system?
            </h2>
            <p className="text-slate-300 text-sm sm:text-base mb-8 max-w-md mx-auto">
              Create an account to get matched to a portal, or browse the
              features to see what each role can do before you sign up.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Button to="/register" size="lg">
                Register an account <HiArrowRight className="w-4 h-4" />
              </Button>
              <Button to="/features" variant="secondary" size="lg">
                Explore features
              </Button>
            </div>
          </motion.div>
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="px-6 sm:px-10 py-3 border-t border-white/5 flex-shrink-0">
        <p className="text-slate-600 text-[10px] text-center">
          © {new Date().getFullYear()} AI Based Campus Security
        </p>
      </footer>
    </div>
  )
}

/* ── Role card ────────────────────────────────────────────────────────── */

function RoleCard({ role, onClick, delay = 0 }) {
  const Icon = role.icon
  return (
    <motion.button
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="group relative text-left p-6 rounded-2xl border border-white/10
        bg-white/[0.035] backdrop-blur-xl overflow-hidden
        hover:border-white/25
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70
        focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1628]
        transition-[border-color,box-shadow] duration-300"
      style={{
        boxShadow: '0 10px 36px -16px rgba(2,6,23,0.7)',
      }}
    >
      {/* Accent halo on hover. Picks up each role's signature color
          without overwhelming the card. */}
      <div
        className="pointer-events-none absolute -top-12 -right-12 w-44 h-44
          rounded-full opacity-0 group-hover:opacity-30 blur-3xl
          transition-opacity duration-500"
        style={{ background: role.color }}
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0
          group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background:
            `radial-gradient(120% 80% at 0% 0%, ${role.color}1f 0%, transparent 60%)`,
        }}
      />

      <div className="relative">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4
            ring-1 ring-inset transition-transform duration-300
            group-hover:scale-105"
          style={{
            background: `${role.color}1f`,
            boxShadow: `0 6px 20px -4px ${role.glow}`,
            color: role.color,
            ['--tw-ring-color']: `${role.color}40`,
          }}
        >
          <Icon className="w-5 h-5" />
        </div>

        <h3 className="text-[17px] font-bold text-white mb-1 tracking-tight">
          {role.label}
        </h3>
        <p className="text-[13px] text-slate-400 leading-relaxed mb-5">
          {role.sub}
        </p>

        <div className="pt-4 border-t border-white/5 flex items-center justify-between">
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-bold
              uppercase tracking-[0.16em] px-2.5 py-1 rounded-full"
            style={{
              background: `${role.color}1a`,
              color: role.color,
              border: `1px solid ${role.color}40`,
            }}
          >
            Sign in
          </span>
          <HiArrowRight
            className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1"
            style={{ color: role.color }}
          />
        </div>
      </div>
    </motion.button>
  )
}
