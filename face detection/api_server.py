"""
FastAPI Face Detection Service
Hardware-agnostic design — input adapters slot in for:
  - Webcam / IP camera (current: browser WebRTC frames)
  - Retina scanner (future: USB HID adapter)
  - Card OCR reader (future: camera or dedicated scanner)
  - Mini-PC GPIO triggers (future: Raspberry Pi / Jetson)
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
import asyncio
import base64
import numpy as np
import cv2
import logging

from main import FaceEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Campus Security — Face Detection API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:8000", "http://127.0.0.1:8000",  # Django proxy
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = FaceEngine()


# ─── Request / Response models ───────────────────────────────────────────────

class ImageRequest(BaseModel):
    image: str  # base64 JPEG/PNG from browser canvas
    user_id: Optional[str] = None
    # Optional multi-frame burst: when set, the OCR endpoints run on every
    # frame and pick the most-confident consensus result. Kept Optional so
    # existing single-frame callers (face mode, face-card cross-match,
    # liveness check) keep working with no client change.
    images: Optional[List[str]] = None

class VerifyResponse(BaseModel):
    granted: bool
    user: Optional[dict] = None
    enrollment_id: Optional[str] = None  # populated when granted=True so the
                                         # frontend can call /face-enrollments/<id>/match/
    reason: Optional[str] = None
    confidence: Optional[float] = None
    liveness: Optional[bool] = None


# ── Internal sync models ─────────────────────────────────────────────────────

class SyncAddRequest(BaseModel):
    enrollment_id: str
    user_id: str
    university_id: str = ""
    full_name: str = ""
    role: str = ""
    embedding: str  # hex string of float32 ArcFace vector

class SyncRemoveRequest(BaseModel):
    enrollment_id: str

class RegisterResponse(BaseModel):
    success: bool
    user_id: str
    message: str

class CardScanResponse(BaseModel):
    granted: bool
    user: Optional[dict] = None
    reason: Optional[str] = None
    # ── Fields extracted from the card by OCR (all optional) ─────────────
    enrollment_number: Optional[str] = None
    university_id:     Optional[str] = None
    name:              Optional[str] = None
    card_type:         Optional[str] = None     # STUDENT / FACULTY / STAFF / ADMIN
    program:           Optional[str] = None
    campus:            Optional[str] = None
    issued_on:         Optional[str] = None
    valid_upto:        Optional[str] = None
    serial_no:         Optional[str] = None
    raw_text:          Optional[List[str]] = None
    ocr_engine:        Optional[str] = None


# ── Multi-frame enrollment models ────────────────────────────────────────────

class EnrollRequest(BaseModel):
    user_id: str = Field(..., description="UUID of the user being enrolled")
    frames: List[str] = Field(..., min_length=3, max_length=10,
                              description="Base64-encoded JPEG frames")


class EnrollResponse(BaseModel):
    embedding: str  # hex
    frame_embeddings: List[str]
    frame_count: int
    quality_score: float
    quality_grade: str
    liveness_passed: bool
    rejected_frames: List[dict] = []


class QualityCheckResponse(BaseModel):
    face_detected: bool
    face_count: int
    face_size_ratio: float
    sharpness: float
    brightness: float
    composite_score: float
    issues: List[str]


# ─── Helpers ─────────────────────────────────────────────────────────────────

def decode_image(b64_string: str) -> np.ndarray:
    """Decode a base64 image string (from browser canvas.toDataURL) to OpenCV BGR."""
    if "," in b64_string:
        b64_string = b64_string.split(",", 1)[1]
    img_bytes = base64.b64decode(b64_string)
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    return img


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": engine.model_loaded}


@app.post("/api/face/register/", response_model=RegisterResponse)
async def register_face(req: ImageRequest):
    """
    Register a face encoding for a user.
    Called once during enrollment (admin registers a new person).
    In future: also accepts retina scan input from USB scanner.
    """
    if not req.user_id:
        raise HTTPException(400, "user_id is required")
    try:
        img = decode_image(req.image)
        encoding = engine.get_face_encoding(img)
        if encoding is None:
            raise HTTPException(422, "No face detected in image")
        engine.store_encoding(req.user_id, encoding)
        logger.info(f"Face registered for user {req.user_id}")
        return RegisterResponse(success=True, user_id=req.user_id, message="Face registered successfully")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(500, f"Registration failed: {str(e)}")


@app.post("/api/face/enroll/", response_model=EnrollResponse)
async def enroll_face_multi(req: EnrollRequest):
    """
    Multi-frame enrollment endpoint — called by Django on behalf of admin.

    Pipeline:
      1. Decode all frames from base64
      2. Quality assess each (moderate gates: face count, size, sharpness, brightness)
      3. Liveness check each (anti-spoof — enforced at enrollment)
      4. Extract ArcFace embedding for each accepted frame
      5. Average the embeddings, L2-normalise
      6. Return averaged embedding + per-frame embeddings + quality grade

    Django then stores the result as a FaceEnrollment row.
    """
    try:
        decoded = []
        for idx, b64 in enumerate(req.frames):
            try:
                decoded.append(decode_image(b64))
            except Exception as e:
                raise HTTPException(400, f"Frame {idx} could not be decoded: {e}")

        result = engine.enroll_from_frames(decoded)

        logger.info(
            "Enrollment OK for user %s — %d/%d frames passed (grade=%s, score=%.2f)",
            req.user_id, result["frame_count"], len(req.frames),
            result["quality_grade"], result["quality_score"],
        )
        return EnrollResponse(**result)

    except ValueError as e:
        # Not enough frames passed
        logger.warning("Enrollment rejected for user %s: %s", req.user_id, e)
        raise HTTPException(422, str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Enrollment error for user %s: %s", req.user_id, e)
        raise HTTPException(500, f"Enrollment failed: {e}")


@app.post("/api/face/quality-check/", response_model=QualityCheckResponse)
async def quality_check(req: ImageRequest):
    """
    Real-time quality check for the admin enrollment UI.
    Called every ~500ms while the admin frames the user — returns issues
    so the modal can show 'move closer' / 'too dark' before capture.
    """
    try:
        img = decode_image(req.image)
        result = engine.assess_frame_quality(img)
        return QualityCheckResponse(**result)
    except Exception as e:
        logger.error("Quality check error: %s", e)
        raise HTTPException(500, str(e))


@app.post("/api/face/verify/", response_model=VerifyResponse)
async def verify_face(req: ImageRequest):
    """
    Verify a face against all active enrollments.
    Returns the matched user, enrollment_id, and access decision.

    Pipeline (per proposal Section 3.1):
        decode → liveness → encode → match → respond

    Future hardware inputs:
    - IP camera: POST pre-captured frame from edge device
    - Turnstile controller: trigger this endpoint via MQTT/HTTP
    """
    try:
        img = decode_image(req.image)

        # Step 1: Liveness check (anti-spoofing). Currently a pass-through
        # in dev when no ONNX model is loaded — must be hardened before demo.
        liveness = engine.check_liveness(img)
        if not liveness:
            return VerifyResponse(
                granted=False,
                liveness=False,
                reason="Liveness check failed — possible spoof attempt",
            )

        # Step 2: Extract face encoding
        encoding = engine.get_face_encoding(img)
        if encoding is None:
            return VerifyResponse(
                granted=False, liveness=True,
                reason="No face detected in frame",
            )

        # Step 3: Cosine match against in-memory cache (loaded lazily from
        # PostgreSQL via the bulk endpoint, kept fresh by sync-add/sync-remove).
        match, confidence = engine.find_match(encoding)
        if match is None:
            return VerifyResponse(
                granted=False, liveness=True, confidence=confidence,
                reason="Face not recognised",
            )

        user_payload = {
            "id": match["user_id"],
            "full_name": match["full_name"],
            "university_id": match["university_id"],
            "role": match["role"],
        }

        logger.info(
            "Access granted: %s (confidence=%.3f, enrollment=%s)",
            match["full_name"], confidence, match["enrollment_id"],
        )
        return VerifyResponse(
            granted=True,
            user=user_payload,
            enrollment_id=match["enrollment_id"],
            confidence=confidence,
            liveness=True,
        )

    except Exception as e:
        logger.error("Verify error: %s", e)
        raise HTTPException(500, f"Verification failed: {e}")


# ── Face + Card cross-match (the strictest gate mode) ──────────────────────

class FaceCardVerifyRequest(BaseModel):
    """Two frames — face shot for recognition, card shot for OCR — sent
    together so the server can decide grant/deny in one round trip."""
    face_image: str
    card_image: str


class FaceCardVerifyResponse(BaseModel):
    granted:       bool
    matched:       bool          # face person == card holder?
    reason:        Optional[str] = None
    # Face recognition result
    face_user:     Optional[dict] = None
    enrollment_id: Optional[str] = None
    confidence:    Optional[float] = None
    liveness:      Optional[bool] = None
    # Card OCR result
    card_user:     Optional[dict] = None
    card_id:       Optional[str] = None     # enrollment_number or university_id read off card
    card_fields:   Optional[dict] = None    # full OCR breakdown for diagnostics


@app.post("/api/face/verify-face-card/", response_model=FaceCardVerifyResponse)
async def verify_face_card(req: FaceCardVerifyRequest):
    """
    Strict cross-match: someone is GRANTED only when the face and the card
    both authenticate to the SAME user.

    Three failure modes (all DENY):
        - Face not enrolled / not recognised
        - Card not registered / unreadable
        - Both recognised but they belong to different users (impersonation)

    All three deserve the loud red AccessAlert on the frontend; the
    `matched` field tells the UI whether this was an impersonation attempt
    (mismatched IDs) or a plain unknown.
    """
    try:
        face_img = decode_image(req.face_image)
        card_img = decode_image(req.card_image)

        # The face pipeline (liveness → encode → match) and the card OCR
        # pipeline operate on independent frames, so we run them concurrently
        # via asyncio.to_thread. Both call into PyTorch / ONNX which release
        # the GIL during inference, so the wall-clock time becomes
        # max(face, card) instead of face + card — meaningful speedup on the
        # cross-match path which the user previously flagged as slow.
        def _face_pipeline():
            liveness = engine.check_liveness(face_img)
            if not liveness:
                return False, None, 0.0
            encoding = engine.get_face_encoding(face_img)
            if encoding is None:
                return True, None, 0.0
            match, confidence = engine.find_match(encoding)
            return True, match, confidence

        face_task = asyncio.to_thread(_face_pipeline)
        card_task = asyncio.to_thread(engine.ocr_card, card_img)
        (liveness, face_match, face_confidence), card_result = await asyncio.gather(
            face_task, card_task,
        )
        card_id = None
        card_user = None
        if card_result:
            card_id = card_result.get("enrollment_number") or card_result.get("university_id")
            if card_id:
                card_user = engine.get_user_by_card(card_id)

        face_user_dict = None
        if face_match:
            face_user_dict = {
                "id":              face_match["user_id"],
                "full_name":       face_match["full_name"],
                "university_id":   face_match["university_id"],
                "role":            face_match["role"],
            }

        # ── Decision tree ──────────────────────────────────────────────
        if not liveness:
            return FaceCardVerifyResponse(
                granted=False, matched=False, liveness=False,
                reason="Liveness check failed (possible spoof attempt).",
                card_user=card_user, card_id=card_id, card_fields=card_result,
            )

        if face_match is None:
            return FaceCardVerifyResponse(
                granted=False, matched=False, liveness=True,
                confidence=face_confidence,
                reason="Face not recognised. This person is not enrolled in the system.",
                card_user=card_user, card_id=card_id, card_fields=card_result,
            )

        if not card_id or not card_user:
            return FaceCardVerifyResponse(
                granted=False, matched=False, liveness=True,
                face_user=face_user_dict,
                enrollment_id=face_match["enrollment_id"],
                confidence=face_confidence,
                reason=("Card unreadable or not registered. Face was recognised; "
                        "the card scan failed."),
                card_id=card_id, card_fields=card_result,
            )

        # Both sides identified — do they agree?
        if str(card_user.get("id")) != str(face_match["user_id"]):
            logger.warning(
                "IMPERSONATION DETECTED: face=%s card=%s",
                face_match.get("full_name"), card_user.get("full_name"),
            )
            return FaceCardVerifyResponse(
                granted=False, matched=False, liveness=True,
                face_user=face_user_dict,
                enrollment_id=face_match["enrollment_id"],
                confidence=face_confidence,
                card_user=card_user, card_id=card_id, card_fields=card_result,
                reason=(f"Impersonation alert. The face belongs to "
                        f"{face_match['full_name']} but the card belongs to "
                        f"{card_user.get('full_name', 'someone else')}."),
            )

        # Both match the same user → GRANT
        logger.info(
            "Face+Card match: %s (confidence=%.3f, card_id=%s)",
            face_match["full_name"], face_confidence, card_id,
        )
        return FaceCardVerifyResponse(
            granted=True, matched=True, liveness=True,
            face_user=face_user_dict,
            enrollment_id=face_match["enrollment_id"],
            confidence=face_confidence,
            card_user=card_user, card_id=card_id, card_fields=card_result,
        )

    except Exception as e:
        logger.error("Face+Card verify error: %s", e)
        raise HTTPException(500, f"Verification failed: {e}")


# ── Cache sync endpoints (called by Django after enrollment changes) ────────

@app.post("/api/face/sync-add/")
async def sync_add(req: SyncAddRequest):
    """
    Called by Django after a new FaceEnrollment row is saved. Adds the embedding
    to the in-memory match cache so the user is immediately recognisable at the
    gate without a FastAPI restart.
    """
    try:
        engine.add_enrollment_to_cache(
            enrollment_id=req.enrollment_id,
            user_id=req.user_id,
            university_id=req.university_id,
            full_name=req.full_name,
            role=req.role,
            embedding_hex=req.embedding,
        )
        return {"status": "ok", "enrollment_id": req.enrollment_id,
                "cache_size": len(engine._enrollments)}
    except Exception as e:
        logger.error("sync-add failed: %s", e)
        raise HTTPException(500, str(e))


@app.post("/api/face/sync-remove/")
async def sync_remove(req: SyncRemoveRequest):
    """Called by Django after a FaceEnrollment is deactivated."""
    existed = engine.remove_enrollment_from_cache(req.enrollment_id)
    return {"status": "ok", "removed": existed,
            "cache_size": len(engine._enrollments)}


@app.post("/api/face/sync-reload/")
async def sync_reload():
    """Force a full reload of the cache from Django. Useful for ops/debug."""
    engine._cache_loaded = False
    engine._load_enrollments_from_django()
    return {"status": "ok", "cache_size": len(engine._enrollments)}


@app.post("/api/face/scan-card/", response_model=CardScanResponse)
async def scan_card(req: ImageRequest):
    """
    OCR a campus card from a camera frame and look up the user.

    Returns all extracted card fields (enrollment_number, name, program,
    dates, serial number, etc.) regardless of whether the user matched a DB
    row. The frontend uses these fields to display "what we read off the card"
    even on a failed lookup.

    Future hardware: dedicated card reader sends the enrollment number
    directly via serial / USB and skips the OCR step entirely.
    """
    try:
        # ── Burst mode ────────────────────────────────────────────────────
        # When the frontend supplies `images: [...]` (multi-frame burst), run
        # OCR on every frame and consensus-vote per field. Otherwise fall back
        # to the original single-frame path.
        frames_b64 = req.images if (req.images and len(req.images) > 0) else [req.image]
        per_frame: list = []
        for b64 in frames_b64[:5]:  # cap at 5 to bound CPU/latency
            try:
                frame_img = decode_image(b64)
                r = engine.ocr_card(frame_img)
                if r:
                    per_frame.append(r)
                    # Quality-preserving early-exit: stop only when TWO
                    # consecutive frames independently produced the same
                    # high-confidence read. That gives us a built-in consensus
                    # check before skipping further frames — a single misread
                    # digit on frame 1 alone wouldn't pass this gate.
                    if (len(per_frame) >= 2
                        and engine.is_high_confidence_card_read(per_frame[-1])
                        and engine.is_high_confidence_card_read(per_frame[-2])
                        and (per_frame[-1].get("enrollment_number")
                             == per_frame[-2].get("enrollment_number"))
                        and (per_frame[-1].get("name")
                             == per_frame[-2].get("name"))):
                        logger.info(
                            "Card burst early-exit after %d frame(s) — 2-frame agreement",
                            len(per_frame),
                        )
                        break
            except Exception as fe:
                logger.warning("Frame in burst failed to decode/OCR: %s", fe)
                continue

        if not per_frame:
            return CardScanResponse(
                granted=False,
                reason="No text detected on the card. Hold it steady and well lit, then try again.",
            )

        # Single frame → that's our result. Multi-frame → vote.
        ocr_result = per_frame[0] if len(per_frame) == 1 else engine.consensus_ocr(per_frame)

        # Pull out everything OCR found
        enrollment_number = ocr_result.get("enrollment_number")
        university_id     = ocr_result.get("university_id")
        raw               = ocr_result.get("raw_text") or []
        engine_used       = ocr_result.get("engine")

        logger.info(
            "Card OCR via %s: enroll=%s uid=%s name=%s program=%s",
            engine_used, enrollment_number, university_id,
            ocr_result.get("name"), ocr_result.get("program"),
        )

        # Common fields the frontend always wants back
        common = dict(
            enrollment_number=enrollment_number,
            university_id=university_id,
            name=ocr_result.get("name"),
            card_type=ocr_result.get("card_type"),
            program=ocr_result.get("program"),
            campus=ocr_result.get("campus"),
            issued_on=ocr_result.get("issued_on"),
            valid_upto=ocr_result.get("valid_upto"),
            serial_no=ocr_result.get("serial_no"),
            raw_text=raw,
            ocr_engine=engine_used,
        )

        # Need at least one ID to look up the user
        lookup_id = enrollment_number or university_id
        if not lookup_id:
            preview = ", ".join(raw[:3]) if raw else "no text"
            return CardScanResponse(
                granted=False,
                reason=f"Could not find an ID on the card. Read: {preview}",
                **common,
            )

        user = engine.get_user_by_card(lookup_id)
        if not user:
            return CardScanResponse(
                granted=False,
                reason=f"ID {lookup_id} is not registered in the system.",
                **common,
            )

        granted = user.get("status") == "ACTIVE"
        return CardScanResponse(
            granted=granted,
            user=user,
            reason=None if granted else f"Account is {user.get('status')}",
            **common,
        )
    except Exception as e:
        logger.error(f"Card scan error: {e}")
        raise HTTPException(500, str(e))


# ── CNIC OCR (visitors) ──────────────────────────────────────────────────────

class CnicScanResponse(BaseModel):
    found:          bool
    cnic:           Optional[str] = None    # display format "35201-1234567-8"
    cnic_digits:    Optional[str] = None    # 13 digits no dashes — what Visitor.cnic expects
    name:           Optional[str] = None    # cardholder
    father_name:    Optional[str] = None
    gender:         Optional[str] = None    # "M" / "F"
    date_of_birth:  Optional[str] = None    # "01.02.1995"
    date_of_issue:  Optional[str] = None
    date_of_expiry: Optional[str] = None
    raw_text:       Optional[List[str]] = None
    ocr_engine:     Optional[str] = None
    reason:         Optional[str] = None    # populated when found=False


@app.post("/api/face/scan-cnic/", response_model=CnicScanResponse)
async def scan_cnic(req: ImageRequest):
    """
    OCR a Pakistani CNIC and extract every structured field we can recognise.

    Used by Security when registering a walk-in visitor at the gate. We don't
    auto-grant entry; security still has to confirm and pick the host the
    visitor is here to see.
    """
    try:
        # Burst mode mirrors scan-card: multi-frame consensus when the
        # frontend sends `images: [...]`, single-frame otherwise.
        frames_b64 = req.images if (req.images and len(req.images) > 0) else [req.image]
        per_frame: list = []
        for b64 in frames_b64[:5]:
            try:
                frame_img = decode_image(b64)
                r = engine.ocr_cnic(frame_img)
                if r:
                    per_frame.append(r)
                    # 2-frame agreement before early-exit, same rationale as
                    # the card path — preserves consensus voting's ability
                    # to catch a single misread digit on the first frame.
                    if (len(per_frame) >= 2
                        and engine.is_high_confidence_cnic_read(per_frame[-1])
                        and engine.is_high_confidence_cnic_read(per_frame[-2])
                        and (per_frame[-1].get("cnic")
                             == per_frame[-2].get("cnic"))
                        and (per_frame[-1].get("name")
                             == per_frame[-2].get("name"))):
                        logger.info(
                            "CNIC burst early-exit after %d frame(s) — 2-frame agreement",
                            len(per_frame),
                        )
                        break
            except Exception as fe:
                logger.warning("Frame in burst failed to decode/OCR: %s", fe)
                continue

        if not per_frame:
            return CnicScanResponse(
                found=False,
                reason="No text detected on the CNIC. Hold it steady, well lit, and try again.",
            )

        result = per_frame[0] if len(per_frame) == 1 else engine.consensus_ocr(per_frame)

        cnic_display = result.get("cnic")
        cnic_digits  = cnic_display.replace("-", "") if cnic_display else None

        # Common bag of OCR-extracted fields the response always carries.
        common = dict(
            cnic           = cnic_display,
            cnic_digits    = cnic_digits,
            name           = result.get("name"),
            father_name    = result.get("father_name"),
            gender         = result.get("gender"),
            date_of_birth  = result.get("date_of_birth"),
            date_of_issue  = result.get("date_of_issue"),
            date_of_expiry = result.get("date_of_expiry"),
            raw_text       = result.get("raw_text"),
            ocr_engine     = result.get("engine"),
        )
        logger.info(
            "CNIC OCR via %s: cnic=%s name=%s",
            common["ocr_engine"], cnic_display, common["name"],
        )

        if not cnic_display:
            preview = ", ".join((result.get("raw_text") or [])[:3]) or "no text"
            return CnicScanResponse(
                found=False,
                reason=f"Could not find a 13-digit CNIC on the card. Read: {preview}",
                **common,
            )

        return CnicScanResponse(found=True, **common)
    except Exception as e:
        logger.error("CNIC scan error: %s", e)
        raise HTTPException(500, str(e))


@app.post("/api/face/liveness/")
async def check_liveness(req: ImageRequest):
    """Standalone liveness check — used for testing anti-spoofing."""
    img = decode_image(req.image)
    live = engine.check_liveness(img)
    return {"liveness": live}


@app.post("/api/face/lookup-id/")
async def lookup_by_id(data: dict):
    """
    Hardware adapter endpoint — for direct ID string input (e.g. card reader GPIO).
    No image required: card reader sends the university_id directly.
    """
    uid = data.get("university_id", "").strip()
    if not uid:
        raise HTTPException(400, "university_id required")
    user = engine.get_user_by_card(uid)
    if not user:
        return {"granted": False, "reason": "Not found"}
    granted = user.get("status") == "ACTIVE"
    return {"granted": granted, "user": user}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api_server:app", host="0.0.0.0", port=5000, reload=True)
