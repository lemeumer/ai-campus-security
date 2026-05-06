import { motion } from 'framer-motion'

/**
 * Section. A public-page section wrapper with consistent vertical rhythm
 * and an opt-in scroll-reveal fade. Used by Features, About and Contact.
 *
 * Variants:
 *   tone="surface"     light glass panel sitting on the page background
 *   tone="bare"        no background, just spacing
 *   tone="hero"        extra top/bottom padding for hero sections
 *
 * Animation kicks in on first time the section enters the viewport, then
 * locks (`once: true`) so re-scrolling doesn't replay it.
 */
export default function Section({
  children,
  className = '',
  tone = 'bare',
  id,
  delay = 0,
}) {
  const padding =
    tone === 'hero'
      ? 'py-14 sm:py-20'
      : tone === 'surface'
      ? 'p-7 sm:p-10'
      : 'py-10 sm:py-14'

  const surface =
    tone === 'surface'
      ? 'rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_10px_40px_-12px_rgba(2,6,23,0.6)]'
      : ''

  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}
      className={`${padding} ${surface} ${className}`}
    >
      {children}
    </motion.section>
  )
}

/**
 * SectionHeading. Eyebrow + title + optional description triplet, centred
 * by default. Lets every page share a consistent header style without each
 * page reimplementing the same spacing tokens.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
  className = '',
}) {
  const alignCls = align === 'center' ? 'text-center mx-auto' : 'text-left'
  return (
    <div className={`max-w-2xl ${alignCls} mb-10 ${className}`}>
      {eyebrow && (
        <p className="text-[11px] font-bold text-blue-400 uppercase tracking-[0.18em] mb-3">
          {eyebrow}
        </p>
      )}
      <h2 className="text-2xl sm:text-[34px] font-bold text-white tracking-tight leading-[1.15]">
        {title}
      </h2>
      {description && (
        <p className="text-slate-400 text-sm sm:text-[15px] mt-4 leading-relaxed">
          {description}
        </p>
      )}
    </div>
  )
}
