/**
 * Firebase Cloud Messaging Service Worker
 *
 * Handles push notifications when the app is in the background.
 * Place this file at the public root so it's served at /firebase-messaging-sw.js
 *
 * When a push arrives, this SW wakes up and displays the notification.
 * Clicking the notification can trigger navigation (data.action).
 */

// Import Firebase libraries via CDN (compat for SW context)
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

// Initialize Firebase in the service worker
// Service workers can't access Vite env vars, so we hardcode the public config.
// (These are PUBLIC values — safe to expose in client-side code.)
firebase.initializeApp({
  apiKey: 'AIzaSyAiF6Qd6zVIdDSATBVAKNVVC6Io-EDyo00',
  authDomain: 'fyp-project-bd5b0.firebaseapp.com',
  projectId: 'fyp-project-bd5b0',
  storageBucket: 'fyp-project-bd5b0.firebasestorage.app',
  messagingSenderId: '1045705816470',
  appId: '1:1045705816470:web:f71d38538b4013884d05b7',
  measurementId: 'G-DFHQJ3YCN3',
})

// Get messaging instance
const messaging = firebase.messaging()

// Handle background messages (when app is closed or in background)
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Received background message:', payload)

  const title = payload.notification?.title || 'Campus Security'
  const options = {
    body: payload.notification?.body || 'New notification',
    icon: '/vite.svg',
    badge: '/vite.svg',
    tag: 'campus-security-notification',
    requireInteraction: payload.data?.action?.includes('denial') || false,
    data: payload.data || {},
  }

  return self.registration.showNotification(title, options)
})

// Handle notification click (user clicks the notification)
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const action = event.notification.data?.action || 'open_home'
  const clientUrl = determinateUrlFromAction(action, event.notification.data)

  // Find a matching client window and focus it, or open a new one
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === clientUrl && 'focus' in client) {
          return client.focus()
        }
      }
      return clients.openWindow(clientUrl)
    })
  )
})

/**
 * Determine where to navigate based on the action type
 */
function determinateUrlFromAction(action, data) {
  const baseUrl = self.location.origin

  switch (action) {
    case 'open_gate_log':
      return `${baseUrl}/security`
    case 'open_security_dashboard':
      return `${baseUrl}/security`
    case 'open_student_activity':
      return `${baseUrl}/parent`
    case 'open_enrollment_page':
      return `${baseUrl}/admin/enrollment`
    case 'open_home':
    default:
      return baseUrl
  }
}
