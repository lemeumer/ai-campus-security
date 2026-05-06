import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute, PublicOnlyRoute } from './routes/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import { useEffect } from 'react'
import { initFirebase } from './config/firebase'

// Auth
import LoginPage        from './pages/Auth/LoginPage'
import RoleLoginPage    from './pages/Auth/RoleLoginPage'
import RegisterPage     from './pages/Auth/RegisterPage'
import ForgotPasswordPage from './pages/Auth/ForgotPasswordPage'

// Public marketing pages (linked from PublicNav)
import AboutPage    from './pages/Public/AboutPage'
import FeaturesPage from './pages/Public/FeaturesPage'
import ContactPage  from './pages/Public/ContactPage'

// Student
import StudentPortal    from './pages/Student/StudentPortal'
import StudentAttendance from './pages/Student/StudentAttendance'
import StudentEvents    from './pages/Student/StudentEvents'
import StudentProfile   from './pages/Student/StudentProfile'

// Faculty
import FacultyPortal    from './pages/Faculty/FacultyPortal'
import FacultyAttendance from './pages/Faculty/FacultyAttendance'
import FacultyEvents    from './pages/Faculty/FacultyEvents'
import FacultyProfile   from './pages/Faculty/FacultyProfile'

// Staff
import StaffPortal      from './pages/Staff/StaffPortal'
import StaffAttendance  from './pages/Staff/StaffAttendance'
import StaffProfile     from './pages/Staff/StaffProfile'

// Other portals
import ParentPortal     from './pages/Parent/ParentPortal'
import AdminDashboard   from './pages/Admin/AdminDashboard'
import AdminUsersPage   from './pages/Admin/AdminUsersPage'
import AdminPendingPage from './pages/Admin/AdminPendingPage'
import AdminEventsPage  from './pages/Admin/AdminEventsPage'
import AdminReportsPage from './pages/Admin/AdminReportsPage'
import AdminLogsPage     from './pages/Admin/AdminLogsPage'
import AdminVisitorsPage from './pages/Admin/AdminVisitorsPage'
import FaceEnrollmentPage from './pages/Admin/FaceEnrollmentPage'
import SecurityDashboard from './pages/Security/SecurityDashboard'

const STUDENT_ROLES  = ['STUDENT']
const FACULTY_ROLES  = ['FACULTY']
const STAFF_ROLES    = ['STAFF']
const PARENT_ROLES   = ['PARENT']
const SECURITY_ROLES = ['SECURITY']
const ADMIN_ROLES    = ['ADMIN', 'DIRECTOR', 'HR']

export default function App() {
  // Initialize Firebase on app startup
  useEffect(() => {
    initFirebase()
    // Register service worker for Firebase Cloud Messaging
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then((reg) => console.log('[SW] Firebase messaging service worker registered'))
        .catch((err) => console.warn('[SW] Failed to register service worker:', err))
    }
  }, [])

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/"               element={<PublicOnlyRoute><LoginPage />          </PublicOnlyRoute>} />
          <Route path="/login/:role"    element={<PublicOnlyRoute><RoleLoginPage />      </PublicOnlyRoute>} />
          <Route path="/register"       element={<PublicOnlyRoute><RegisterPage />       </PublicOnlyRoute>} />
          <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPasswordPage /></PublicOnlyRoute>} />

          {/* Marketing pages — open to everyone (auth or not) so logged-in
              users can still read About / Features / Contact. */}
          <Route path="/about"     element={<AboutPage />} />
          <Route path="/features"  element={<FeaturesPage />} />
          <Route path="/contact"   element={<ContactPage />} />

          {/* Protected app shell */}
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            {/* Student */}
            <Route path="/student" element={<ProtectedRoute roles={STUDENT_ROLES}><StudentPortal /></ProtectedRoute>} />
            <Route path="/student/attendance" element={<ProtectedRoute roles={STUDENT_ROLES}><StudentAttendance /></ProtectedRoute>} />
            <Route path="/student/events" element={<ProtectedRoute roles={STUDENT_ROLES}><StudentEvents /></ProtectedRoute>} />
            <Route path="/student/profile" element={<ProtectedRoute roles={STUDENT_ROLES}><StudentProfile /></ProtectedRoute>} />

            {/* Faculty */}
            <Route path="/faculty" element={<ProtectedRoute roles={FACULTY_ROLES}><FacultyPortal /></ProtectedRoute>} />
            <Route path="/faculty/attendance" element={<ProtectedRoute roles={FACULTY_ROLES}><FacultyAttendance /></ProtectedRoute>} />
            <Route path="/faculty/events" element={<ProtectedRoute roles={FACULTY_ROLES}><FacultyEvents /></ProtectedRoute>} />
            <Route path="/faculty/profile" element={<ProtectedRoute roles={FACULTY_ROLES}><FacultyProfile /></ProtectedRoute>} />

            {/* Staff */}
            <Route path="/staff" element={<ProtectedRoute roles={STAFF_ROLES}><StaffPortal /></ProtectedRoute>} />
            <Route path="/staff/attendance" element={<ProtectedRoute roles={STAFF_ROLES}><StaffAttendance /></ProtectedRoute>} />
            <Route path="/staff/profile" element={<ProtectedRoute roles={STAFF_ROLES}><StaffProfile /></ProtectedRoute>} />

            {/* Parent */}
            <Route path="/parent" element={<ProtectedRoute roles={PARENT_ROLES}><ParentPortal /></ProtectedRoute>} />

            {/* Security — gate control. Admins can access for testing/oversight. */}
            <Route path="/security" element={<ProtectedRoute roles={[...SECURITY_ROLES, ...ADMIN_ROLES]}><SecurityDashboard /></ProtectedRoute>} />

            {/* Admin / Director / HR */}
            <Route path="/admin"            element={<ProtectedRoute roles={ADMIN_ROLES}><AdminDashboard />    </ProtectedRoute>} />
            <Route path="/admin/users"      element={<ProtectedRoute roles={ADMIN_ROLES}><AdminUsersPage />    </ProtectedRoute>} />
            <Route path="/admin/pending"    element={<ProtectedRoute roles={ADMIN_ROLES}><AdminPendingPage />  </ProtectedRoute>} />
            <Route path="/admin/events"     element={<ProtectedRoute roles={ADMIN_ROLES}><AdminEventsPage />   </ProtectedRoute>} />
            <Route path="/admin/enrollment" element={<ProtectedRoute roles={ADMIN_ROLES}><FaceEnrollmentPage /></ProtectedRoute>} />
            <Route path="/admin/reports"    element={<ProtectedRoute roles={ADMIN_ROLES}><AdminReportsPage />  </ProtectedRoute>} />
            <Route path="/admin/logs"       element={<ProtectedRoute roles={ADMIN_ROLES}><AdminLogsPage />     </ProtectedRoute>} />
            <Route path="/admin/visitors"   element={<ProtectedRoute roles={ADMIN_ROLES}><AdminVisitorsPage /> </ProtectedRoute>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { fontSize: '13px', fontWeight: 500, borderRadius: '12px', padding: '12px 16px' },
            success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
            error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  )
}
