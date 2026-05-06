import { useEffect, useState, useCallback } from 'react'

const LS_KEY = 'cameraDeviceId'

/**
 * useCameraSelection — manages the list of available video input devices and
 * the currently-selected one, persisted to localStorage so the choice survives
 * reloads. Used by <CameraPicker /> on the Security dashboard and the admin
 * face enrollment modal so the user can switch between the laptop webcam and
 * the iPhone-via-DroidCam without touching browser settings.
 *
 * Returns:
 *   devices       — [{ deviceId, label }] of all video inputs we can see
 *   selectedId    — currently chosen deviceId (or '' if none picked yet)
 *   setSelectedId — set + persist the choice
 *   refresh       — re-enumerate (call after plugging DroidCam in mid-session)
 *   ready         — false until enumerateDevices has resolved at least once
 */
export function useCameraSelection() {
  const [devices, setDevices] = useState([])
  const [selectedId, setSelectedIdState] = useState(
    () => localStorage.getItem(LS_KEY) || ''
  )
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setReady(true)
      return
    }
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const cams = all
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          // device.label is empty until the user has granted camera permission
          // at least once. Show a friendly fallback so the dropdown isn't blank
          // before the first scan.
          label: d.label || `Camera ${i + 1}`,
        }))
      setDevices(cams)

      // If our stored choice no longer exists (DroidCam unplugged, etc.),
      // fall back to the first device so the page isn't stuck.
      const stored = localStorage.getItem(LS_KEY) || ''
      if (stored && !cams.some((c) => c.deviceId === stored)) {
        setSelectedIdState(cams[0]?.deviceId || '')
      } else if (!stored && cams.length) {
        // First-ever load — pre-select first device but don't persist yet
        // (let the user explicitly pick to commit to localStorage).
        setSelectedIdState(cams[0].deviceId)
      }
    } catch (err) {
      // Ignore; UI will show empty dropdown
    } finally {
      setReady(true)
    }
  }, [])

  // Re-enumerate when devices come or go (USB plug/unplug, DroidCam start/stop)
  useEffect(() => {
    refresh()
    const onChange = () => refresh()
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange)
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', onChange)
    }
  }, [refresh])

  const setSelectedId = useCallback((id) => {
    setSelectedIdState(id)
    if (id) localStorage.setItem(LS_KEY, id)
    else localStorage.removeItem(LS_KEY)
  }, [])

  return { devices, selectedId, setSelectedId, refresh, ready }
}
