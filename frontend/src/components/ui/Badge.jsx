const V = {
  success:   { bg: '#f0fdf4', color: '#16a34a' },
  warning:   { bg: '#fffbeb', color: '#d97706' },
  danger:    { bg: '#fff1f2', color: '#e11d48' },
  info:      { bg: '#eff6ff', color: '#2563eb' },
  purple:    { bg: '#faf5ff', color: '#7c3aed' },
  default:   { bg: '#f8fafc', color: '#64748b' },
  active:    { bg: '#f0fdf4', color: '#16a34a' },
  inactive:  { bg: '#f8fafc', color: '#94a3b8' },
  suspended: { bg: '#fff1f2', color: '#e11d48' },
}

export default function Badge({ children, variant = 'default' }) {
  const s = V[variant] || V.default
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: s.bg, color: s.color }}
    >
      {children}
    </span>
  )
}

const STATUS_MAP = {
  ACTIVE: 'active', INACTIVE: 'inactive', SUSPENDED: 'suspended', GRADUATED: 'default',
  PRESENT: 'success', ABSENT: 'danger', LATE: 'warning',
  IN: 'success', OUT: 'default', GRANTED: 'success', DENIED: 'danger',
}

export function StatusBadge({ status }) {
  return <Badge variant={STATUS_MAP[status] || 'default'}>{status}</Badge>
}
