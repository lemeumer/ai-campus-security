import PublicLayout from '../../components/layout/PublicLayout'
import Section, { SectionHeading } from '../../components/ui/Section'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { motion } from 'framer-motion'
import {
  HiAcademicCap, HiUsers, HiSparkles, HiArrowRight,
  HiShieldCheck, HiLightBulb, HiExclamation, HiChip,
} from 'react-icons/hi'

/* ──────────────────────────────────────────────────────────────────────────
 * AboutPage. Restructured into Problem, Solution, Objectives and Technologies
 * sections per the design brief while preserving every line of project copy
 * from the previous version (mission statement, university context, values,
 * team, supervisor, project ID).
 * ────────────────────────────────────────────────────────────────────────── */

// Team contributions, ordered as in the prior version. Single source of truth
// for the rendered cards below; no copy duplicated in JSX.
const TEAM = [
  {
    name: 'Umer Javaid',
    role: 'Backend development and face recognition engine',
    initials: 'UJ',
  },
  {
    name: 'Qazi Taha',
    role: 'Frontend development and user experience',
    initials: 'QT',
  },
  {
    name: 'Mansoor Fareed',
    role: 'System integration, quality assurance, and documentation',
    initials: 'MF',
  },
]

// Three things we will not compromise on. Preserved verbatim.
const OBJECTIVES = [
  {
    icon: HiShieldCheck,
    title: 'Security first',
    color: '#3b82f6',
    body:
      'Every gate event is logged with a snapshot, every account change is audited, ' +
      'and biometric data is stored in a protected form so it cannot be reused outside the system.',
  },
  {
    icon: HiSparkles,
    title: 'Practical AI',
    color: '#a855f7',
    body:
      'We rely on proven image processing techniques and modern recognition models. ' +
      'They were chosen because they run reliably on commodity hardware available to most campuses today.',
  },
  {
    icon: HiLightBulb,
    title: 'Built for real campuses',
    color: '#f59e0b',
    body:
      'The platform is designed for the way universities actually operate, with printed campus IDs, ' +
      'shared family devices, and intermittent network connectivity in mind.',
  },
]

// Technology grid. Same stack used to build and run the system.
const TECHNOLOGIES = [
  { name: 'Django + DRF',     desc: 'authentication, business logic, admin' },
  { name: 'FastAPI',          desc: 'recognition microservice' },
  { name: 'React + Vite',     desc: 'role based portals' },
  { name: 'PostgreSQL',       desc: 'single source of truth' },
  { name: 'Image processing', desc: 'biometrics and card reading' },
  { name: 'Twilio + Firebase',desc: 'parent notifications' },
]

export default function AboutPage() {
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
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full
            bg-blue-500/10 border border-blue-400/30 text-[11px] font-bold
            uppercase tracking-[0.18em] text-blue-300 backdrop-blur-md mb-6"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          About the project
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="text-4xl sm:text-6xl font-bold text-white tracking-tight mb-6 leading-[1.05]"
        >
          A modern approach to{' '}
          <span className="text-gradient">campus security</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed"
        >
          The AI Based Campus Security System is a final year project at Bahria
          University Lahore. We are building a complete gate to dashboard
          platform that combines face recognition, card based access, and live
          parent notifications, while preserving the audit trail security
          teams depend on every day.
        </motion.p>
      </Section>

      {/* ── Problem + Solution side by side ────────────────────────────── */}
      <Section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card icon={HiExclamation} title="The problem" accentColor="#f97316">
          Most campus security systems are either too expensive, with
          commercial biometric gates priced out of reach, or too brittle,
          relying on paper logs and card only turnstiles. Neither extreme
          gives security teams the audit trail and real time visibility they
          actually need.
        </Card>
        <Card icon={HiAcademicCap} title="Our solution" accentColor="#3b82f6">
          We are building the middle path. An open and modular system that
          runs on commodity hardware, uses camera based input for both face
          recognition and card reading, and gives every stakeholder, from
          students and parents to security and administration, the dashboard
          they actually need.
        </Card>
      </Section>

      {/* ── University context (full width contextual band) ──────────── */}
      <Section tone="surface" className="mt-2">
        <div className="flex flex-col md:flex-row items-start gap-6">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-400/30
            flex items-center justify-center flex-shrink-0">
            <HiUsers className="w-5 h-5 text-purple-300" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-purple-300 uppercase tracking-[0.18em] mb-2">
              University context
            </p>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-3">
              Designed for and tested at Bahria University Lahore
            </h2>
            <p className="text-slate-400 text-sm sm:text-[15px] leading-relaxed">
              Built under the supervision of{' '}
              <span className="text-white font-semibold">Sir Nadeem Sarwar</span>.
              The visitor flow uses Pakistani CNICs, the campus card workflow
              mirrors the real layout used on student IDs, and the parent
              portal is built around the way families share devices in practice.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Objectives ─────────────────────────────────────────────────── */}
      <Section>
        <SectionHeading
          eyebrow="Our objectives"
          title="Three things we will not compromise on"
          description="Every design decision in the platform answers to one of these three principles."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {OBJECTIVES.map((o, i) => (
            <Card
              key={o.title}
              icon={o.icon}
              title={o.title}
              accentColor={o.color}
              delay={i * 0.06}
            >
              {o.body}
            </Card>
          ))}
        </div>
      </Section>

      {/* ── Technologies ───────────────────────────────────────────────── */}
      <Section>
        <SectionHeading
          eyebrow="The stack"
          title="Technologies powering the platform"
          description="A defensible engineering stack. Every layer chosen because it earns its place."
        />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {TECHNOLOGIES.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              whileHover={{ y: -2 }}
              className="rounded-xl p-4 border border-white/10 bg-white/[0.04]
                hover:border-blue-400/30 hover:bg-white/[0.06]
                transition-colors duration-200 flex items-start gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-400/25
                flex items-center justify-center flex-shrink-0">
                <HiChip className="w-4 h-4 text-blue-300" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">{t.name}</p>
                <p className="text-[12px] text-slate-400 mt-0.5 leading-snug">{t.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ── Team ───────────────────────────────────────────────────────── */}
      <Section>
        <SectionHeading
          eyebrow="The team"
          title="Built by three students at Bahria University Lahore"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-4xl mx-auto">
          {TEAM.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              whileHover={{ y: -4 }}
              className="rounded-2xl p-6 border border-white/10 bg-white/[0.035]
                backdrop-blur-xl text-center hover:border-white/25
                hover:shadow-[0_18px_48px_-12px_rgba(59,130,246,0.25)]
                transition-[box-shadow,border-color] duration-300"
            >
              <div
                className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center
                  justify-center text-2xl font-bold text-white shadow-lg
                  shadow-blue-500/30 ring-1 ring-white/10"
                style={{ background: 'linear-gradient(135deg,#1e40af,#7c3aed)' }}
              >
                {t.initials}
              </div>
              <p className="text-base font-bold text-white">{t.name}</p>
              <p className="text-[12px] text-slate-400 mt-1.5 leading-relaxed px-2">
                {t.role}
              </p>
            </motion.div>
          ))}
        </div>
        <p className="text-center text-slate-500 text-xs mt-8">
          Project ID: <span className="font-mono text-slate-300">BSCS-F25-010</span>
          {' · '}Supervisor: <span className="text-slate-300">Sir Nadeem Sarwar</span>
        </p>
      </Section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <Section className="text-center mt-2">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="rounded-3xl px-6 sm:px-12 py-12 sm:py-14 border border-white/10
            backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(124,58,237,0.35)]"
          style={{
            background:
              'linear-gradient(135deg, rgba(30,64,175,0.22), rgba(124,58,237,0.18))',
          }}
        >
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 tracking-tight">
            Want to see it in action?
          </h2>
          <p className="text-slate-300 text-sm sm:text-base mb-7 max-w-md mx-auto">
            Sign in with one of the role portals, or get in touch and we will be
            glad to demo the gate flow live.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button to="/" size="md">
              Pick a portal <HiArrowRight className="w-3.5 h-3.5" />
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
