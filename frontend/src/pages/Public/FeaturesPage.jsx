import PublicLayout from '../../components/layout/PublicLayout'
import Section, { SectionHeading } from '../../components/ui/Section'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { motion } from 'framer-motion'
import {
  HiCamera, HiIdentification, HiBell, HiUserGroup, HiClipboardCheck,
  HiClock, HiChartBar, HiShieldCheck, HiLockClosed, HiArrowRight,
  HiAcademicCap, HiOfficeBuilding, HiKey, HiEye, HiCog,
} from 'react-icons/hi'

/* ──────────────────────────────────────────────────────────────────────────
 * FeaturesPage. Public marketing page.
 *
 * Content arrays are preserved verbatim from the prior version. Only the
 * presentation has changed: features are now grouped into three thematic
 * categories (access, visibility, operations) for clearer visual hierarchy
 * and easier scanning.
 * ────────────────────────────────────────────────────────────────────────── */

// Three category groups, each containing the relevant subset of the original
// nine features. Every body line is taken verbatim from the prior page.
const FEATURE_GROUPS = [
  {
    id: 'access',
    eyebrow: 'Access & identity',
    title: 'Who comes through the gate, and how',
    accentIcon: HiKey,
    items: [
      {
        icon: HiCamera,
        title: 'Face recognition at the gate',
        color: '#3b82f6',
        body:
          'Modern recognition models capture multiple frames during enrolment, ' +
          'apply liveness detection to block printed photos and videos, and fall ' +
          'back to per frame matching when the average dips. Works with any ' +
          'camera based input the campus already has.',
      },
      {
        icon: HiIdentification,
        title: 'Card based access',
        color: '#8b5cf6',
        body:
          'When a face read is not possible, the gate reads the printed campus ' +
          'card using image processing techniques and matches the enrolment ' +
          'number against the user record. Tuned to the layout of the campus IDs ' +
          'in active use.',
      },
      {
        icon: HiClipboardCheck,
        title: 'Approval workflow',
        color: '#f59e0b',
        body:
          'Self registered users land in a pending queue. Administrators review ' +
          'each request and either approve it (account becomes active) or reject ' +
          'it with an audit trail. No accounts slip through to login unchecked.',
      },
    ],
  },
  {
    id: 'visibility',
    eyebrow: 'Visibility & people',
    title: 'Live updates for everyone who needs them',
    accentIcon: HiEye,
    items: [
      {
        icon: HiBell,
        title: 'Live parent notifications',
        color: '#ec4899',
        body:
          'Every time a student passes the gate, parents receive an SMS and a ' +
          'push notification. The system runs in development mode without live ' +
          'credentials, so the end to end flow can be demoed on a single laptop.',
      },
      {
        icon: HiUserGroup,
        title: 'Multi role portals',
        color: '#10b981',
        body:
          'Students, faculty, staff, parents, security, administration, ' +
          'directors, and HR each see a portal built around what they need. ' +
          'No single bloated dashboard with every feature jammed in.',
      },
      {
        icon: HiOfficeBuilding,
        title: 'Visitor management',
        color: '#14b8a6',
        body:
          'Walk in visitors are captured at the gate, linked to a campus host, ' +
          'and tracked from check in to check out. Security always knows who is ' +
          'on campus at any moment.',
      },
    ],
  },
  {
    id: 'operations',
    eyebrow: 'Operations & trust',
    title: 'Daily workflows that hold up',
    accentIcon: HiCog,
    items: [
      {
        icon: HiClock,
        title: 'Attendance, automatic',
        color: '#06b6d4',
        body:
          'Gate entries become attendance rows automatically. Late, present, and ' +
          'absent are computed from the first entry of the day. No manual roster ' +
          'and no QR codes to lose.',
      },
      {
        icon: HiChartBar,
        title: 'Audit log everything',
        color: '#a855f7',
        body:
          'Logins, gate scans, enrolments, and sessions are aggregated into a ' +
          'single chronological feed. Filter by kind, severity, and date so the ' +
          'one event that matters is easy to find.',
      },
      {
        icon: HiLockClosed,
        title: 'Privacy by design',
        color: '#ef4444',
        body:
          'Gate snapshots are deleted automatically after 30 days. Face data is ' +
          'stored in a protected form so it cannot be reused outside the system. ' +
          'Active sessions are revoked the moment a password is changed.',
      },
    ],
  },
]

const STACK = [
  { name: 'Django + DRF',         desc: 'authentication, business logic, admin' },
  { name: 'FastAPI',              desc: 'recognition microservice' },
  { name: 'React + Vite',         desc: 'role based portals' },
  { name: 'PostgreSQL',           desc: 'single source of truth' },
  { name: 'Image processing',     desc: 'biometrics and card reading' },
  { name: 'Twilio + Firebase',    desc: 'parent notifications' },
]

export default function FeaturesPage() {
  return (
    <PublicLayout>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <Section tone="hero" className="text-center relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px] -z-10 opacity-70"
          style={{
            background:
              'radial-gradient(60% 60% at 50% 0%, rgba(59,130,246,0.18), transparent 70%)',
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
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          What is inside
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.05 }}
          className="text-4xl sm:text-6xl font-bold text-white tracking-tight
            mb-6 leading-[1.05]"
        >
          A complete platform,
          <br className="hidden sm:block" />{' '}
          <span className="text-gradient">not just a face matcher</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.1 }}
          className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed"
        >
          Everything you need to run gate access for a real campus.
          Biometrics, parent alerts, attendance, visitors, audit logs, and a
          dashboard for every role that uses the system.
        </motion.p>
      </Section>

      {/* ── Grouped feature sections ───────────────────────────────────── */}
      {FEATURE_GROUPS.map((group, gi) => (
        <Section key={group.id} className={gi === 0 ? '!pt-2' : ''}>
          <FeatureGroupHeader
            eyebrow={group.eyebrow}
            title={group.title}
            icon={group.accentIcon}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {group.items.map((f, i) => (
              <Card
                key={f.title}
                icon={f.icon}
                title={f.title}
                accentColor={f.color}
                delay={i * 0.05}
              >
                {f.body}
              </Card>
            ))}
          </div>
        </Section>
      ))}

      {/* ── Engineering / stack panel ──────────────────────────────────── */}
      <Section tone="surface" className="mt-4">
        <div className="flex items-start gap-4 mb-7">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-400/30
            flex items-center justify-center flex-shrink-0">
            <HiAcademicCap className="w-5 h-5 text-blue-300" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-blue-300 uppercase tracking-[0.18em] mb-1">
              Engineering
            </p>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Built on a stack we can defend in the viva
            </h2>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {STACK.map((s, i) => (
            <motion.div
              key={s.name}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.04 }}
              whileHover={{ y: -2 }}
              className="rounded-xl p-4 border border-white/10 bg-white/[0.04]
                hover:border-blue-400/30 hover:bg-white/[0.06]
                transition-colors duration-200"
            >
              <p className="text-sm font-bold text-white">{s.name}</p>
              <p className="text-[12px] text-slate-400 mt-1 leading-snug">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <Section className="text-center mt-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rounded-3xl px-6 sm:px-12 py-12 sm:py-14 border border-white/10
            backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(59,130,246,0.35)]"
          style={{
            background:
              'linear-gradient(135deg, rgba(30,64,175,0.22), rgba(16,185,129,0.18))',
          }}
        >
          <div className="w-14 h-14 rounded-2xl bg-blue-500/20 border border-blue-400/30
            flex items-center justify-center mx-auto mb-5">
            <HiShieldCheck className="w-6 h-6 text-blue-300" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 tracking-tight">
            Ready to walk through a portal?
          </h2>
          <p className="text-slate-300 text-sm sm:text-base mb-7 max-w-md mx-auto">
            Pick the role you would log in as. Every portal is a different lens
            on the same system.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button to="/" size="md">
              Choose a portal <HiArrowRight className="w-3.5 h-3.5" />
            </Button>
            <Button to="/contact" variant="secondary" size="md">
              Contact us
            </Button>
          </div>
        </motion.div>
      </Section>
    </PublicLayout>
  )
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function FeatureGroupHeader({ eyebrow, title, icon: Icon }) {
  return (
    <div className="flex items-start gap-4 mb-7">
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center
          flex-shrink-0 bg-blue-500/12 border border-blue-400/25 text-blue-300"
      >
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[11px] font-bold text-blue-300 uppercase tracking-[0.18em] mb-1">
          {eyebrow}
        </p>
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          {title}
        </h2>
      </div>
    </div>
  )
}
