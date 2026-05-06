import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * useWebcam — manages a getUserMedia stream attached to a <video> element.
 *
 * Returns:
 *   videoRef     — attach to <video ref={videoRef} autoPlay playsInline muted />
 *   stream       — the active MediaStream (null until ready)
 *   ready        — true once the video has a real frame (loadedmetadata fired)
 *   error        — Error object if access failed (NotAllowed, NotFound, etc.)
 *   capture()    — returns a base64 JPEG (data URL) of the current frame, or null
 *   stop()       — stops all tracks; called automatically on unmount
 *
 * Usage:
 *   const { videoRef, ready, error, capture } = useWebcam({ width: 640, height: 480 })
 *
 * Camera is started automatically on mount, stopped on unmount.
 * Pass enabled=false to delay startup (e.g. only start when modal opens).
 */
export function useWebcam({
  enabled = true,
  width = 640,
  height = 480,
  facingMode = 'user',
  jpegQuality = 0.92,
  // When set, ask the browser for THIS specific camera (e.g. DroidCam) instead
  // of letting the OS pick the default. Comes from useCameraSelection /
  // <CameraPicker />. When the user changes it, the stream restarts.
  deviceId = null,
} = {}) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const canvasRef = useRef(null)  // hidden offscreen canvas for capture
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [stream, setStream] = useState(null)

  // ── Start / stop ──────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setStream(null)
    setReady(false)
  }, [])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Browser does not support camera access (mediaDevices API missing)')
        }
        // When a specific deviceId is requested (DroidCam, etc.), it takes
        // precedence over facingMode. Use `exact` so the browser refuses to
        // silently fall back to the laptop webcam if DroidCam is unplugged
        // — better to surface an error than scan with the wrong camera.
        const videoConstraints = {
          width: { ideal: width },
          height: { ideal: height },
        }
        if (deviceId) {
          videoConstraints.deviceId = { exact: deviceId }
        } else {
          videoConstraints.facingMode = facingMode
        }
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        })
        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = mediaStream
        setStream(mediaStream)
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
          // Wait for the first real frame before signalling ready
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(() => { /* autoplay gating, ignore */ })
            setReady(true)
          }
        }
      } catch (err) {
        if (!cancelled) setError(err)
      }
    }

    start()
    return () => {
      cancelled = true
      stop()
    }
  }, [enabled, width, height, facingMode, deviceId, stop])

  // ── Capture a frame as base64 JPEG ────────────────────────────────────────
  const capture = useCallback(() => {
    const video = videoRef.current
    if (!video || !ready) return null
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return null

    if (!canvasRef.current) canvasRef.current = document.createElement('canvas')
    const canvas = canvasRef.current
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    // Mirror the image so the captured photo matches the on-screen preview
    // (which we mirror via CSS for natural UX). This gives correctly-oriented
    // training data without confusing the admin during framing.
    ctx.translate(w, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', jpegQuality)
  }, [ready, jpegQuality])

  return { videoRef, stream, ready, error, capture, stop }
}
