import StatCard from '../../components/ui/StatCard'
import {
  HiChartBar, HiTrendingUp, HiClipboardList, HiCalendar,
  HiDownload, HiDocumentReport,
} from 'react-icons/hi'

/**
 * /admin/reports — placeholder until the analytics backend is built.
 * Per current scope: sample data is fine here; will wire to real attendance
 * + gate-entry aggregation queries later.
 */

const SAMPLE_TRENDS = [
  { day: 'Mon', entries: 412, exits: 398 },
  { day: 'Tue', entries: 445, exits: 421 },
  { day: 'Wed', entries: 467, exits: 456 },
  { day: 'Thu', entries: 421, exits: 408 },
  { day: 'Fri', entries: 389, exits: 412 },
]

const SAMPLE_REPORTS = [
  { id: 'r1', name: 'Daily Attendance — This Week',     type: 'Attendance', size: '1.2 MB', updated: '2 hours ago' },
  { id: 'r2', name: 'Faculty Activity Summary',         type: 'Faculty',    size: '847 KB', updated: 'Yesterday' },
  { id: 'r3', name: 'Gate Access Log — All Methods',    type: 'Security',   size: '2.4 MB', updated: '6 hours ago' },
  { id: 'r4', name: 'Visitor Entry History',            type: 'Visitors',   size: '512 KB', updated: '3 days ago' },
]

const REPORT_COLORS = {
  Attendance: 'green', Faculty: 'purple', Security: 'amber', Visitors: 'blue',
}

export default function AdminReportsPage() {
  const maxValue = Math.max(...SAMPLE_TRENDS.flatMap(t => [t.entries, t.exits]))

  return (
    <div className="space-y-6">

      {/* Banner */}
      <div className="rounded-2xl p-7 text-white relative overflow-hidden"
           style={{ background: 'linear-gradient(135deg, #5b21b6, #7c3aed, #a855f7)' }}>
        <div className="absolute inset-0 opacity-15"
             style={{ backgroundImage: 'radial-gradient(circle at 85% 50%, white, transparent 60%)' }} />
        <div className="relative">
          <p className="text-purple-200 text-sm uppercase tracking-widest mb-1">Analytics</p>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <HiChartBar className="w-6 h-6" /> System Reports
          </h2>
          <p className="text-purple-100 text-sm mt-1">
            Attendance trends, gate activity, and exportable summaries
          </p>
        </div>
        <div className="relative mt-4 inline-flex items-center gap-2 bg-white/15 px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
          <span className="text-white text-xs font-semibold">Sample data — analytics backend coming soon</span>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Avg Daily Entries" value="426"    icon={HiTrendingUp}     color="green" trend="↑ 4.3%" trendUp />
        <StatCard label="Active Members"    value="1,247"  icon={HiClipboardList}  color="blue" />
        <StatCard label="Reports Generated" value="38"     icon={HiDocumentReport} color="purple" />
        <StatCard label="This Month"        value="12,415" icon={HiCalendar}       color="amber" trend="↑ 8.1%" trendUp />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Weekly trends chart */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Weekly Gate Activity</h3>
              <p className="text-xs text-slate-400 mt-0.5">Entries vs. exits, this week</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-1 rounded-full">Sample</span>
          </div>
          <div className="space-y-3">
            {SAMPLE_TRENDS.map(t => (
              <div key={t.day}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-600 w-10">{t.day}</span>
                  <span className="text-[11px] text-slate-400">
                    <span className="text-emerald-600 font-semibold">{t.entries}</span> in ·
                    <span className="text-blue-600 font-semibold ml-1">{t.exits}</span> out
                  </span>
                </div>
                <div className="flex gap-1 h-3 bg-slate-50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${(t.entries / maxValue) * 50}%` }}
                  />
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${(t.exits / maxValue) * 50}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Available reports list */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Available Reports</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-1 rounded-full">Sample</span>
          </div>
          <div className="divide-y divide-slate-50">
            {SAMPLE_REPORTS.map(r => {
              const colorVar = REPORT_COLORS[r.type] || 'blue'
              const colorMap = {
                green:  { bg: '#f0fdf4', text: '#16a34a' },
                purple: { bg: '#faf5ff', text: '#7c3aed' },
                amber:  { bg: '#fffbeb', text: '#d97706' },
                blue:   { bg: '#eff6ff', text: '#2563eb' },
              }
              const c = colorMap[colorVar]
              return (
                <div key={r.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                         style={{ background: c.bg, color: c.text }}>
                      <HiDocumentReport className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{r.name}</p>
                      <p className="text-xs text-slate-400">
                        <span style={{ color: c.text }} className="font-semibold">{r.type}</span>
                        <span className="mx-1.5">·</span>
                        {r.size} <span className="mx-1.5">·</span> {r.updated}
                      </p>
                    </div>
                  </div>
                  <button className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-all">
                    <HiDownload className="w-3.5 h-3.5" />
                    Download
                  </button>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
