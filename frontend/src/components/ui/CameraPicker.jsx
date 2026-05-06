import { HiCamera, HiRefresh } from 'react-icons/hi'
import { useCameraSelection } from '../../hooks/useCameraSelection'

/**
 * CameraPicker — small dropdown that lets the user choose between the laptop
 * webcam and any external cameras (e.g. iPhone via DroidCam). The chosen
 * deviceId is persisted to localStorage so the choice survives reloads and
 * is shared between the Security dashboard and the admin enrollment modal.
 *
 * Props:
 *   compact (bool)   — render as a single-line strip rather than a labelled card
 *   onChange (fn)    — optional, fires (deviceId) AFTER selection persists
 *
 * Usage: drop this anywhere a camera will be used. The downstream <video> is
 * driven by useWebcam({ deviceId }) (or SecurityDashboard's inline camera
 * effect, which also reads from useCameraSelection).
 */
export default function CameraPicker({ compact = false, onChange }) {
  const { devices, selectedId, setSelectedId, refresh, ready } = useCameraSelection()

  const handlePick = (id) => {
    setSelectedId(id)
    onChange?.(id)
  }

  const showHint = ready && devices.length > 0 && devices.every((d) => /^Camera \d+$/.test(d.label))

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <HiCamera className="w-4 h-4 text-slate-500 flex-shrink-0" />
        <select
          value={selectedId}
          onChange={(e) => handlePick(e.target.value)}
          className="flex-1 px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-700 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={!ready || devices.length === 0}
        >
          {devices.length === 0 && <option value="">No cameras found</option>}
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={refresh}
          title="Re-scan cameras (use this after plugging in DroidCam)"
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700"
        >
          <HiRefresh className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <HiCamera className="w-4 h-4 text-slate-600" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600">
          Camera source
        </p>
        <button
          type="button"
          onClick={refresh}
          title="Re-scan cameras (use this after plugging in DroidCam)"
          className="ml-auto p-1.5 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-800"
        >
          <HiRefresh className="w-3.5 h-3.5" />
        </button>
      </div>
      <select
        value={selectedId}
        onChange={(e) => handlePick(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        disabled={!ready || devices.length === 0}
      >
        {devices.length === 0 && <option value="">No cameras found</option>}
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
        ))}
      </select>
      {showHint && (
        <p className="text-[10px] text-slate-500 leading-snug">
          Camera labels are hidden until you grant permission once. Start a
          scan, then click <HiRefresh className="w-3 h-3 inline -mt-0.5" /> to
          see real names like "DroidCam Source 1".
        </p>
      )}
    </div>
  )
}
