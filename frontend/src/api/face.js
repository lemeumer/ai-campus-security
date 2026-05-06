import { faceApi } from './client'

export const faceDetectionApi = {
  // Legacy single-frame endpoints (kept for backwards compat)
  registerFace: (imageBase64, userId) =>
    faceApi.post('/register/', { image: imageBase64, user_id: userId }),
  verifyFace: (imageBase64) =>
    faceApi.post('/verify/', { image: imageBase64 }),
  // Card OCR. `images` accepts either a single base64 string (single-frame
  // mode — legacy callers) or an array of strings (burst mode — backend
  // runs OCR on every frame and consensus-votes per field, which lifts
  // accuracy by 5-15% over a single shot). Always sends `image` so older
  // backend builds without burst support keep working.
  scanCard: (images) => {
    const arr = Array.isArray(images) ? images : [images]
    return faceApi.post('/scan-card/', { image: arr[0], images: arr })
  },
  // Strict cross-match: face AND card must both authenticate to the same user.
  // Used by the new "Face + Card" mode on the security dashboard. Rejects
  // impersonation attempts where the face is X but the card belongs to Y.
  verifyFaceCard: (faceImage, cardImage) =>
    faceApi.post('/verify-face-card/', { face_image: faceImage, card_image: cardImage }),
  checkLiveness: (imageBase64) =>
    faceApi.post('/liveness/', { image: imageBase64 }),

  // ── Real-time quality check (used by enrollment UI before each capture) ─
  // Called every ~500ms while the admin frames the user.
  // Returns { face_detected, face_count, face_size_ratio, sharpness,
  //           brightness, composite_score, issues: [...] }
  qualityCheck: (imageBase64) =>
    faceApi.post('/quality-check/', { image: imageBase64 }),

  // Multi-frame enrollment — admin uploads N frames at once for averaging.
  // NOTE: this is normally invoked via Django (which proxies to FastAPI),
  // but exposed here for direct testing if needed.
  enrollDirect: (userId, framesBase64) =>
    faceApi.post('/enroll/', { user_id: userId, frames: framesBase64 }),

  // Visitor CNIC OCR. Returns { found, cnic, cnic_raw, name, raw_text, ocr_engine }.
  // Called by the security gate when registering a walk-in visitor.
  // Same burst-aware contract as scanCard.
  scanCnic: (images) => {
    const arr = Array.isArray(images) ? images : [images]
    return faceApi.post('/scan-cnic/', { image: arr[0], images: arr })
  },
}
