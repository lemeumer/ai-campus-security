import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

/**
 * Button. Public-page button. Renders an internal Link when `to` is set,
 * an external <a> when `href` is set, otherwise a plain <button>.
 *
 * Variants:
 *   primary      blue gradient with soft glow (default CTA)
 *   secondary    glass border, transparent background
 *   ghost        hover-only background (used inside cards)
 */
export default function Button({
  children,
  variant = 'primary',
  to,
  href,
  type = 'button',
  size = 'md',
  className = '',
  ...rest
}) {
  const sizing =
    size === 'sm' ? 'text-[12px] px-3.5 py-2'
  : size === 'lg' ? 'text-sm px-6 py-3'
                  : 'text-[13px] px-5 py-2.5'

  const tone =
    variant === 'primary'
      ? 'text-white border border-white/10 [background:linear-gradient(135deg,#1e3a8a,#3b82f6)] '
        + 'shadow-[0_8px_28px_-8px_rgba(59,130,246,0.55)] '
        + 'hover:[background:linear-gradient(135deg,#1e40af,#60a5fa)]'
      : variant === 'secondary'
      ? 'text-slate-200 border border-white/15 bg-white/[0.04] '
        + 'hover:text-white hover:border-white/25 hover:bg-white/[0.08]'
      : 'text-slate-300 hover:text-white hover:bg-white/[0.06]'

  const cls =
    `inline-flex items-center justify-center gap-1.5 font-semibold rounded-xl
     transition-all duration-200 active:scale-[0.97]
     focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70
     focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1628]
     ${sizing} ${tone} ${className}`

  // We wrap the underlying element in a motion span only for the hover
  // micro-interaction. Keeps the Link / <a> / <button> semantics intact.
  const motionProps = {
    whileHover: { y: -1 },
    whileTap: { scale: 0.97 },
    transition: { duration: 0.15 },
  }

  if (to) {
    return (
      <motion.span {...motionProps} className="inline-flex">
        <Link to={to} className={cls} {...rest}>{children}</Link>
      </motion.span>
    )
  }
  if (href) {
    return (
      <motion.span {...motionProps} className="inline-flex">
        <a href={href} className={cls} {...rest}>{children}</a>
      </motion.span>
    )
  }
  return (
    <motion.button {...motionProps} type={type} className={cls} {...rest}>
      {children}
    </motion.button>
  )
}
