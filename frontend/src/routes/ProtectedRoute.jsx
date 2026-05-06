import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ROLE_HOME = {
  STUDENT: '/student',
  FACULTY: '/faculty',
  STAFF: '/staff',
  PARENT: '/parent',
  SECURITY: '/security',
  ADMIN: '/admin',
  DIRECTOR: '/admin',
  HR: '/admin',
}

export function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) return <Navigate to="/" state={{ from: location }} replace />

  if (roles && !roles.includes(user?.role)) {
    const home = ROLE_HOME[user?.role] || '/'
    return <Navigate to={home} replace />
  }

  return children
}

export function PublicOnlyRoute({ children }) {
  const { isAuthenticated, user } = useAuth()
  if (isAuthenticated) {
    const home = ROLE_HOME[user?.role] || '/'
    return <Navigate to={home} replace />
  }
  return children
}

export { ROLE_HOME }
