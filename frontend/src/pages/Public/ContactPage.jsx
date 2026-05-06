import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PublicLayout from '../../components/layout/PublicLayout'
import Section, { SectionHeading } from '../../components/ui/Section'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import {
  HiMail, HiPhone, HiLocationMarker, HiAcademicCap,
  HiCheck, HiArrowRight, HiPlus,
} from 'react-icons/hi'
import toast from 'react-hot-toast'

/* ──────────────────────────────────────────────────────────────────────────
 * ContactPage. Public marketing contact form.
 *
 * Functional behaviour preserved verbatim:
 *   - same email constant, same channels, same FAQ entries
 *   - the submit handler still composes a mailto: link (no backend yet)
 *
 * Visual rebuild: hero, redesigned channel cards, modern team cards, glass
 * form, animated FAQ. All wired through the shared Section / Card / Button
 * components introduced for the public-page redesign.
 * ────────────────────────────────────────────────────────────────────────── */

const CONTACT_EMAIL = 'umerjavaid5845@gmail.com'

// Team contact cards. Initials kept consistent with the AboutPage rendering.
// Names follow the design brief (Mian Mansoor, Qazi Taha Majid, Umer Javaid).
const TEAM = [
  {
    name: 'Mian Mansoor',
    role: 'System integration · QA · Documentation',
    initials: 'MM',
    accent: '#f59e0b',
  },
  {
    name: 'Qazi Taha Majid',
    role: 'Frontend development · User experience',
    initials: 'QT',
    accent: '#a855f7',
  },
  {
    name: 'Umer Javaid',
    role: 'Backend · Face recognition engine',
    initials: 'UJ',
    accent: '#3b82f6',
  },
]

const CHANNELS = [
  {
    icon: HiMail,
    label: 'Email',
    value: CONTACT_EMAIL,
    href:  `mailto:${CONTACT_EMAIL}`,
    note:  'Primary channel. Usually answered within a working day.',
    color: '#3b82f6',
  },
  {
    icon: HiPhone,
    label: 'Phone',
    value: '+92 313 4514469',
    href:  'tel:+923134514469',
    note:  'Available Monday to Friday, 9am to 5pm.',
    color: '#10b981',
  },
  {
    icon: HiLocationMarker,
    label: 'Address',
    value: '47C, Johar Town, Lahore, Pakistan',
    href:  'https://maps.google.com/?q=47C+Johar+Town+Lahore+Pakistan',
    note:  'Visits by appointment only.',
    color: '#f59e0b',
  },
  {
    icon: HiAcademicCap,
    label: 'Project supervisor',
    value: 'Sir Nadeem Sarwar',
    href:  null,
    note:  'Faculty mentor for BSCS-F25-010.',
    color: '#8b5cf6',
  },
]

const FAQ = [
  {
    q: 'Is this a commercial product?',
    a: "Not at the moment. It is a final year project (BSCS-F25-010 at Bahria University Lahore). " +
       'A hardened version may be released later, but for now the focus is on the demo and the viva.',
  },
  {
    q: 'Can other universities adopt it?',
    a: 'The architecture is intentionally hardware agnostic. Any laptop or device with a camera ' +
       'can act as the gate input, and the recognition pipeline runs on commodity hardware. ' +
       'Reach out by email and we will share the deployment guide.',
  },
  {
    q: 'Where is biometric data stored?',
    a: 'Face data is stored in a protected form alongside the user record. It never leaves the ' +
       'database as a usable image, and gate snapshots are automatically deleted after 30 days.',
  },
  {
    q: 'How do I report a bug?',
    a: 'Students, faculty, and staff can contact the IT department directly. Project reviewers ' +
       'can send an email with the steps to reproduce, and we will triage it as soon as possible.',
  },
]

export default function ContactPage() {
  const [form, setForm]     = useState({ name: '', email: '', subject: '', message: '' })
  const [errors, setErrors] = useState({}) // { name?: bool, email?: bool, message?: bool }
  const [sending, setSending] = useState(false)

  // Setting a field clears its error indicator so the red ring goes away
  // the moment the user starts fixing it (better UX than waiting for resubmit).
  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    if (errors[k]) setErrors(e => ({ ...e, [k]: false }))
  }

  // Same submit handler as before. Composes a prefilled mailto link.
  // Now also marks individual fields as invalid so each one gets a red ring,
  // which the previous toast-only feedback didn't surface visually.
  const handleSubmit = (e) => {
    e.preventDefault()
    const next = {
      name:    !form.name.trim(),
      email:   !form.email.includes('@'),
      message: !form.message.trim(),
    }
    if (next.name || next.email || next.message) {
      setErrors(next)
      toast.error('Name, email and message are required')
      return
    }
    setErrors({})
    setSending(true)
    const subject = encodeURIComponent(form.subject || 'Campus Security enquiry')
    const body    = encodeURIComponent(
      `From: ${form.name} <${form.email}>\n\n${form.message}`
    )
    try {
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`
      toast.success('Opening your email client...')
      setForm({ name: '', email: '', subject: '', message: '' })
    } catch {
      toast.error('Could not open mail client. Please email us directly.')
    } finally {
      setSending(false)
    }
  }

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
          Get in touch
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="text-4xl sm:text-6xl font-bold text-white tracking-tight mb-6 leading-[1.05]"
        >
          Questions, feedback,{' '}
          <span className="text-gradient">or a demo request?</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed"
        >
          We are three students at Bahria University Lahore. Send us a
          message and we will get back to you, usually the same day.
        </motion.p>
      </Section>

      {/* ── Team cards ─────────────────────────────────────────────────── */}
      <Section>
        <SectionHeading
          eyebrow="The team"
          title="The people behind the project"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-4xl mx-auto">
          {TEAM.map((m, i) => (
            <motion.div
              key={m.name}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              whileHover={{ y: -4 }}
              className="group relative rounded-2xl p-6 border border-white/10
                bg-white/[0.035] backdrop-blur-xl text-center hover:border-white/25
                hover:shadow-[0_18px_48px_-12px_rgba(59,130,246,0.25)]
                transition-[box-shadow,border-color] duration-300"
            >
              <div
                className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center
                  justify-center text-2xl font-bold text-white shadow-lg ring-1 ring-white/10"
                style={{
                  background: `linear-gradient(135deg, ${m.accent}, #1e40af)`,
                  boxShadow: `0 8px 24px -8px ${m.accent}aa`,
                }}
              >
                {m.initials}
              </div>
              <p className="text-base font-bold text-white">{m.name}</p>
              <p className="text-[12px] text-slate-400 mt-1.5 leading-relaxed px-2">
                {m.role}
              </p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ── Channel cards ──────────────────────────────────────────────── */}
      <Section>
        <SectionHeading
          eyebrow="Reach us"
          title="Pick the channel that fits"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {CHANNELS.map((c, i) => {
            const inner = (
              <Card
                icon={c.icon}
                accentColor={c.color}
                delay={i * 0.05}
                className="h-full"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 -mt-1">
                  {c.label}
                </p>
                <p className="text-[15px] font-bold text-white mt-1 break-words">{c.value}</p>
                <p className="text-[12px] text-slate-400 mt-2 leading-relaxed">{c.note}</p>
              </Card>
            )
            return c.href ? (
              <a
                key={c.label}
                href={c.href}
                target={c.href.startsWith('http') ? '_blank' : undefined}
                rel="noreferrer"
                className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 rounded-2xl"
              >
                {inner}
              </a>
            ) : (
              <div key={c.label}>{inner}</div>
            )
          })}
        </div>
      </Section>

      {/* ── Form + FAQ ─────────────────────────────────────────────────── */}
      <Section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form */}
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="lg:col-span-3 rounded-3xl p-6 sm:p-9 border border-white/10
            bg-white/[0.04] backdrop-blur-xl space-y-5
            shadow-[0_18px_60px_-20px_rgba(2,6,23,0.7)]"
        >
          <div>
            <p className="text-[11px] font-bold text-blue-300 uppercase tracking-[0.18em] mb-1">
              Send a message
            </p>
            <h2 className="text-2xl font-bold text-white tracking-tight">We read every one</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Your name *" error={errors.name && 'Required'}>
              <input
                className={`public-input ${errors.name ? 'public-input-error' : ''}`}
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Jane Doe"
                aria-invalid={!!errors.name}
              />
            </Field>
            <Field label="Email *" error={errors.email && 'Enter a valid email'}>
              <input
                className={`public-input ${errors.email ? 'public-input-error' : ''}`}
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="jane@example.com"
                aria-invalid={!!errors.email}
              />
            </Field>
          </div>

          <Field label="Subject">
            <input
              className="public-input"
              value={form.subject}
              onChange={e => set('subject', e.target.value)}
              placeholder="Demo request, bug report, or hello"
            />
          </Field>

          <Field label="Message *" error={errors.message && 'Required'}>
            <textarea
              className={`public-input min-h-[150px] resize-y ${errors.message ? 'public-input-error' : ''}`}
              value={form.message}
              onChange={e => set('message', e.target.value)}
              placeholder="Tell us a bit about what you'd like to discuss…"
              aria-invalid={!!errors.message}
            />
          </Field>

          <Button type="submit" disabled={sending} size="md">
            {sending ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <HiCheck className="w-4 h-4" />
                Send message
                <HiArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </Button>

          <p className="text-[11px] text-slate-500">
            This opens your default email client with the message pre-filled.
          </p>
        </motion.form>

        {/* FAQ */}
        <div className="lg:col-span-2 space-y-3">
          <div className="mb-3">
            <p className="text-[11px] font-bold text-blue-300 uppercase tracking-[0.18em] mb-1">
              Quick answers
            </p>
            <h2 className="text-2xl font-bold text-white tracking-tight">FAQ</h2>
          </div>
          {FAQ.map((f, i) => (
            <FaqItem key={f.q} question={f.q} answer={f.a} delay={i * 0.05} />
          ))}
        </div>
      </Section>

      {/* Form input style. Dark-glass inputs distinct from the white
          .input class used inside the authenticated portals. Includes an
          explicit error state (red ring) plus a clearly visible focus
          state (blue ring + lift), matching the design-system requirement. */}
      <style>{`
        .public-input {
          width: 100%;
          padding: 11px 14px;
          border-radius: 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.10);
          color: #fff;
          font-size: 13px;
          transition: border-color 180ms ease, background-color 180ms ease, box-shadow 180ms ease;
        }
        .public-input::placeholder { color: rgba(148,163,184,0.55); }
        .public-input:hover:not(:focus):not(.public-input-error) {
          border-color: rgba(255,255,255,0.18);
        }
        .public-input:focus {
          outline: none;
          border-color: rgba(96,165,250,0.65);
          background: rgba(255,255,255,0.07);
          box-shadow: 0 0 0 3px rgba(59,130,246,0.22);
        }
        .public-input-error {
          border-color: rgba(244,63,94,0.6);
          background: rgba(244,63,94,0.06);
        }
        .public-input-error:focus {
          border-color: rgba(244,63,94,0.85);
          box-shadow: 0 0 0 3px rgba(244,63,94,0.22);
        }
      `}</style>
    </PublicLayout>
  )
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function Field({ label, children, error }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <label className="text-[11px] font-semibold text-slate-300">
          {label}
        </label>
        {error && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
            {error}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function FaqItem({ question, answer, delay = 0 }) {
  const [open, setOpen] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay }}
      className="rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-xl
        overflow-hidden hover:border-white/20 transition-colors duration-200"
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left"
      >
        <span className="text-sm font-bold text-white">{question}</span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          className="w-7 h-7 rounded-full bg-blue-500/15 border border-blue-400/30
            flex items-center justify-center flex-shrink-0"
        >
          <HiPlus className="w-3.5 h-3.5 text-blue-300" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-4 text-[12px] text-slate-400 leading-relaxed">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
