/**
 * Firebase Cloud Messaging configuration
 *
 * Phase 6: Real-time push notifications for gate access, enrollments, alerts
 *
 * Initializes Firebase and provides utilities for:
 * - Requesting notification permission
 * - Registering device tokens
 * - Handling incoming push messages
 */

import { initializeApp } from 'firebase/app'
import { getMessaging, onMessage, getToken } from 'firebase/messaging'

// Firebase config from environment or hardcoded for dev
// In production, load from .env.production
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'campus-security-demo.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'campus-security-demo',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'campus-security-demo.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:123456789:web:abcdef',
}

let app = null
let messaging = null
let initialized = false

/**
 * Initialize Firebase (safe to call multiple times)
 */
export function initFirebase() {
  if (initialized) return { app, messaging }

  try {
    app = initializeApp(firebaseConfig)
    // Check if service workers are supported
    if ('serviceWorker' in navigator) {
      messaging = getMessaging(app)
    }
    initialized = true
    console.log('[Firebase] Initialized successfully')
    return { app, messaging }
  } catch (err) {
    console.warn('[Firebase] Initialization failed:', err.message)
    return { app: null, messaging: null }
  }
}

/**
 * Request notification permission and register device token
 */
export async function registerDeviceToken() {
  if (!messaging) {
    console.warn('[Firebase] Messaging not initialized')
    return null
  }

  try {
    // Request permission
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.info('[Firebase] User denied notification permission')
      return null
    }

    // Get device token
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || 'demo-vapid-key',
    })

    if (!token) {
      console.warn('[Firebase] Failed to get device token')
      return null
    }

    console.log('[Firebase] Device token obtained')
    return token
  } catch (err) {
    console.error('[Firebase] Failed to register device token:', err)
    return null
  }
}

/**
 * Send device token to backend
 */
export async function sendDeviceTokenToBackend(token, deviceName) {
  if (!token) return null

  try {
    const response = await fetch('/api/auth/device-token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
      },
      body: JSON.stringify({
        token,
        device_name: deviceName || `${navigator.userAgent.split(' ').slice(-1)[0]}`,
      }),
    })

    if (!response.ok) {
      console.error('[Firebase] Failed to register token with backend')
      return null
    }

    const data = await response.json()
    console.log('[Firebase] Token registered with backend')
    return data
  } catch (err) {
    console.error('[Firebase] Backend registration failed:', err)
    return null
  }
}

/**
 * Set up foreground message handler (when user has the app open)
 * Called from a component's useEffect
 */
export function setupForegroundMessageHandler(onMessageCallback) {
  if (!messaging) {
    console.warn('[Firebase] Messaging not initialized for foreground handler')
    return () => {} // Return no-op unsubscribe
  }

  try {
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('[Firebase] Foreground message received:', payload)

      // Call the provided callback
      if (onMessageCallback) {
        onMessageCallback({
          title: payload.notification?.title || 'Campus Security',
          body: payload.notification?.body || 'New notification',
          data: payload.data || {},
        })
      }
    })

    return unsubscribe
  } catch (err) {
    console.error('[Firebase] Failed to set up foreground handler:', err)
    return () => {}
  }
}

/**
 * Check if notifications are enabled
 */
export function isNotificationsEnabled() {
  return messaging !== null && Notification.permission === 'granted'
}

export { messaging, app }
