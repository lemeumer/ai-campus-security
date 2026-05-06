/**
 * React hook for Firebase Cloud Messaging integration
 *
 * Handles:
 * - Initializing Firebase on mount
 * - Requesting notification permission
 * - Registering device token with backend
 * - Setting up foreground message handler
 */

import { useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import {
  initFirebase,
  registerDeviceToken,
  sendDeviceTokenToBackend,
  setupForegroundMessageHandler,
  isNotificationsEnabled,
} from '../config/firebase'

export function useFirebaseNotifications() {
  const unsubscribeRef = useRef(null)

  const initializeNotifications = useCallback(async () => {
    try {
      // 1. Initialize Firebase
      const { messaging } = initFirebase()
      if (!messaging) {
        console.info('[Notifications] Firebase not configured, skipping')
        return
      }

      // 2. Check if we already have permission
      if (Notification.permission === 'default') {
        // First time — ask for permission
        const token = await registerDeviceToken()
        if (token) {
          const result = await sendDeviceTokenToBackend(token)
          if (result) {
            toast.success('Push notifications enabled', { duration: 3000 })
          }
        } else {
          console.info('[Notifications] User did not grant permission')
        }
      } else if (Notification.permission === 'granted') {
        // Already have permission — get/update token
        const token = await registerDeviceToken()
        if (token) {
          await sendDeviceTokenToBackend(token)
        }
      } else {
        // Denied permission
        console.info('[Notifications] User has denied notification permission')
      }

      // 3. Set up foreground message handler
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
      }

      unsubscribeRef.current = setupForegroundMessageHandler((message) => {
        // Show toast for foreground messages
        const action = message.data?.action || ''
        const isDenial = action.includes('denial') || message.body.includes('denied')
        const isEnrollment = action.includes('enrollment')

        if (isDenial) {
          // Show alert-style toast for security denials
          toast.error(`⚠️ ${message.title}`, {
            duration: 7000,
            icon: '🚫',
          })
        } else if (isEnrollment) {
          toast.success(`✅ ${message.title}`, {
            duration: 5000,
          })
        } else {
          // Regular notification toast
          toast(`📬 ${message.body}`, {
            duration: 4000,
          })
        }
      })
    } catch (err) {
      console.error('[Notifications] Initialization failed:', err)
    }
  }, [])

  // Initialize on mount
  useEffect(() => {
    initializeNotifications()

    // Cleanup
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
      }
    }
  }, [initializeNotifications])

  return {
    isEnabled: isNotificationsEnabled(),
    initializeNotifications,
  }
}

/**
 * Helper hook to show a notification permission banner
 */
export function useNotificationPermissionBanner() {
  const [showBanner, setShowBanner] = useRef(true)

  const dismiss = useCallback(() => {
    setShowBanner(false)
  }, [])

  const shouldShow = showBanner && Notification.permission === 'default'

  return {
    shouldShow,
    dismiss,
  }
}
