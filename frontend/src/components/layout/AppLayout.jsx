import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuth } from '../../context/AuthContext'

const PAGE_META = {
  '/student':            { title: 'Dashboard',  sub: "Welcome back" },
  '/student/attendance': { title: 'Attendance', sub: 'Your daily entry & exit log' },
  '/student/events':     { title: 'Events',     sub: 'Browse and register for events' },
  '/student/profile':    { title: 'My Profile', sub: 'Manage your personal info' },
  '/faculty':            { title: 'Dashboard',  sub: 'Welcome back' },
  '/faculty/attendance': { title: 'Attendance', sub: 'Your daily log' },
  '/faculty/events':     { title: 'Events',     sub: 'Campus events' },
  '/faculty/profile':    { title: 'My Profile', sub: 'Manage your info' },
  '/staff':              { title: 'Dashboard',  sub: 'Welcome back' },
  '/staff/attendance':   { title: 'Attendance', sub: 'Your daily log' },
  '/staff/profile':      { title: 'My Profile', sub: 'Manage your info' },
  '/parent':             { title: 'Dashboard',  sub: 'Monitor your child\'s campus activity' },
  '/security':           { title: 'Gate Control', sub: 'AI-powered campus access management' },
  '/admin':              { title: 'Dashboard',  sub: 'System overview & user management' },
}

export default function AppLayout() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const meta = PAGE_META[pathname] || { title: 'Portal', sub: '' }
  const now = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="min-h-screen flex" style={{ background: '#f1f5f9' }}>
      <Sidebar />

      <div className="flex-1 ml-60 flex flex-col min-h-screen">
        {/* Top bar */}
        <header
          className="sticky top-0 z-20 flex items-center justify-between px-8 h-16"
          style={{ background: 'rgba(241,245,249,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #e2e8f0' }}
        >
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">{meta.title}</h1>
            <p className="text-xs text-slate-400">{meta.sub}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 hidden sm:block">{now}</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
              {user?.first_name?.[0]}{user?.last_name?.[0]}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-8 py-7">
          <Outlet />
        </main>
      </div>

      {/* Toaster lives in App.jsx so a single instance handles both auth and
          authenticated routes — having two mounted at once causes double-render. */}
    </div>
  )
}
