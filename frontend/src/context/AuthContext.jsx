import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { authApi } from '../api/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [loading, setLoading] = useState(false)

  const login = async (credentials) => {
    const res = await authApi.login(credentials)
    const { token: t, user: u } = res.data
    // Dismiss any toasts left over from a previous session (welcome banner,
    // error messages, etc.) so the new user sees a clean slate.
    toast.dismiss()
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(u))
    setToken(t)
    setUser(u)
    return u
  }

  const logout = useCallback(async () => {
    try { await authApi.logout() } catch {}
    // Clear any active toasts (welcome banner from previous login, etc.)
    toast.dismiss()
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setToken(null)
    setUser(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!token) return
    try {
      const res = await authApi.getProfile()
      const u = res.data
      localStorage.setItem('user', JSON.stringify(u))
      setUser(u)
    } catch {}
  }, [token])

  useEffect(() => {
    if (token) refreshProfile()
  }, [token])

  const isAuthenticated = !!token && !!user
  const hasRole = (...roles) => roles.includes(user?.role)

  return (
    <AuthContext.Provider value={{ user, token, loading, isAuthenticated, hasRole, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
