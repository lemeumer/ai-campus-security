import { useState, useRef, useEffect, useCallback } from 'react'
import { authApi } from '../../api/auth'
import { faceDetectionApi } from '../../api/face'
import StatCard from '../../components/ui/StatCard'
import { StatusBadge } from '../../components/ui/Badge'
import AccessAlert from '../../components/security/AccessAlert'
import CameraPicker from '../../components/ui/CameraPicker'
import { useCameraSelection } from '../../hooks/useCameraSelection'
import {
  HiShieldCheck, HiCamera, HiIdentification, HiSearch, HiUserAdd,
  HiCheck, HiX, HiUsers, HiClock, HiLightningBolt, HiLockClosed,
} from 'react-icons/hi'
import toast from 'react-hot-toast'

const SCAN_MODES = [
  // The strictest mode is listed first because it's the recommended default
  // for normal traffic — face AND card must both authenticate to the same
  // user, which catches impersonation attempts (correct face, wrong card,
  // or vice versa).
  { id: 'face_card', label: 'Face + Card', icon: HiLockClosed,     desc: 'Strict: face must match card holder' },
  { id: 'face',      label: 'Face Scan',   icon: HiCamera,         desc: 'Facial recognition via camera' },
  { id: 'card',      label: 'Card Scan',   icon: HiIdentification, desc: 'Campus card OCR' },
  { id: 'visitor',   label: 'Visitor',     icon: HiUserAdd,        desc: 'Register a walk-in via CNIC' },
  { id: 'manual',    label: 'Manual ID',   icon: HiSearch,         desc: 'Enter campus ID manually' },
]

const METHOD_CHIP = {
  BIOMETRIC:      { label: '👁 Face',         bg: '#eff6ff', color: '#1d4ed8' },
  CARD:           { label: '🪪 Card',         bg: '#f0fdf4', color: '#15803d' },
  FACE_CARD:      { label: '🔒 Face + Card',  bg: '#f5f3ff', color: '#6d28d9' },
  MANUAL:         { label: '✍ Manual',        bg: '#faf5ff', color: '#6d28d9' },
}

export default function SecurityDashboard() {
  const [mode, setMode]           = useState('face')
  const [entryType, setEntryType] = useState('ENTRY')
  const [manualId, setManualId]   = useState('')
  const [cameraOn, setCameraOn]   = useState(false)
  const [scanning, setScanning]   = useState(false)
  const [result, setResult]       = useState(null)
  // Real gate entries from PostgreSQL — populated on mount and after every
  // successful scan. No more sample/fake data on this page.
  const [log, setLog]             = useState([])
  const [logLoading, setLogLoading] = useState(true)
  // Full-screen alert state. Fires whenever a face/card scan is rejected.
  const [denyAlert, setDenyAlert] = useState(null)  // { reason, subject }
  // Visitor flow state. After CNIC OCR fires, the form opens pre-filled with
  // whatever was extracted; security can edit + pick a host before submitting.
  const [visitorDraft, setVisitorDraft] = useState(null)
  // Face+Card mode state — face frame is captured first, then card frame,
  // then we submit both together to /verify-face-card/.
  const [fcStep, setFcStep] = useState('face')   // 'face' | 'card' | 'submitting' | 'done'
  const [fcFaceImage, setFcFaceImage] = useState(null)
  const [fcCardImage, setFcCardImage] = useState(null)
  const [visitorScanning, setVisitorScanning] = useState(false)
  // Auto-capture-when-stable status — drives the camera overlay pill so the
  // guard knows whether to hold steady or wait. Values:
  //   'idle'      — auto-capture not active for this mode
  //   'searching' — sampling for stability, waiting for a steady frame
  //   'stable'    — got a steady frame, capture is firing now
  //   'cooldown'  — just fired; pause auto-fire until the result clears
  const [autoCaptureStatus, setAutoCaptureStatus] = useState('idle')
  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const canvasRef = useRef(null)
  // Held outside React state because we mutate it every 150ms; storing in
  // useState would re-render the whole dashboard at that cadence.
  const stabilityRef = useRef({ prev: null, stableHits: 0, cooldownUntil: 0 })
  // Lets the stability effect call the latest scan handler without listing
  // every handler in the dep array (which would tear down the watcher on
  // every render and lose the rolling diff history).
  const stableTriggerRef = useRef(null)

  // Camera source — laptop webcam vs DroidCam (iPhone), persisted to
  // localStorage so the picker shares state with the admin enrollment modal.
  // When the user changes camera the effect below restarts the stream.
  const { selectedId: cameraDeviceId } = useCameraSelection()

  // ── Fetch real gate-entry log on mount ───────────────────────────────────
  const fetchLog = useCallback(async () => {
    try {
      const res = await authApi.getGateEntries()
      setLog(res.data || [])
    } catch (err) {
      // Don't crash the page if the backend is unreachable — leave the log empty
      console.warn('Could not load gate entries:', err)
    } finally {
      setLogLoading(false)
    }
  }, [])
  useEffect(() => { fetchLog() }, [fetchLog])

  const stats = {
    inside:       log.filter(e => e.type === 'ENTRY'  && e.status === 'GRANTED').length,
    todayEntries: log.filter(e => e.type === 'ENTRY').length,
    denied:       log.filter(e => e.status === 'DENIED').length,
  }

  /* ── Camera helpers ─────────────────────────────────── */
  const startCamera = useCallback(async () => {
    // Stop any existing stream first so switching cameras releases the old
    // device cleanly (otherwise Windows can complain that the camera is in
    // use by another app, including DroidCam Client itself).
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    // Try the user's chosen camera with `exact` first. If that fails (the
    // device went away, deviceId is stale from before permission was granted,
    // or DroidCam isn't actually plugged in), fall back to the default camera
    // and tell the user WHY — generic "access denied" messages are useless
    // for debugging. Errors land in console.error so you can see the raw
    // DOMException name/message in DevTools too.
    const attempt = async (constraints) =>
      navigator.mediaDevices.getUserMedia({ video: constraints })

    // Negotiate the highest sane resolution. `ideal` lets the camera pick its
    // best mode up to that limit; if the device can't deliver 1080p the
    // browser silently downgrades. The `min` floor keeps OCR usable on
    // potato webcams (480p is the absolute lower bound for legible card text).
    //
    // Why we care: OCR accuracy is roughly linear in pixels-per-character.
    // A campus card filling ~1/4 of a 640×480 frame gives each glyph ~10px;
    // EasyOCR needs ~16-20px to recognise reliably. Bumping to 1920×1080
    // quadruples pixel density and turns previously-illegible enrollment
    // numbers into clean reads. iPhone-via-DroidCam easily delivers 1080p.
    const HQ_VIDEO = {
      width:  { ideal: 1920, min: 640 },
      height: { ideal: 1080, min: 480 },
      // Lock to back camera on phones. Ignored on laptops without facingMode.
      facingMode: { ideal: 'environment' },
    }

    try {
      let stream
      if (cameraDeviceId) {
        try {
          stream = await attempt({ deviceId: { exact: cameraDeviceId }, ...HQ_VIDEO })
        } catch (specificErr) {
          console.warn('[camera] requested deviceId failed, falling back to default:', specificErr)
          toast.error(
            `Selected camera unavailable (${specificErr.name}). Falling back to default. ` +
            `Open DroidCam Client and click Start, then re-pick from the dropdown.`,
            { duration: 6000 },
          )
          stream = await attempt(HQ_VIDEO)
        }
      } else {
        stream = await attempt(HQ_VIDEO)
      }
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraOn(true)

      // Log which camera actually got attached so you can verify in DevTools
      // whether DroidCam was picked up. Track.label is populated once
      // permission is granted.
      const track = stream.getVideoTracks()[0]
      console.info('[camera] active source:', track?.label || '(unknown)', track?.getSettings?.())
    } catch (err) {
      console.error('[camera] getUserMedia failed:', err)
      const human = {
        NotAllowedError:    'Camera permission was denied — click the camera icon in the address bar and Allow.',
        NotFoundError:      'No camera was found by the browser. Is DroidCam Client running and connected to the iPhone?',
        NotReadableError:   'Camera is in use by another app. Close DroidCam Client preview, Zoom, OBS, etc., then retry.',
        OverconstrainedError:'No camera matched the requested settings. Open the picker and choose a different source.',
        SecurityError:      'Browser blocked camera access. If you opened the page over http://, switch to localhost.',
      }[err.name] || `Camera failed to start: ${err.name} — ${err.message}`
      toast.error(human, { duration: 7000 })
    }
  }, [cameraDeviceId])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCameraOn(false)
  }, [])

  useEffect(() => {
    // Camera is needed for face / card / visitor / face_card modes.
    // Re-runs when the user switches camera source so DroidCam ↔ laptop swaps
    // take effect immediately without reloading the page.
    if (['face', 'card', 'visitor', 'face_card'].includes(mode)) startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [mode, startCamera, stopCamera])

  const captureFrame = ({ mirror = true } = {}) => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return null
    // Capture the FULL native frame — no cropping. This lets the user move
    // the card closer to the camera for clarity without us throwing pixels
    // away at capture time. OCR-bound captures use higher JPEG quality
    // (0.95) because compression artefacts degrade tiny printed text far
    // more than they degrade face features.
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (mirror) {
      // Face scan path: mirror so it matches both the on-screen preview and
      // how enrolment frames were captured (the AI expects a consistent
      // orientation).
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0)
    } else {
      // Card scan path: capture raw orientation so OCR reads the printed
      // text the right way round. The on-screen preview is still mirrored
      // (we don't change the CSS), but for card scanning the user typically
      // looks at the card in their hand rather than at the preview.
      ctx.drawImage(video, 0, 0)
    }
    // Mirrored = face-mode capture (smaller payload, ArcFace is robust to
    // JPEG noise). Unmirrored = OCR-mode (cards / CNIC) — push quality up
    // because a single misread digit invalidates the whole scan.
    return canvas.toDataURL('image/jpeg', mirror ? 0.85 : 0.95)
  }

  // Burst capture for OCR scans: snap N frames spaced `intervalMs` apart
  // so the backend can consensus-vote across them. Hand jitter and focus
  // refresh between frames give the OCR multiple shots at the same text,
  // which materially raises accuracy on noisy phone-camera input.
  //
  // Returns an array of base64 data-URLs; rejects if the camera can't
  // produce at least one frame.
  const captureBurst = async ({ count = 3, intervalMs = 150, mirror = false } = {}) => {
    const frames = []
    for (let i = 0; i < count; i++) {
      const f = captureFrame({ mirror })
      if (f) frames.push(f)
      if (i < count - 1) {
        await new Promise(r => setTimeout(r, intervalMs))
      }
    }
    return frames
  }

  // Optimistic prepend so the UI feels instant, then refetch from the server so
  // we always reflect the real gate_entries table (no stale or fake rows).
  const addToLog = (entry) => {
    setLog(prev => [{ id: `tmp-${Date.now()}`, ...entry }, ...prev.slice(0, 19)])
    fetchLog()
  }

  /* ── Scan handlers ──────────────────────────────────── */
  const handleFaceScan = async () => {
    setScanning(true); setResult(null)
    try {
      const image = captureFrame()
      if (!image) throw new Error('Could not capture frame')

      const res = await faceDetectionApi.verifyFace(image)
      const { granted, user, reason, enrollment_id, confidence } = res.data
      setResult({ granted, user, reason, confidence })

      if (granted) {
        // Two follow-up calls in parallel:
        //   - log the gate entry (audit trail in gate_entries table)
        //   - bump match counter on the enrollment row (per-enrollment usage stats)
        // Both are best-effort — a failure here shouldn't block the user.
        await Promise.allSettled([
          authApi.gateEntry({
            user_id: user.id,
            type: entryType,
            method: 'BIOMETRIC',
            face_snapshot: image,
          }),
          enrollment_id ? authApi.recordEnrollmentMatch(enrollment_id) : Promise.resolve(),
        ])
        addToLog({
          name: user.full_name, role: user.role, university_id: user.university_id,
          time: new Date().toTimeString().slice(0, 5),
          type: entryType, method: 'BIOMETRIC', status: 'GRANTED',
        })
        toast.success(
          `Access ${entryType === 'ENTRY' ? 'granted' : 'exit recorded'}: ${user.full_name}` +
          (typeof confidence === 'number' ? ` (${(confidence * 100).toFixed(0)}%)` : ''),
          { duration: 4000 },
        )
      } else {
        addToLog({
          name: 'Unknown', role: '-', university_id: '-',
          time: new Date().toTimeString().slice(0, 5),
          type: entryType, method: 'BIOMETRIC', status: 'DENIED',
        })
        const denyReason = reason || 'Face not recognised'
        toast.error(denyReason)
        // Loud full-screen alert so the guard can't miss a denial.
        setDenyAlert({
          reason: denyReason,
          subject: confidence != null ? `Match confidence ${(confidence * 100).toFixed(0)}%` : null,
        })
      }
    } catch (err) {
      // Real errors surface real messages — no more silent demo-user fallback.
      // The admin needs to know if the face service is offline so they can fix it.
      const status = err.response?.status
      const detail = err.response?.data?.detail || err.response?.data?.error || err.message
      let msg = 'Face verification failed'
      if (!err.response) {
        msg = 'Face recognition service offline. Start the FastAPI service and retry.'
      } else if (status === 422) {
        msg = detail || 'No face detected in frame — try again'
      } else if (detail) {
        msg = detail
      }
      setResult({ granted: false, reason: msg })
      toast.error(msg, { duration: 5000 })
      // Errors that look like genuine denials (not infrastructure failures)
      // also trigger the alert. A "service offline" doesn't, that's a system
      // issue not a security event.
      if (err.response) {
        setDenyAlert({ reason: msg, subject: null })
      }
    } finally {
      setScanning(false)
    }
  }

  const handleCardScan = async () => {
    setScanning(true); setResult(null)
    try {
      // Burst capture (3 frames @ 150ms apart, ~450ms total) for consensus
      // OCR. Backend runs OCR per frame and votes per field — much more
      // tolerant of hand jitter and focus oscillation than a single shot.
      const frames = await captureBurst({ count: 3, intervalMs: 150, mirror: false })
      if (frames.length === 0) throw new Error('Could not capture frame')
      const res = await faceDetectionApi.scanCard(frames)
      const { granted, user, reason } = res.data
      // Pull every field the OCR extracted so we can render them in the result card
      const card = {
        enrollment_number: res.data.enrollment_number,
        university_id:     res.data.university_id,
        name:              res.data.name,
        card_type:         res.data.card_type,
        program:           res.data.program,
        campus:            res.data.campus,
        issued_on:         res.data.issued_on,
        valid_upto:        res.data.valid_upto,
        serial_no:         res.data.serial_no,
        ocr_engine:        res.data.ocr_engine,
      }
      setResult({ granted, user, reason, card })

      const idLabel = card.enrollment_number || card.university_id

      if (granted) {
        // Use the middle frame from the burst as the audit snapshot — it's
        // typically the steadiest after the user finishes positioning the card.
        const cardSnap = frames[Math.floor(frames.length / 2)] || frames[0]
        await authApi.gateEntry({
          user_id: user.id,
          type: entryType,
          method: 'CARD',
          card_snapshot: cardSnap,
        })
        addToLog({
          name: user.full_name, role: user.role,
          university_id: user.enrollment_number || user.university_id,
          time: new Date().toTimeString().slice(0, 5),
          type: entryType, method: 'CARD', status: 'GRANTED',
        })
        toast.success(
          `Card scan accepted: ${user.full_name}` + (idLabel ? ` (${idLabel})` : ''),
          { duration: 4000 },
        )
      } else {
        addToLog({
          name: idLabel ? 'Unregistered card' : 'Unknown',
          role: '-',
          university_id: idLabel || '-',
          time: new Date().toTimeString().slice(0, 5),
          type: entryType, method: 'CARD', status: 'DENIED',
        })
        const denyReason = reason || 'Card scan rejected'
        toast.error(denyReason, { duration: 5000 })
        setDenyAlert({
          reason: denyReason,
          subject: idLabel ? `Card ID: ${idLabel}` : (card.name ? `Card name: ${card.name}` : null),
        })
      }
    } catch (err) {
      const status = err.response?.status
      const detail = err.response?.data?.detail || err.response?.data?.error || err.message
      let msg = 'Card scan failed'
      if (!err.response) {
        msg = 'Card OCR service offline. Start the FastAPI service and retry.'
      } else if (status === 422) {
        msg = detail || 'Could not read the card. Try again with better lighting.'
      } else if (detail) {
        msg = detail
      }
      setResult({ granted: false, reason: msg })
      toast.error(msg, { duration: 5000 })
      if (err.response) {
        setDenyAlert({ reason: msg, subject: null })
      }
    } finally {
      setScanning(false)
    }
  }

  // ── Face + Card cross-match ─────────────────────────────────────────
  // Two-step capture: face first (mirrored, like normal face mode), then
  // card (un-mirrored so OCR reads correctly). Once both are captured we
  // POST them together; backend rejects unless face_user.id == card_user.id.
  const fcReset = () => { setFcStep('face'); setFcFaceImage(null); setFcCardImage(null) }

  const fcCaptureFace = () => {
    const img = captureFrame({ mirror: true })
    if (!img) { toast.error('Camera not ready'); return }
    setFcFaceImage(img)
    setFcStep('card')
    toast('Now hold up the campus card', { icon: '🪪', duration: 3000 })
  }

  const fcCaptureCard = async () => {
    const img = captureFrame({ mirror: false })
    if (!img) { toast.error('Camera not ready'); return }
    setFcCardImage(img)
    setFcStep('submitting')
    setResult(null)

    try {
      const { data } = await faceDetectionApi.verifyFaceCard(fcFaceImage, img)
      const {
        granted, matched, reason,
        face_user, card_user, card_id, confidence, enrollment_id, card_fields,
      } = data
      setResult({
        granted, reason, matched,
        user: granted ? face_user : null,
        face_user, card_user, card_id, card: card_fields,
        confidence,
      })

      if (granted) {
        // Same audit trail as face-only mode but tagged FACE_CARD so the
        // gate log distinguishes strict-mode entries from single-factor.
        await Promise.allSettled([
          authApi.gateEntry({
            user_id: face_user.id,
            type: entryType,
            method: 'FACE_CARD',
            face_snapshot: fcFaceImage,
            card_snapshot: fcCardImage,
          }),
          enrollment_id ? authApi.recordEnrollmentMatch(enrollment_id) : Promise.resolve(),
        ])
        addToLog({
          name: face_user.full_name, role: face_user.role,
          university_id: face_user.university_id,
          time: new Date().toTimeString().slice(0, 5),
          type: entryType, method: 'FACE_CARD', status: 'GRANTED',
        })
        toast.success(
          `Cross-match accepted: ${face_user.full_name}` +
          (typeof confidence === 'number' ? ` (${(confidence * 100).toFixed(0)}%)` : ''),
          { duration: 4500 },
        )
        setFcStep('done')
        // Auto-reset after a moment so the next person can scan
        setTimeout(fcReset, 2500)
      } else {
        addToLog({
          name: face_user?.full_name || card_user?.full_name || 'Unknown',
          role: '-',
          university_id: card_id || face_user?.university_id || '-',
          time: new Date().toTimeString().slice(0, 5),
          type: entryType, method: 'FACE_CARD', status: 'DENIED',
        })
        toast.error(reason || 'Cross-match failed', { duration: 5000 })
        // Loud alert — items 1+2 from the user's punchlist. The mismatch
        // case (face known, card known, both different) is the most
        // alarming so we surface that subject prominently.
        const subject = !matched && face_user && card_user
          ? `Face: ${face_user.full_name}  ·  Card: ${card_user.full_name}`
          : null
        setDenyAlert({
          reason: reason || 'Cross-match failed',
          subject,
        })
        setFcStep('face')
        setFcFaceImage(null); setFcCardImage(null)
      }
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.error || err.message
      const offline = !err.response
      const msg = offline
        ? 'Face recognition service offline. Start the FastAPI service and retry.'
        : (detail || 'Cross-match request failed')
      toast.error(msg, { duration: 5000 })
      if (!offline) setDenyAlert({ reason: msg, subject: null })
      fcReset()
    }
  }

  // Reset Face+Card state whenever the user switches AWAY from this mode
  // so re-entering it starts clean.
  useEffect(() => {
    if (mode !== 'face_card') fcReset()
  }, [mode])

  // ── Auto-capture-when-stable ───────────────────────────────────────────────
  //
  // Monitors the live video for a 'still' frame (low pixel diff vs the previous
  // sample) and auto-fires the appropriate capture handler when 3 consecutive
  // samples are below the motion threshold. The manual scan button stays as
  // an override — auto-capture is additive, never blocking.
  //
  // Tradeoffs:
  //   - 160×120 sample size (12.5 KB/tick) is small enough to run cheap on
  //     the main thread; a Web Worker would be overkill.
  //   - 150ms tick interval is the same cadence as the burst spacing, so
  //     "3 stable hits" ≈ 450ms of held-still — feels responsive without
  //     firing on accidental pauses.
  //   - 4-second cooldown after firing prevents the watcher from re-triggering
  //     on the SAME stable card while the response is rendering.

  // Keep the trigger ref pointed at the latest handlers so the watcher effect
  // doesn't need them in its dep array (which would tear down + restart the
  // sampler every render).
  useEffect(() => {
    if (mode === 'card' && !scanning) {
      stableTriggerRef.current = handleCardScan
    } else if (mode === 'visitor' && !visitorScanning && !visitorDraft) {
      stableTriggerRef.current = handleVisitorScan
    } else if (mode === 'face_card' && fcStep === 'face' && !fcFaceImage) {
      stableTriggerRef.current = fcCaptureFace
    } else if (mode === 'face_card' && fcStep === 'card' && !fcCardImage) {
      stableTriggerRef.current = fcCaptureCard
    } else {
      stableTriggerRef.current = null
    }
  })

  useEffect(() => {
    const enabled =
      cameraOn &&
      !scanning && !visitorScanning &&
      ((mode === 'card') ||
       (mode === 'visitor' && !visitorDraft) ||
       (mode === 'face_card' && (fcStep === 'face' || fcStep === 'card') &&
        !(fcStep === 'face' && fcFaceImage) &&
        !(fcStep === 'card' && fcCardImage)))

    if (!enabled) {
      setAutoCaptureStatus('idle')
      stabilityRef.current = { prev: null, stableHits: 0, cooldownUntil: 0 }
      return
    }

    setAutoCaptureStatus('searching')
    const sampler = document.createElement('canvas')
    sampler.width = 160; sampler.height = 120
    const sctx = sampler.getContext('2d', { willReadFrequently: true })

    const SAMPLE_INTERVAL_MS = 150
    // Mean abs diff per pixel (0–255). Low enough that small focus drift
    // doesn't trip it but high enough that fingertip jitter resets it.
    const STABLE_THRESHOLD = 6.0
    const STABLE_HITS = 3   // ≈ 450ms held still
    const COOLDOWN_MS = 4000

    const tick = () => {
      const video = videoRef.current
      if (!video || video.readyState < 2) return
      const ref = stabilityRef.current
      if (Date.now() < ref.cooldownUntil) return

      try {
        sctx.drawImage(video, 0, 0, sampler.width, sampler.height)
        const cur = sctx.getImageData(0, 0, sampler.width, sampler.height).data
        if (ref.prev) {
          let diffSum = 0
          // Walk every 4 bytes (RGBA); we only need a luma-ish diff so the
          // average of R/G/B is fine — the goal is motion detection, not
          // colorimetric accuracy.
          for (let i = 0; i < cur.length; i += 4) {
            const g0 = (ref.prev[i] + ref.prev[i + 1] + ref.prev[i + 2]) / 3
            const g1 = (cur[i] + cur[i + 1] + cur[i + 2]) / 3
            diffSum += Math.abs(g1 - g0)
          }
          const meanDiff = diffSum / (cur.length / 4)

          if (meanDiff < STABLE_THRESHOLD) {
            ref.stableHits += 1
            if (ref.stableHits >= STABLE_HITS) {
              ref.stableHits = 0
              ref.cooldownUntil = Date.now() + COOLDOWN_MS
              setAutoCaptureStatus('stable')
              const fire = stableTriggerRef.current
              if (typeof fire === 'function') fire()
            }
          } else {
            ref.stableHits = 0
            setAutoCaptureStatus('searching')
          }
        }
        // Copy because the next getImageData call may reuse the buffer.
        ref.prev = new Uint8ClampedArray(cur)
      } catch {
        // Sampling failed (e.g. camera was paused) — let the next tick retry.
      }
    }

    const interval = setInterval(tick, SAMPLE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [mode, cameraOn, scanning, visitorScanning, visitorDraft, fcStep,
      fcFaceImage, fcCardImage])

  const handleVisitorScan = async () => {
    setVisitorScanning(true)
    try {
      // Burst capture for CNIC — same rationale as card scan: 3 frames
      // give the backend room to vote per field.
      const frames = await captureBurst({ count: 3, intervalMs: 150, mirror: false })
      if (frames.length === 0) throw new Error('Could not capture frame')
      const { data } = await faceDetectionApi.scanCnic(frames)

      // Build the visitor draft. The form's CNIC input expects 13 digits (no
      // dashes) so we seed it with `cnic_digits`; `cnic_display` is shown
      // alongside as the formatted "XXXXX-XXXXXXX-X" for the guard to verify.
      // _autofilled tracks which fields came from OCR so the form can render
      // a visible "Auto-filled from CNIC" badge — without this the guard has
      // no way to tell the field was populated and assumes manual entry.
      const autofilled = new Set()
      if (data.name)        autofilled.add('full_name')
      if (data.cnic_digits) autofilled.add('cnic')
      // Keep one CNIC frame around so the visitor row gets a photo when
      // the guard hits Submit; the burst frames otherwise go out of scope
      // here and the saved Visitor.photo would always be null.
      const photoFrame = frames[Math.floor(frames.length / 2)] || frames[0] || null
      const baseDraft = {
        full_name:      data.name || '',
        cnic:           data.cnic_digits || '',
        cnic_display:   data.cnic || null,
        father_name:    data.father_name || '',
        gender:         data.gender || '',
        date_of_birth:  data.date_of_birth || '',
        date_of_issue:  data.date_of_issue || '',
        date_of_expiry: data.date_of_expiry || '',
        ocr_raw_text:   data.raw_text || [],
        photo:          photoFrame,
        phone_number: '',
        purpose: '',
        host_user: null,
        host_user_label: '',
        host_department: '',
        _autofilled:    autofilled,
        _ocrEngine:     data.ocr_engine || null,
        _ocrFound:      !!data.found,
      }

      if (!data.found) {
        toast.error(
          data.reason || 'Could not read the CNIC. Try again with better lighting.',
          { duration: 5000 },
        )
        setVisitorDraft(baseDraft)
        return
      }

      toast.success(`CNIC ${data.cnic} read. Confirm details below.`, { duration: 4000 })
      setVisitorDraft(baseDraft)
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.error || err.message
      toast.error(
        !err.response
          ? 'Card OCR service offline. Start the FastAPI service and retry.'
          : (detail || 'CNIC scan failed'),
        { duration: 5000 },
      )
    } finally {
      setVisitorScanning(false)
    }
  }

  const submitVisitor = async () => {
    if (!visitorDraft) return
    if (!visitorDraft.full_name.trim()) {
      toast.error('Visitor name is required'); return
    }
    if (!/^\d{13}$/.test((visitorDraft.cnic || '').replace(/\D/g, ''))) {
      toast.error('CNIC must be 13 digits'); return
    }
    if (!visitorDraft.host_user) {
      toast.error('Pick the host being visited'); return
    }
    try {
      const payload = {
        full_name:       visitorDraft.full_name.trim(),
        cnic:            visitorDraft.cnic.replace(/\D/g, ''),
        phone_number:    visitorDraft.phone_number.trim(),
        purpose:         visitorDraft.purpose.trim(),
        host_user:       visitorDraft.host_user,
        host_department: visitorDraft.host_department.trim(),
        ocr_raw_text:    visitorDraft.ocr_raw_text || [],
        photo:           visitorDraft.photo || undefined,
      }
      const { data } = await authApi.createVisitor(payload)
      toast.success(`Visitor ${data.full_name} registered. Host: ${data.host_name}.`, { duration: 4500 })
      setVisitorDraft(null)
      fetchLog()  // refresh the gate log so the entry shows up
    } catch (err) {
      const data = err.response?.data
      const msg = data?.error || data?.detail
        || (typeof data === 'object'
              ? Object.entries(data).map(([f, v]) => `${f}: ${Array.isArray(v) ? v[0] : v}`).join(' • ')
              : err.message)
      toast.error(String(msg || 'Could not register visitor'), { duration: 5000 })
    }
  }

  const handleManualEntry = async () => {
    if (!manualId.trim()) return toast.error('Enter a university ID')
    setScanning(true); setResult(null)
    try {
      const res = await authApi.getUsers({ university_id: manualId })
      const user = (res.data.results || res.data)[0]
      if (!user) throw new Error('User not found')
      const granted = user.status === 'ACTIVE'
      setResult({ granted, user, reason: granted ? null : `User is ${user.status}` })
      if (granted) {
        await authApi.gateEntry({ user_id: user.id, type: entryType, method: 'MANUAL' })
        addToLog({ name: user.full_name, role: user.role, university_id: user.university_id, time: new Date().toTimeString().slice(0,5), type: entryType, method: 'MANUAL', status: 'GRANTED' })
        toast.success(`Manual entry: ${user.full_name}`)
      } else {
        toast.error(`Access denied: ${user.status}`)
      }
    } catch {
      toast.error('User not found')
    } finally { setScanning(false); setManualId('') }
  }

  const isEntryMode = entryType === 'ENTRY'

  return (
    <div className="space-y-6">

      {/* ── Banner ─────────────────────────────────────── */}
      <div
        className="rounded-2xl p-7 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f172a, #1e3a5f, #1e40af)' }}
      >
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 75% 50%, #38bdf8, transparent 60%)' }} />

        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-blue-300 text-sm font-medium mb-1">Gate Control Centre</p>
            <h2 className="text-2xl font-bold">AI Based Access Control</h2>
            <p className="text-blue-300 text-sm mt-1">Facial recognition · Card OCR · Manual override</p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-blue-200 text-xs font-semibold">System Active</span>
          </div>
        </div>

        {/* ENTRY / EXIT toggle inside banner */}
        <div className="relative mt-5 flex gap-2">
          {['ENTRY', 'EXIT'].map(t => (
            <button
              key={t}
              onClick={() => setEntryType(t)}
              className="px-5 py-2 rounded-xl text-sm font-bold transition-all active:scale-95"
              style={entryType === t
                ? { background: t === 'ENTRY' ? '#10b981' : '#3b82f6', color: '#fff', boxShadow: t === 'ENTRY' ? '0 4px 12px rgba(16,185,129,0.4)' : '0 4px 12px rgba(59,130,246,0.4)' }
                : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }
              }
            >
              {t === 'ENTRY' ? '→ Entry' : '← Exit'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Currently Inside"  value={stats.inside}       icon={HiUsers}       color="green" />
        <StatCard label="Today's Entries"   value={stats.todayEntries} icon={HiClock}       color="blue" />
        <StatCard label="Access Denied"     value={stats.denied}       icon={HiShieldCheck} color="rose" />
      </div>

      {/* ── Main panels ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Scanner panel — 2 cols */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-50 flex items-center gap-2">
            <HiLightningBolt className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-bold text-slate-900">Scanner</h3>
            <span
              className="ml-auto text-[10px] font-bold px-2.5 py-0.5 rounded-full"
              style={isEntryMode
                ? { background: '#d1fae5', color: '#065f46' }
                : { background: '#dbeafe', color: '#1e40af' }}
            >
              {isEntryMode ? '→ ENTRY MODE' : '← EXIT MODE'}
            </span>
          </div>

          <div className="p-5 space-y-4">
            {/* Mode tabs */}
            <div className="grid grid-cols-3 gap-2">
              {SCAN_MODES.map(m => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className="p-3.5 rounded-xl border text-left transition-all"
                  style={mode === m.id
                    ? { background: '#eff6ff', borderColor: '#bfdbfe' }
                    : { background: '#f8fafc', borderColor: '#f1f5f9' }}
                >
                  <m.icon className="w-5 h-5 mb-1.5" style={{ color: mode === m.id ? '#1d4ed8' : '#94a3b8' }} />
                  <p className="text-xs font-bold" style={{ color: mode === m.id ? '#1e3a8a' : '#475569' }}>{m.label}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: mode === m.id ? '#60a5fa' : '#94a3b8' }}>{m.desc}</p>
                </button>
              ))}
            </div>

            {/* Camera source picker — only relevant in modes that use the
                webcam. Lets the guard switch between the laptop camera and
                the iPhone (DroidCam) for higher-quality OCR/face frames. */}
            {(mode === 'face' || mode === 'card' || mode === 'visitor' || mode === 'face_card') && (
              <CameraPicker compact />
            )}

            {/* Camera view */}
            {(mode === 'face' || mode === 'card' || mode === 'visitor' || mode === 'face_card') && (
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-video flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay muted playsInline
                  className="w-full h-full object-cover"
                  // Mirror only when capturing a face (face mode, or face_card
                  // mode while still on the face step). Cards / CNICs / the
                  // card step of face_card need raw orientation so OCR works.
                  style={{
                    transform:
                      mode === 'face' || (mode === 'face_card' && fcStep === 'face')
                        ? 'scaleX(-1)' : 'none',
                  }}
                />
                <canvas ref={canvasRef} className="hidden" />

                {!cameraOn && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center">
                      <HiCamera className="w-8 h-8 text-slate-500" />
                    </div>
                    <p className="text-slate-500 text-sm font-medium">Camera not active</p>
                    <button onClick={startCamera}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all active:scale-95"
                      style={{ background: '#1d4ed8' }}>
                      Enable Camera
                    </button>
                  </div>
                )}

                {cameraOn && (
                  <>
                    {/* Step indicator for Face+Card mode */}
                    {mode === 'face_card' && fcStep !== 'submitting' && fcStep !== 'done' && (
                      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: '#a855f7', animation: 'pulse 1.5s infinite' }}
                        />
                        <span className="text-white text-xs font-bold uppercase tracking-widest">
                          {fcStep === 'face' ? 'Step 1 of 2 · Show face' : 'Step 2 of 2 · Show card'}
                        </span>
                      </div>
                    )}

                    {/* Auto-capture status pill — replaces the placeholder
                        when active. Only shows in modes where the watcher is
                        running and not while another scan is in progress. */}
                    {autoCaptureStatus !== 'idle' && !scanning && !visitorScanning && (
                      <div className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{
                            background: autoCaptureStatus === 'stable' ? '#10b981' : '#f59e0b',
                            animation: autoCaptureStatus === 'searching' ? 'pulse 1s infinite' : 'none',
                          }}
                        />
                        <span className="text-white text-[10px] font-bold uppercase tracking-widest">
                          {autoCaptureStatus === 'stable'
                            ? 'Captured!'
                            : 'Auto-capture · hold steady'}
                        </span>
                      </div>
                    )}

                    {/* Corner overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="relative w-52 h-52">
                        <div className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-blue-400 rounded-tl-xl" />
                        <div className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-blue-400 rounded-tr-xl" />
                        <div className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-blue-400 rounded-bl-xl" />
                        <div className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-blue-400 rounded-br-xl" />
                        {scanning && (
                          <div className="absolute inset-x-0 top-0 h-0.5 bg-blue-400/80"
                            style={{ animation: 'scan-line 1.5s ease-in-out infinite' }} />
                        )}
                      </div>
                    </div>

                    {/* Scan button */}
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                      <button
                        onClick={
                          mode === 'face'      ? handleFaceScan
                        : mode === 'card'      ? handleCardScan
                        : mode === 'visitor'   ? handleVisitorScan
                        : mode === 'face_card' ? (fcStep === 'face' ? fcCaptureFace : fcCaptureCard)
                        : null
                        }
                        disabled={scanning || visitorScanning || fcStep === 'submitting' || fcStep === 'done'}
                        className="px-8 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-50"
                        style={{
                          background: mode === 'face_card'
                            ? 'linear-gradient(135deg,#6d28d9,#a855f7)'
                            : mode === 'visitor'
                              ? 'linear-gradient(135deg,#7c3aed,#a855f7)'
                              : isEntryMode
                                ? 'linear-gradient(135deg,#059669,#10b981)'
                                : 'linear-gradient(135deg,#2563eb,#3b82f6)',
                          boxShadow: mode === 'face_card'
                            ? '0 6px 20px rgba(168,85,247,0.4)'
                            : mode === 'visitor'
                              ? '0 6px 20px rgba(168,85,247,0.35)'
                              : isEntryMode
                                ? '0 6px 20px rgba(16,185,129,0.35)'
                                : '0 6px 20px rgba(59,130,246,0.35)',
                        }}
                      >
                        {(scanning || visitorScanning || fcStep === 'submitting') ? (
                          <span className="flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            {fcStep === 'submitting' ? 'Cross-matching…' : 'Scanning…'}
                          </span>
                        ) : mode === 'face_card'
                          ? (fcStep === 'face' ? 'Capture face' : fcStep === 'card' ? 'Capture card' : 'Done')
                        : mode === 'visitor'
                          ? 'Scan CNIC'
                          : `Scan & ${entryType}`}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Face+Card progress thumbnails */}
            {mode === 'face_card' && (fcFaceImage || fcCardImage) && (
              <div className="grid grid-cols-2 gap-3">
                <FcThumb
                  label="Face"
                  image={fcFaceImage}
                  active={fcStep === 'face'}
                  onClear={() => { setFcFaceImage(null); setFcStep('face') }}
                />
                <FcThumb
                  label="Card"
                  image={fcCardImage}
                  active={fcStep === 'card'}
                  onClear={() => { setFcCardImage(null); setFcStep(fcFaceImage ? 'card' : 'face') }}
                />
              </div>
            )}

            {/* Visitor form — opens after a CNIC scan */}
            {mode === 'visitor' && visitorDraft && (
              <VisitorForm
                draft={visitorDraft}
                setDraft={setVisitorDraft}
                onSubmit={submitVisitor}
                onCancel={() => setVisitorDraft(null)}
              />
            )}

            {/* Manual entry */}
            {mode === 'manual' && (
              <div className="flex gap-3 mt-2">
                <input
                  className="input flex-1 font-mono text-sm"
                  placeholder="Enter University ID (e.g. BU-CS-001)"
                  value={manualId}
                  onChange={e => setManualId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleManualEntry()}
                />
                <button
                  onClick={handleManualEntry}
                  disabled={scanning}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm text-white whitespace-nowrap transition-all active:scale-95 disabled:opacity-50"
                  style={{
                    background: isEntryMode ? '#059669' : '#2563eb',
                    boxShadow: isEntryMode ? '0 4px 12px rgba(16,185,129,0.3)' : '0 4px 12px rgba(59,130,246,0.3)',
                  }}
                >
                  {scanning ? 'Verifying…' : `Log ${entryType}`}
                </button>
              </div>
            )}

            {/* Result banner */}
            {result && (
              <div className="space-y-3">
                <div
                  className="flex items-center gap-4 p-4 rounded-2xl border"
                  style={result.granted
                    ? { background: '#f0fdf4', borderColor: '#86efac' }
                    : { background: '#fff1f2', borderColor: '#fca5a5' }}
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: result.granted ? '#dcfce7' : '#fee2e2' }}
                  >
                    {result.granted
                      ? <HiCheck className="w-6 h-6" style={{ color: '#16a34a' }} />
                      : <HiX    className="w-6 h-6" style={{ color: '#dc2626' }} />
                    }
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black" style={{ color: result.granted ? '#15803d' : '#b91c1c' }}>
                      {result.granted ? '✓ ACCESS GRANTED' : '✗ ACCESS DENIED'}
                    </p>
                    {result.user && (
                      <p className="text-sm font-semibold text-slate-700 mt-0.5 truncate">
                        {result.user.full_name}
                        <span className="font-mono text-xs text-slate-400 ml-2">
                          {result.user.enrollment_number || result.user.university_id}
                        </span>
                      </p>
                    )}
                    {result.reason && <p className="text-xs text-slate-500 mt-0.5">{result.reason}</p>}
                  </div>
                </div>

                {/* Card OCR diagnostic — what we actually read off the card */}
                {result.card && Object.values(result.card).some(v => v) && (
                  <CardScanDetails card={result.card} />
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Live log ──────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-50">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="text-sm font-bold text-slate-900">Live Entry Log</h3>
              <span className="ml-auto text-xs text-slate-400">{log.length} records</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-2 max-h-[520px]">
            {log.map(entry => {
              const denied  = entry.status === 'DENIED'
              const isEntry = entry.type   === 'ENTRY'
              const chip    = METHOD_CHIP[entry.method] || METHOD_CHIP.MANUAL

              return (
                <div
                  key={entry.id}
                  className="p-3 rounded-xl border"
                  style={denied
                    ? { background: '#fff1f2', borderColor: '#fecdd3' }
                    : isEntry
                      ? { background: '#f0fdf4', borderColor: '#bbf7d0' }
                      : { background: '#eff6ff', borderColor: '#bfdbfe' }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[10px] text-slate-400">{entry.time}</span>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={denied
                        ? { background: '#fee2e2', color: '#b91c1c' }
                        : isEntry
                          ? { background: '#dcfce7', color: '#15803d' }
                          : { background: '#dbeafe', color: '#1e40af' }}
                    >
                      {denied ? '✗ DENIED' : isEntry ? '→ ENTRY' : '← EXIT'}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-800 truncate">{entry.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[10px] text-slate-400">{entry.university_id}</span>
                    <span
                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ background: chip.bg, color: chip.color }}
                    >
                      {chip.label}
                    </span>
                  </div>

                  {/* Captured snapshots — only present when the gate flow
                      that produced this row had a webcam frame to save
                      (face / card / face+card modes). Manual entries have
                      neither and the strip simply doesn't render. */}
                  {(entry.face_snapshot_url || entry.card_snapshot_url) && (
                    <div className="flex items-center gap-1.5 mt-2">
                      {entry.face_snapshot_url && (
                        <SnapshotThumb url={entry.face_snapshot_url} label="Face" />
                      )}
                      {entry.card_snapshot_url && (
                        <SnapshotThumb url={entry.card_snapshot_url} label="Card" />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Scan-line animation */}
      <style>{`
        @keyframes scan-line {
          0%   { transform: translateY(0); opacity: 1; }
          50%  { transform: translateY(200px); opacity: 0.6; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {/* Full-screen alert that fires on any face/card denial */}
      <AccessAlert
        open={!!denyAlert}
        onClose={() => setDenyAlert(null)}
        reason={denyAlert?.reason}
        subjectLabel={denyAlert?.subject}
      />
    </div>
  )
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function SnapshotThumb({ url, label }) {
  // Small clickable thumbnail rendered against each row in the Live Entry
  // Log. Clicking opens the full-resolution image in a new tab so security
  // can confirm "yes, that's the person who came through the gate".
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={`${label} snapshot. Click to open.`}
      className="w-9 h-9 rounded-md overflow-hidden bg-slate-100 ring-1 ring-slate-200
        hover:ring-slate-400 transition-all flex-shrink-0"
    >
      <img src={url} alt={label} className="w-full h-full object-cover" />
    </a>
  )
}

function FcThumb({ label, image, active, onClear }) {
  // Captured-frame thumbnail used in Face+Card mode. Empty placeholder if
  // we haven't captured this side yet, dashed border when it's the active
  // step, "Retake" button when the user wants to redo a capture.
  return (
    <div
      className="rounded-2xl border-2 p-3 flex items-center gap-3"
      style={{
        background: image ? '#fff' : '#f8fafc',
        borderStyle: image ? 'solid' : 'dashed',
        borderColor: active ? '#a855f7' : (image ? '#d1d5db' : '#cbd5e1'),
      }}
    >
      <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0">
        {image ? (
          <img src={image} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <HiCamera className="w-6 h-6" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
        <p className="text-xs text-slate-700 font-semibold mt-0.5">
          {image ? 'Captured' : (active ? 'Capture next' : 'Pending')}
        </p>
        {image && onClear && (
          <button
            onClick={onClear}
            className="mt-1 text-[11px] font-semibold text-purple-600 hover:text-purple-800"
          >
            Retake
          </button>
        )}
      </div>
    </div>
  )
}

function CardScanDetails({ card }) {
  // Skip rendering rows that have no value, so the panel stays tidy
  const rows = [
    ['Enrollment',     card.enrollment_number],
    ['Name',           card.name],
    ['Card type',      card.card_type],
    ['Program',        card.program],
    ['Campus',         card.campus],
    ['Issued',         card.issued_on],
    ['Valid upto',     card.valid_upto],
    ['Card S.No',      card.serial_no],
    ['System ID',      card.university_id],
  ].filter(([, v]) => v)

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-white flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          Card scanned
        </p>
        {card.ocr_engine && (
          <span className="text-[10px] font-mono text-slate-400">via {card.ocr_engine}</span>
        )}
      </div>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-slate-100 last:border-0">
            <span className="text-slate-500 font-medium">{label}</span>
            <span className="text-slate-800 font-semibold font-mono truncate ml-2 text-right">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Visitor sub-components ──────────────────────────────────────────────── */

function VisitorForm({ draft, setDraft, onSubmit, onCancel }) {
  // Edits drop the field out of the autofilled set so the green badge goes
  // away once the guard starts typing — the value is no longer purely from OCR.
  const set = (k, v) => setDraft((d) => {
    const af = d._autofilled instanceof Set ? new Set(d._autofilled) : new Set()
    af.delete(k)
    return { ...d, [k]: v, _autofilled: af }
  })
  const isAuto = (k) => draft._autofilled instanceof Set && draft._autofilled.has(k)
  // Did OCR pull anything beyond the CNIC number? Used to decide whether to
  // render the "Captured from CNIC" cross-check panel.
  const hasOcrExtras = !!(
    draft.cnic_display || draft.father_name || draft.gender ||
    draft.date_of_birth || draft.date_of_issue || draft.date_of_expiry
  )
  // Tells the guard whether name + CNIC came from OCR or need typing.
  const ocrAttempted = draft._ocrEngine != null || draft._ocrFound != null
  const cnicMissing  = ocrAttempted && !draft.cnic
  const nameMissing  = ocrAttempted && !draft.full_name

  return (
    <div className="rounded-2xl border-2 border-purple-200 bg-purple-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-purple-700">
          New visitor — confirm details
        </p>
        <button
          onClick={onCancel}
          className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
        >
          Cancel
        </button>
      </div>

      {/* Captured-from-CNIC cross-check panel — shows everything OCR pulled
          so the guard can verify against the physical card before saving. */}
      {hasOcrExtras && (
        <div className="rounded-xl border border-purple-200 bg-white p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-purple-600 mb-2">
            Captured from CNIC (read-only)
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {[
              ['CNIC',           draft.cnic_display],
              ['Father name',    draft.father_name],
              ['Gender',         draft.gender],
              ['Date of birth',  draft.date_of_birth],
              ['Date of issue',  draft.date_of_issue],
              ['Date of expiry', draft.date_of_expiry],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-2 py-0.5 border-b border-slate-100 last:border-0">
                <span className="text-slate-500 font-medium">{label}</span>
                <span className="text-slate-800 font-semibold font-mono truncate ml-2 text-right">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Full name *</label>
            {isAuto('full_name') && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                ✓ Auto-filled
              </span>
            )}
            {nameMissing && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                Couldn't read — type it
              </span>
            )}
          </div>
          <input
            className={`input text-sm ${isAuto('full_name') ? 'ring-1 ring-emerald-300' : ''}`}
            placeholder="As shown on CNIC"
            value={draft.full_name}
            onChange={(e) => set('full_name', e.target.value)}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">CNIC * (13 digits)</label>
            {isAuto('cnic') && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                ✓ Auto-filled
              </span>
            )}
            {cnicMissing && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                Couldn't read — type it
              </span>
            )}
          </div>
          <input
            className={`input font-mono text-sm ${isAuto('cnic') ? 'ring-1 ring-emerald-300' : ''}`}
            placeholder="3520112345678"
            maxLength={13}
            value={draft.cnic}
            onChange={(e) => set('cnic', e.target.value.replace(/\D/g, '').slice(0, 13))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Phone</label>
          <input
            className="input text-sm"
            placeholder="+92 300 1234567"
            value={draft.phone_number}
            onChange={(e) => set('phone_number', e.target.value)}
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Purpose</label>
          <input
            className="input text-sm"
            placeholder="e.g. Job interview"
            value={draft.purpose}
            onChange={(e) => set('purpose', e.target.value)}
          />
        </div>
      </div>

      <HostPicker
        value={draft.host_user}
        valueLabel={draft.host_user_label}
        onChange={(id, label, dept) => setDraft((d) => ({
          ...d,
          host_user: id,
          host_user_label: label,
          host_department: dept || d.host_department,
        }))}
      />

      <div>
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Department / where to send</label>
        <input
          className="input text-sm"
          placeholder="e.g. Computer Science Office"
          value={draft.host_department}
          onChange={(e) => set('host_department', e.target.value)}
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          className="px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 flex items-center gap-2"
          style={{
            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
            boxShadow: '0 4px 16px rgba(168,85,247,0.35)',
          }}
        >
          <HiCheck className="w-4 h-4" />
          Register visitor
        </button>
      </div>
    </div>
  )
}

function HostPicker({ value, valueLabel, onChange }) {
  // Search-as-you-type dropdown for picking the host being visited.
  // Hits /api/auth/users/?search= so security can find anyone by name or ID.
  const [query, setQuery]     = useState(valueLabel || '')
  const [results, setResults] = useState([])
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)

  // Debounced search
  useEffect(() => {
    if (!query || query.trim().length < 2) { setResults([]); return }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const { data } = await authApi.getUsers({ search: query.trim() })
        if (cancelled) return
        const list = data?.results || data || []
        // Visitors are typically hosted by faculty/staff/admin — filter to those
        const filtered = list
          .filter((u) => ['FACULTY', 'STAFF', 'ADMIN', 'DIRECTOR', 'HR'].includes(u.role))
          .slice(0, 10)
        setResults(filtered)
      } catch {
        setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  const pick = (u) => {
    const label = `${u.full_name || `${u.first_name} ${u.last_name}`} (${u.role})`
    onChange(u.id, label, u.department)
    setQuery(label)
    setOpen(false)
  }

  return (
    <div>
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
        Host being visited * <span className="text-slate-400 normal-case">(faculty / staff / admin)</span>
      </label>
      <div className="relative">
        <input
          className="input text-sm"
          placeholder="Search name, ID or email…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
        {open && query.trim().length >= 2 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-56 overflow-y-auto">
            {loading && (
              <div className="px-4 py-3 text-xs text-slate-400">Searching…</div>
            )}
            {!loading && results.length === 0 && (
              <div className="px-4 py-3 text-xs text-slate-400">No matching faculty / staff / admin</div>
            )}
            {!loading && results.map((u) => (
              <button
                key={u.id}
                onMouseDown={(e) => { e.preventDefault(); pick(u) }}
                className="w-full text-left px-4 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0"
              >
                <p className="text-sm font-semibold text-slate-800">
                  {u.full_name || `${u.first_name} ${u.last_name}`}
                </p>
                <p className="text-[11px] text-slate-500">
                  <span className="font-mono">{u.university_id || u.email}</span>
                  <span className="mx-1.5">·</span>
                  {u.role}
                  {u.department && <> · {u.department}</>}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
      {value && (
        <p className="mt-1 text-[10px] text-purple-600 font-semibold">
          ✓ Host selected. Submit to register the visitor.
        </p>
      )}
    </div>
  )
}
