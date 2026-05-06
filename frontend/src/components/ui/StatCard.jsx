const COLORS = {
  blue:   { bg: '#eff6ff', icon: '#dbeafe', text: '#1d4ed8', value: '#1e40af' },
  green:  { bg: '#f0fdf4', icon: '#dcfce7', text: '#16a34a', value: '#15803d' },
  purple: { bg: '#faf5ff', icon: '#ede9fe', text: '#7c3aed', value: '#6d28d9' },
  amber:  { bg: '#fffbeb', icon: '#fef3c7', text: '#d97706', value: '#b45309' },
  rose:   { bg: '#fff1f2', icon: '#ffe4e6', text: '#e11d48', value: '#be123c' },
  slate:  { bg: '#f8fafc', icon: '#f1f5f9', text: '#475569', value: '#334155' },
  indigo: { bg: '#eef2ff', icon: '#e0e7ff', text: '#4338ca', value: '#3730a3' },
}

export default function StatCard({ label, value, icon: Icon, color = 'blue', trend, trendUp }) {
  const c = COLORS[color] || COLORS.blue
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ background: c.icon }}
        >
          {Icon && <Icon className="w-5 h-5" style={{ color: c.text }} />}
        </div>
        {trend && (
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: trendUp !== false ? '#f0fdf4' : '#fff1f2',
              color: trendUp !== false ? '#16a34a' : '#e11d48',
            }}
          >
            {trend}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold tracking-tight" style={{ color: c.value }}>{value}</p>
    </div>
  )
}
