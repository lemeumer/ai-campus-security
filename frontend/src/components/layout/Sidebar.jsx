import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  HiHome, HiCalendar, HiUser, HiTicket, HiShieldCheck,
  HiUsers, HiLogout, HiChartBar, HiClock, HiCamera,
  HiClipboardList, HiUserAdd, HiClipboardCheck,
} from 'react-icons/hi'

const NAV = {
  STUDENT:  [
    { to: '/student',            icon: HiHome,       label: 'Dashboard' },
    { to: '/student/attendance', icon: HiClock,      label: 'Attendance' },
    { to: '/student/events',     icon: HiTicket,     label: 'Events' },
    { to: '/student/profile',    icon: HiUser,       label: 'Profile' },
  ],
  FACULTY:  [
    { to: '/faculty',            icon: HiHome,       label: 'Dashboard' },
    { to: '/faculty/attendance', icon: HiClock,      label: 'Attendance' },
    { to: '/faculty/events',     icon: HiTicket,     label: 'Events' },
    { to: '/faculty/profile',    icon: HiUser,       label: 'Profile' },
  ],
  STAFF:    [
    { to: '/staff',              icon: HiHome,       label: 'Dashboard' },
    { to: '/staff/attendance',   icon: HiClock,      label: 'Attendance' },
    { to: '/staff/profile',      icon: HiUser,       label: 'Profile' },
  ],
  PARENT:   [
    { to: '/parent',             icon: HiHome,       label: 'Dashboard' },
  ],
  SECURITY: [
    { to: '/security',           icon: HiShieldCheck,label: 'Gate Control' },
  ],
  ADMIN:    [
    { to: '/admin',              icon: HiHome,           label: 'Dashboard' },
    { to: '/admin/users',        icon: HiUsers,          label: 'Users' },
    { to: '/admin/pending',      icon: HiClipboardCheck, label: 'Pending Approvals' },
    { to: '/admin/events',       icon: HiTicket,         label: 'Events' },
    { to: '/admin/enrollment',   icon: HiCamera,         label: 'Face Enrollment' },
    { to: '/security',           icon: HiShieldCheck,    label: 'Gate Control' },
    { to: '/admin/visitors',     icon: HiUserAdd,        label: 'Visitors' },
    { to: '/admin/logs',         icon: HiClipboardList,  label: 'System Logs' },
    { to: '/admin/reports',      icon: HiChartBar,       label: 'Reports' },
  ],
  DIRECTOR: [
    { to: '/admin',              icon: HiHome,           label: 'Dashboard' },
    { to: '/admin/pending',      icon: HiClipboardCheck, label: 'Pending Approvals' },
    { to: '/admin/events',       icon: HiTicket,         label: 'Events' },
    { to: '/admin/enrollment',   icon: HiCamera,         label: 'Face Enrollment' },
    { to: '/admin/logs',         icon: HiClipboardList,  label: 'System Logs' },
    { to: '/admin/reports',      icon: HiChartBar,       label: 'Reports' },
  ],
  HR:       [
    { to: '/admin',              icon: HiHome,           label: 'Dashboard' },
    { to: '/admin/users',        icon: HiUsers,          label: 'Users' },
    { to: '/admin/pending',      icon: HiClipboardCheck, label: 'Pending Approvals' },
    { to: '/admin/events',       icon: HiTicket,         label: 'Events' },
    { to: '/admin/enrollment',   icon: HiCamera,         label: 'Face Enrollment' },
    { to: '/admin/logs',         icon: HiClipboardList,  label: 'System Logs' },
  ],
}

const ROLE_ACCENT = {
  STUDENT:  { color: '#10b981', light: 'rgba(16,185,129,0.12)',  text: '#34d399' },
  FACULTY:  { color: '#8b5cf6', light: 'rgba(139,92,246,0.12)', text: '#a78bfa' },
  STAFF:    { color: '#3b82f6', light: 'rgba(59,130,246,0.12)', text: '#60a5fa' },
  PARENT:   { color: '#ec4899', light: 'rgba(236,72,153,0.12)', text: '#f472b6' },
  SECURITY: { color: '#f59e0b', light: 'rgba(245,158,11,0.12)', text: '#fbbf24' },
  ADMIN:    { color: '#ef4444', light: 'rgba(239,68,68,0.12)',  text: '#f87171' },
  DIRECTOR: { color: '#ef4444', light: 'rgba(239,68,68,0.12)',  text: '#f87171' },
  HR:       { color: '#3b82f6', light: 'rgba(59,130,246,0.12)', text: '#60a5fa' },
}

const ROLE_EMOJI = {
  STUDENT: '🎓', FACULTY: '👨‍🏫', STAFF: '💼', PARENT: '👨‍👩‍👧',
  SECURITY: '🛡️', ADMIN: '⚙️', DIRECTOR: '👔', HR: '🧑‍💼',
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const links = NAV[user?.role] || []
  const accent = ROLE_ACCENT[user?.role] || ROLE_ACCENT.ADMIN
  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`

  const handleLogout = async () => { await logout(); navigate('/') }

  return (
    <aside
      className="fixed inset-y-0 left-0 w-60 flex flex-col z-30"
      style={{ background: '#0d1526', borderRight: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Brand */}
      <div className="px-5 pt-6 pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: accent.light, border: `1px solid ${accent.color}30` }}>
            <HiShieldCheck className="w-4 h-4" style={{ color: accent.text }} />
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-xs leading-tight truncate">AI Campus Security</p>
          </div>
        </div>
      </div>

      {/* User card */}
      <div className="px-4 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ background: accent.light, color: accent.text }}
          >
            {initials || ROLE_EMOJI[user?.role]}
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-semibold truncate">{user?.first_name} {user?.last_name}</p>
            <p className="text-slate-500 text-[10px] truncate">{user?.university_id || user?.email}</p>
          </div>
        </div>
        {/* Role badge */}
        <div className="mt-2 flex justify-center">
          <span
            className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
            style={{ background: accent.light, color: accent.text, border: `1px solid ${accent.color}25` }}
          >
            {ROLE_EMOJI[user?.role]} {user?.role}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5 scrollbar-hide">
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-3 mb-3">Menu</p>
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to.split('/').length <= 2}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 group"
            style={({ isActive }) => ({
              background: isActive ? accent.light : 'transparent',
              color: isActive ? accent.text : 'rgb(100 116 139)',
              border: isActive ? `1px solid ${accent.color}20` : '1px solid transparent',
            })}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-xs font-medium text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
        >
          <HiLogout className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
