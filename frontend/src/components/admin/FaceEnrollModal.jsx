import { useState, useEffect, useRef, useCallback } from 'react'
import { HiX, HiCamera, HiCheck, HiRefresh, HiExclamation, HiUser } from 'react-icons/hi'
import toast from 'react-hot-toast'
import { useWebcam } from '../../hooks/useWebcam'
import { useCameraSelection } from '../../hooks/useCameraSelection'
import CameraPicker from '../ui/CameraPicker'
import { faceDetectionApi } from '../../api/face'
import { authApi } from '../../api/auth'

/**
 * The 5 capture poses, in order. The current one is highlighted in the UI
 * and the auto-capture watches for that pose's quality to be GOOD.
 */
const POSES = [
  { key: 'front', label: 'Look straight at the camera', hint: 'Face the camera, neutral expression', icon: '😐' },
  { key: 'left',  label: 'Turn slightly left',           hint: 'Rotate head ~15° to your left',     icon: '👈' },
  { key: 'right', label: 'Turn slightly right',          hint: 'Rotate head ~15° to your right',    icon: '👉' },
  { key: 'up',    label: 'Tilt slightly up',             hint: 'Lift chin, eyes still on camera',   icon: '⬆️' },
  { key: 'down',  label: 'Tilt slightly down',           hint: 'Lower chin, eyes still on camera',  icon: '⬇️' },
]

const QUALITY_POLL_MS = 500          // how often we ask FastAPI to grade the live frame
const AUTO_CAPTURE_THRESHOLD = 0.55  // moderate composite-score threshold (matches backend "GOOD")
const AUTO_CAPTURE_DEBOUNCE = 1200   // ms quality must stay good before snapping

export default function FaceEnrollModal({ user, onClose, onSuccess }) {
  const [poseIndex, setPoseIndex] = useState(0)             // 0..4
  const [captures, setCaptures] = useState([])              // [{ pose, dataUrl, quality }]
  const [phase, setPhase] = useState('capturing')           // 'capturing' | 'reviewing' | 'submitting' | 'done'
  const [quality, setQuality] = useState(null)              // latest live quality reading
  const [submitError, setSubmitError] = useState(null)
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true)
  const goodSinceRef = useRef(null)                         // timestamp when quality first hit threshold

  // Camera selection (laptop webcam vs DroidCam, etc.) — picked via the
  // <CameraPicker /> below the webcam preview. The chosen deviceId is shared
  // with the Security dashboard via localStorage so admins don't have to
  // re-pick on every page.
  const { selectedId: cameraDeviceId } = useCameraSelection()

  const { videoRef, ready, error, capture, stop } = useWebcam({
    enabled: phase !== 'done',
    width: 640, height: 480,
    deviceId: cameraDeviceId,
  })

  // ── Stop camera + close ───────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    stop()
    onClose?.()
  }, [stop, onClose])

  // ── Take a single snapshot for the current pose ───────────────────────────
  const snapCurrentPose = useCallback(() => {
    const dataUrl = capture()
    if (!dataUrl) {
      toast.error('Capture failed — camera not ready')
      return
    }
    const pose = POSES[poseIndex]
    setCaptures((prev) => {
      // Replace if there's already a capture for this pose (retake)
      const filtered = prev.filter((c) => c.pose !== pose.key)
      return [...filtered, { pose: pose.key, dataUrl, quality }]
    })
    goodSinceRef.current = null

    // Move to next pose, or to review if we just finished the last one
    if (poseIndex < POSES.length - 1) {
      setPoseIndex(poseIndex + 1)
    } else {
      setPhase('reviewing')
    }
  }, [capture, poseIndex, quality])

  // ── Poll quality from FastAPI while capturing ─────────────────────────────
  useEffect(() => {
    if (phase !== 'capturing' || !ready) return
    let cancelled = false
    let timer = null

    const tick = async () => {
      if (cancelled) return
      const dataUrl = capture()
      if (!dataUrl) {
        timer = setTimeout(tick, QUALITY_POLL_MS)
        return
      }
      try {
        const { data } = await faceDetectionApi.qualityCheck(dataUrl)
        if (cancelled) return
        setQuality(data)

        // Auto-capture when quality stays GOOD for AUTO_CAPTURE_DEBOUNCE ms
        if (
          autoCaptureEnabled &&
          data.face_detected &&
          data.face_count === 1 &&
          data.composite_score >= AUTO_CAPTURE_THRESHOLD &&
          (!data.issues || data.issues.length === 0)
        ) {
          if (goodSinceRef.current == null) {
            goodSinceRef.current = Date.now()
          } else if (Date.now() - goodSinceRef.current >= AUTO_CAPTURE_DEBOUNCE) {
            snapCurrentPose()
          }
        } else {
          goodSinceRef.current = null
        }
      } catch (err) {
        // Face service may be down — don't spam; just stop auto-capture
        if (!cancelled) {
          setAutoCaptureEnabled(false)
          setQuality({ face_detected: false, issues: ['Cannot reach face service — capture manually'] })
        }
      }
      if (!cancelled) timer = setTimeout(tick, QUALITY_POLL_MS)
    }

    timer = setTimeout(tick, QUALITY_POLL_MS)
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [phase, ready, capture, autoCaptureEnabled, snapCurrentPose])

  // ── Retake a specific pose ────────────────────────────────────────────────
  const retake = (poseKey) => {
    const idx = POSES.findIndex((p) => p.key === poseKey)
    setCaptures((prev) => prev.filter((c) => c.pose !== poseKey))
    setPoseIndex(idx)
    setPhase('capturing')
    goodSinceRef.current = null
  }

  // ── Submit all 5 frames to Django ─────────────────────────────────────────
  const handleSubmit = async () => {
    setPhase('submitting')
    setSubmitError(null)
    try {
      const orderedFrames = POSES
        .map((p) => captures.find((c) => c.pose === p.key))
        .filter(Boolean)
        .map((c) => c.dataUrl)

      await authApi.createEnrollment(user.id, {
        frames: orderedFrames,
        notes: `Enrolled via admin portal (5 poses: ${POSES.map((p) => p.key).join(', ')})`,
      })

      setPhase('done')
      stop()
      toast.success(`${user.first_name}'s face enrolled successfully`, { duration: 4000 })
      setTimeout(() => onSuccess?.(), 1200)
    } catch (err) {
      const status = err.response?.status
      const data = err.response?.data
      let msg = 'Enrollment failed'
      if (status === 409) {
        msg = 'This user already has an active enrollment. Remove it first.'
      } else if (status === 503) {
        msg = 'Face recognition service is offline. Start the FastAPI service and retry.'
      } else if (status === 422) {
        msg = data?.detail || data?.error || 'Not enough frames passed quality checks. Please retake.'
      } else if (data?.detail) {
        msg = data.detail
      } else if (data?.error) {
        msg = data.error
      }
      setSubmitError(msg)
      setPhase('reviewing')
      toast.error(msg, { duration: 5000 })
    }
  }

  const completedCount = captures.length
  const currentPose = POSES[poseIndex]
  const allCaptured = completedCount === POSES.length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={handleClose}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div
          className="px-6 py-4 flex items-center justify-between border-b border-slate-200"
          style={{ background: 'linear-gradient(135deg, #1e40af, #3b82f6)' }}
        >
          <div className="flex items-center gap-3 text-white min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center flex-shrink-0">
              <HiUser className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight truncate">
                Enroll {user.first_name} {user.last_name}
              </p>
              <p className="text-blue-100 text-xs truncate">
                {user.role} · {user.university_id || user.email}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>

        {/* ── Pose progress bar ────────────────────────────────────────────── */}
        <div className="px-6 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            {POSES.map((p, i) => {
              const captured = captures.some((c) => c.pose === p.key)
              const current = i === poseIndex && phase === 'capturing'
              return (
                <div key={p.key} className="flex items-center gap-2 flex-1">
                  <div
                    className="flex-1 flex flex-col items-center gap-1 py-1.5 px-2 rounded-lg text-[10px] font-semibold transition-all"
                    style={{
                      background: captured ? '#dcfce7' : current ? '#dbeafe' : '#f1f5f9',
                      border: `1px solid ${captured ? '#86efac' : current ? '#93c5fd' : '#e2e8f0'}`,
                      color: captured ? '#15803d' : current ? '#1e40af' : '#64748b',
                    }}
                  >
                    <span className="text-base leading-none">{captured ? '✓' : p.icon}</span>
                    <span className="uppercase tracking-wider">{p.key}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Body — branches by phase ─────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <ErrorBanner
              title="Cannot access camera"
              detail={
                error.name === 'NotAllowedError'
                  ? 'Camera permission was denied. Click the camera icon in your browser address bar to enable it.'
                  : error.name === 'NotFoundError'
                    ? 'No webcam was found. Plug in a camera and reload.'
                    : error.message
              }
            />
          )}

          {phase === 'capturing' && !error && (
            <CapturePhase
              videoRef={videoRef}
              ready={ready}
              quality={quality}
              currentPose={currentPose}
              autoCaptureEnabled={autoCaptureEnabled}
              setAutoCaptureEnabled={setAutoCaptureEnabled}
              onManualCapture={snapCurrentPose}
              completedCount={completedCount}
            />
          )}

          {phase === 'reviewing' && (
            <ReviewPhase
              captures={captures}
              onRetake={retake}
              submitError={submitError}
            />
          )}

          {phase === 'submitting' && (
            <div className="py-16 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm font-semibold text-slate-700">Processing 5 frames…</p>
              <p className="text-xs text-slate-500">
                Extracting face embeddings, running liveness check, averaging…
              </p>
            </div>
          )}

          {phase === 'done' && (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center">
                <HiCheck className="w-12 h-12 text-emerald-600" />
              </div>
              <p className="text-lg font-bold text-slate-800">Enrollment complete</p>
              <p className="text-sm text-slate-500">
                {user.first_name} can now be recognized at the gate.
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        {phase === 'reviewing' && (
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <button
              onClick={() => { setPoseIndex(0); setCaptures([]); setPhase('capturing') }}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-2"
            >
              Start over
            </button>
            <button
              onClick={handleSubmit}
              disabled={!allCaptured}
              className="px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #059669, #10b981)',
                boxShadow: '0 4px 16px rgba(16,185,129,0.35)',
              }}
            >
              <HiCheck className="w-4 h-4" />
              Confirm & Enroll
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Sub-components ──────────────────────────────────────────────────────── */

function CapturePhase({
  videoRef, ready, quality, currentPose,
  autoCaptureEnabled, setAutoCaptureEnabled, onManualCapture, completedCount,
}) {
  const score = quality?.composite_score ?? 0
  const goodEnough = quality?.face_detected && quality.face_count === 1 &&
                     (!quality.issues || quality.issues.length === 0) &&
                     score >= AUTO_CAPTURE_THRESHOLD

  return (
    <div className="space-y-4">
      {/* Pose instruction card */}
      <div
        className="rounded-2xl p-4 flex items-center gap-4"
        style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}
      >
        <span className="text-3xl flex-shrink-0">{currentPose.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800">
            Pose {completedCount + 1} of {POSES.length}: {currentPose.label}
          </p>
          <p className="text-xs text-slate-600">{currentPose.hint}</p>
        </div>
      </div>

      {/* Webcam preview — capped height keeps the full face visible without
          scrolling on a 1080p laptop (modal is max-h: 92vh). aspect-video gives
          a 16:9 ratio which matches typical webcam framing better than 4:3. */}
      <div
        className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-video w-full mx-auto"
        style={{
          border: `3px solid ${goodEnough ? '#10b981' : '#cbd5e1'}`,
          maxHeight: '320px',
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' /* mirror for natural UX */ }}
        />

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
              <p className="text-white/70 text-xs">Starting camera…</p>
            </div>
          </div>
        )}

        {/* Quality indicator overlay */}
        {ready && quality && (
          <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-3 pointer-events-none">
            <div
              className="px-3 py-1.5 rounded-full backdrop-blur-md text-[11px] font-bold flex items-center gap-1.5"
              style={{
                background: goodEnough ? 'rgba(16,185,129,0.85)' : 'rgba(0,0,0,0.6)',
                color: 'white',
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{
                background: goodEnough ? '#dcfce7' : '#fbbf24',
                animation: goodEnough ? 'pulse 1.5s infinite' : 'none',
              }} />
              {goodEnough ? 'Good — hold still' : 'Adjust position'}
            </div>
            <div className="px-2.5 py-1 rounded-full bg-black/60 text-white text-[10px] font-mono backdrop-blur-md">
              {(score * 100).toFixed(0)}%
            </div>
          </div>
        )}

        {/* Face frame guide */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="w-1/2 aspect-[3/4] rounded-[40%] border-2 border-dashed transition-colors"
            style={{ borderColor: goodEnough ? 'rgba(16,185,129,0.6)' : 'rgba(255,255,255,0.3)' }}
          />
        </div>
      </div>

      {/* Issues list */}
      {ready && quality?.issues?.length > 0 && (
        <div className="rounded-xl p-3 flex items-start gap-2.5"
             style={{ background: '#fef3c7', border: '1px solid #fde68a' }}>
          <HiExclamation className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-amber-900 mb-0.5">Adjust before capture:</p>
            <ul className="text-amber-800 space-y-0.5">
              {quality.issues.map((iss, i) => <li key={i}>• {iss}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* Camera source picker — needed so admins can switch to the iPhone
          (DroidCam Source 1) for higher-quality enrollment frames. */}
      <CameraPicker compact />

      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={autoCaptureEnabled}
            onChange={(e) => setAutoCaptureEnabled(e.target.checked)}
            className="w-4 h-4 rounded accent-blue-600"
          />
          Auto-capture when quality is good
        </label>
        <button
          onClick={onManualCapture}
          disabled={!ready}
          className="px-4 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
          style={{
            background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
            boxShadow: '0 4px 12px rgba(59,130,246,0.3)',
          }}
        >
          <HiCamera className="w-4 h-4" />
          Capture Now
        </button>
      </div>
    </div>
  )
}

function ReviewPhase({ captures, onRetake, submitError }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Review the 5 captured frames. Click any frame to retake. When satisfied, click <b>Confirm & Enroll</b>.
      </p>

      {submitError && (
        <ErrorBanner title="Enrollment failed" detail={submitError} />
      )}

      <div className="grid grid-cols-5 gap-3">
        {POSES.map((p) => {
          const c = captures.find((cap) => cap.pose === p.key)
          return (
            <div key={p.key} className="space-y-1.5">
              <div
                className="aspect-square rounded-xl overflow-hidden bg-slate-100 border-2 border-slate-200 relative group"
              >
                {c ? (
                  <>
                    <img src={c.dataUrl} alt={p.label} className="w-full h-full object-cover" />
                    <button
                      onClick={() => onRetake(p.key)}
                      className="absolute inset-0 bg-black/0 hover:bg-black/60 transition-all flex items-center justify-center opacity-0 hover:opacity-100"
                    >
                      <span className="px-3 py-1.5 rounded-full bg-white text-slate-900 text-[11px] font-bold flex items-center gap-1">
                        <HiRefresh className="w-3 h-3" /> Retake
                      </span>
                    </button>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-3xl text-slate-300">
                    {p.icon}
                  </div>
                )}
              </div>
              <p className="text-[10px] font-bold text-center text-slate-600 uppercase tracking-wider">
                {p.key}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ErrorBanner({ title, detail }) {
  return (
    <div className="rounded-xl p-4 flex items-start gap-3"
         style={{ background: '#fee2e2', border: '1px solid #fca5a5' }}>
      <HiExclamation className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
      <div className="text-sm">
        <p className="font-bold text-red-900">{title}</p>
        <p className="text-red-700 text-xs mt-0.5">{detail}</p>
      </div>
    </div>
  )
}
