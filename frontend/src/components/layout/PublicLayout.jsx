import { Link } from 'react-router-dom'
import PublicNav from './PublicNav'
import { HiShieldCheck } from 'react-icons/hi'

/**
 * Shared shell for public marketing pages (About, Features, Contact).
 * The landing page (`LoginPage`) keeps its own bespoke layout because the
 * role-picker grid needs to fill the viewport — but it embeds <PublicNav />
 * directly so the navigation still feels consistent.
 */

export default function PublicLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-mesh">
      <PublicNav />
      <main className="flex-1 px-6 sm:px-10 py-8">
        <div className="max-w-6xl mx-auto w-full">
          {children}
        </div>
      </main>
      <PublicFooter />
    </div>
  )
}

export function PublicFooter() {
  return (
    <footer className="border-t border-white/5 px-6 sm:px-10 py-8 mt-8">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-400/20 flex items-center justify-center">
            <HiShieldCheck className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <p className="text-slate-500 text-[11px]">
            © {new Date().getFullYear()} AI Based Campus Security · Bahria University Lahore
          </p>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-slate-500">
          <Link to="/about"    className="hover:text-slate-300 transition-colors">About</Link>
          <Link to="/features" className="hover:text-slate-300 transition-colors">Features</Link>
          <Link to="/contact"  className="hover:text-slate-300 transition-colors">Contact</Link>
        </div>
      </div>
    </footer>
  )
}
