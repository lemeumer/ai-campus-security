import { motion } from 'framer-motion'

/**
 * Card. Public-page glass card with a subtle blue-tinted gradient and a
 * gentle lift on hover. Designed to sit on the dark mesh background of the
 * marketing pages.
 *
 * The gradient border + inner gradient give the "blue + white" feel without
 * making the card itself bright (which would clash against the mesh).
 *
 * Props:
 *   accentColor   CSS colour string used for the icon chip + hover halo.
 *                 Defaults to a balanced blue.
 *   icon          a react-icons component (rendered inside an accent chip)
 *   title         h3 title
 *   children      free-form body content
 *   delay         framer-motion stagger offset for grid usage
 *   className     extra utility classes for layout
 */
export default function Card({
  icon: Icon,
  title,
  children,
  accentColor = '#60a5fa',
  delay = 0,
  className = '',
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay }}
      whileHover={{ y: -4 }}
      className={`group relative rounded-2xl p-6 border border-white/10 bg-white/[0.035] backdrop-blur-xl
        shadow-[0_8px_32px_-16px_rgba(2,6,23,0.7)] hover:border-white/20
        hover:shadow-[0_18px_48px_-12px_rgba(59,130,246,0.25)]
        transition-[box-shadow,border-color] duration-300 ${className}`}
    >
      {/* Subtle inner gradient. Keeps cards readable on the dark mesh. */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0
          group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background:
            `radial-gradient(120% 80% at 0% 0%, ${accentColor}1a 0%, transparent 60%)`,
        }}
      />
      <div className="relative">
        {Icon && (
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center mb-4
              ring-1 ring-inset transition-transform duration-300 group-hover:scale-105"
            style={{
              background: `${accentColor}1f`,
              boxShadow: `0 4px 16px -4px ${accentColor}55`,
              color: accentColor,
              ['--tw-ring-color']: `${accentColor}40`,
            }}
          >
            <Icon className="w-5 h-5" />
          </div>
        )}
        {title && (
          <h3 className="text-[15px] font-bold text-white mb-1.5 tracking-tight">
            {title}
          </h3>
        )}
        {children && (
          <div className="text-[13px] text-slate-400 leading-relaxed">
            {children}
          </div>
        )}
      </div>
    </motion.div>
  )
}
