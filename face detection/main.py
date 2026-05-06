"""
FaceEngine — core AI pipeline for campus gate access.

Architecture (hardware-agnostic):
    Input layer  → any source: webcam, IP cam, dedicated HW scanner
    Detection    → InsightFace ArcFace (face detection + embedding)
    Liveness     → Silent-Face anti-spoofing model
    Card OCR     → PaddleOCR / Tesseract on cropped card region
    Matching     → Cosine similarity against PostgreSQL face_encoding store
    Output layer → grant/deny decision + user record to api_server.py

When real hardware arrives (retina scanner, card terminal, Jetson):
    - Add a new Input class (e.g. RetinaInput, GPIOInput)
    - Call the same encode / match / decide pipeline
    - No changes needed to FaceEngine internals
"""

import os
import logging
import requests
from pathlib import Path
from typing import Optional, Tuple, List
from dataclasses import dataclass, asdict

import numpy as np
import cv2

# Load .env from the project root (one level up from "face detection/") so the
# FastAPI service sees the same INTERNAL_SERVICE_TOKEN / FACE_SIMILARITY_THRESHOLD
# / DJANGO_API_URL the user puts in .env. Without this, Django and FastAPI can
# silently disagree on the internal-token if it's customised.
try:
    from dotenv import load_dotenv
    _PROJECT_ROOT = Path(__file__).resolve().parent.parent
    load_dotenv(_PROJECT_ROOT / ".env")
except ImportError:
    pass

logger = logging.getLogger(__name__)

# Lazy-load heavy models so the server starts instantly
try:
    import insightface
    from insightface.app import FaceAnalysis
    INSIGHTFACE_AVAILABLE = True
except ImportError:
    INSIGHTFACE_AVAILABLE = False
    logger.warning("insightface not installed — face detection disabled")

try:
    import onnxruntime as ort
    ONNX_AVAILABLE = True
except ImportError:
    ONNX_AVAILABLE = False

DJANGO_API = os.getenv("DJANGO_API_URL", "http://127.0.0.1:8000/api/auth")
DJANGO_TOKEN = os.getenv("DJANGO_SERVICE_TOKEN", "")  # legacy: service-level JWT
INTERNAL_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "dev-internal-token-change-me-in-prod")
SIMILARITY_THRESHOLD = float(os.getenv("FACE_SIMILARITY_THRESHOLD", "0.42"))

MODELS_DIR = Path(__file__).parent / "models"


def _clean_name(s: str) -> str:
    """Strip OCR artefacts off a captured name string."""
    import re
    if not s:
        return ""
    s = s.strip()
    # Drop trailing junk like "S/o", colons, stray digits OCR sometimes
    # appends from the next field
    s = re.sub(r"\s*[:;|]\s*$", "", s)
    s = re.sub(r"\s+\d.*$", "", s)
    # Collapse whitespace
    s = re.sub(r"\s+", " ", s).strip()
    return s


class FaceEngine:
    def __init__(self):
        self.model_loaded = False
        self._face_app = None
        self._liveness_session = None
        # New schema: keyed by enrollment_id (not user_id) — a user can have
        # multiple active enrollments per the proposal (e.g. with/without glasses).
        # Each entry: {user_id, university_id, full_name, role, embedding (np.ndarray)}
        self._enrollments: dict[str, dict] = {}
        self._cache_loaded = False  # Lazily populated on first verify
        self._load_models()

    # ── Model loading ─────────────────────────────────────────────────────────

    def _load_models(self):
        if not INSIGHTFACE_AVAILABLE:
            logger.warning("Running without InsightFace — verify/register will return None")
            return
        try:
            # Prefer CUDA when both onnxruntime-gpu and a CUDA device are
            # present. ctx_id=0 → first GPU device; ctx_id=-1 → CPU. Falls
            # back silently to CPU on any provider error so this never blocks
            # startup on machines without GPU drivers.
            providers = ["CPUExecutionProvider"]
            ctx_id = -1
            try:
                if ONNX_AVAILABLE:
                    available = ort.get_available_providers()
                    if "CUDAExecutionProvider" in available:
                        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
                        ctx_id = 0
            except Exception:
                pass
            self._face_app = FaceAnalysis(name="buffalo_l", providers=providers)
            self._face_app.prepare(ctx_id=ctx_id, det_size=(640, 640))
            logger.info("InsightFace ArcFace model loaded (providers=%s)", providers)
        except Exception as e:
            logger.error(f"Failed to load InsightFace: {e}")
            self._face_app = None

        # Anti-spoofing (Silent-Face or FAS model)
        fas_path = MODELS_DIR / "anti_spoof.onnx"
        if fas_path.exists() and ONNX_AVAILABLE:
            try:
                self._liveness_session = ort.InferenceSession(str(fas_path))
                logger.info("Anti-spoofing model loaded")
            except Exception as e:
                logger.warning(f"Could not load anti-spoofing model: {e}")

        self.model_loaded = self._face_app is not None

    # ── Face encoding ─────────────────────────────────────────────────────────

    def get_face_encoding(self, img: np.ndarray) -> Optional[np.ndarray]:
        """Return a 512-dim ArcFace embedding for the largest face in the image."""
        if self._face_app is None:
            return None
        faces = self._face_app.get(img)
        if not faces:
            return None
        # Use the largest detected face
        face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        return face.normed_embedding

    def store_encoding(self, user_id: str, encoding: np.ndarray):
        """Legacy single-frame registration path. New flow uses enroll_from_frames + Django."""
        # Treat the user_id as a synthetic enrollment_id for backwards compatibility.
        self._enrollments[user_id] = {
            "user_id": user_id,
            "university_id": "",
            "full_name": "",
            "role": "",
            "embedding": encoding,
        }

    # ── Matching ──────────────────────────────────────────────────────────────

    def find_match(self, query: np.ndarray) -> Tuple[Optional[dict], float]:
        """
        Cosine similarity search against all active enrollments.
        Returns (match_info_dict, confidence) or (None, best_score).

        match_info_dict shape:
            { enrollment_id, user_id, university_id, full_name, role }
        """
        if not self._cache_loaded:
            self._load_enrollments_from_django()

        best_eid = None
        best_score = 0.0
        best_record = None
        for eid, record in self._enrollments.items():
            score = float(np.dot(query, record["embedding"]))  # both L2-normalised
            if score > best_score:
                best_score = score
                best_eid = eid
                best_record = record

        if best_eid is None or best_score < SIMILARITY_THRESHOLD:
            return None, best_score

        return {
            "enrollment_id": best_eid,
            "user_id": best_record["user_id"],
            "university_id": best_record["university_id"],
            "full_name": best_record["full_name"],
            "role": best_record["role"],
        }, best_score

    def _load_enrollments_from_django(self) -> None:
        """
        Pull all active enrollments from Django (PostgreSQL is the source of truth)
        into the in-memory match cache. Called lazily on first verify; can also be
        triggered externally via /api/face/sync-reload/.
        """
        try:
            res = requests.get(
                f"{DJANGO_API}/face-enrollments/active/",
                headers={"X-Internal-Token": INTERNAL_TOKEN},
                timeout=10,
            )
            res.raise_for_status()
            payload = res.json()
            self._enrollments.clear()
            for item in payload.get("enrollments", []):
                if not item.get("embedding"):
                    continue
                emb = np.frombuffer(bytes.fromhex(item["embedding"]), dtype=np.float32)
                self._enrollments[item["enrollment_id"]] = {
                    "user_id": item["user_id"],
                    "university_id": item.get("university_id", "") or "",
                    "full_name": item.get("full_name", "") or "",
                    "role": item.get("role", "") or "",
                    "embedding": emb,
                }
            self._cache_loaded = True
            logger.info("Loaded %d active enrollments from Django", len(self._enrollments))
        except Exception as e:
            logger.warning("Could not load enrollments from Django: %s", e)
            # Mark loaded anyway so we don't retry on every verify call.
            # Will be populated on next sync-add or via explicit sync-reload.
            self._cache_loaded = True

    def add_enrollment_to_cache(
        self, enrollment_id: str, user_id: str, university_id: str,
        full_name: str, role: str, embedding_hex: str,
    ) -> None:
        """Called by Django via /api/face/sync-add/ after a new enrollment is saved."""
        emb = np.frombuffer(bytes.fromhex(embedding_hex), dtype=np.float32)
        self._enrollments[enrollment_id] = {
            "user_id": user_id, "university_id": university_id or "",
            "full_name": full_name or "", "role": role or "",
            "embedding": emb,
        }
        self._cache_loaded = True
        logger.info("Added enrollment %s for %s to cache (now %d entries)",
                    enrollment_id, full_name or user_id, len(self._enrollments))

    def remove_enrollment_from_cache(self, enrollment_id: str) -> bool:
        """Called by Django via /api/face/sync-remove/ after deactivation."""
        existed = self._enrollments.pop(enrollment_id, None) is not None
        if existed:
            logger.info("Removed enrollment %s from cache (now %d entries)",
                        enrollment_id, len(self._enrollments))
        return existed

    # ── Liveness ──────────────────────────────────────────────────────────────

    def check_liveness(self, img: np.ndarray) -> bool:
        """
        Anti-spoofing check.
        Returns True if the frame contains a live person.
        Falls back to True when model is unavailable (dev mode).
        """
        if self._liveness_session is None:
            logger.debug("No liveness model — defaulting to True (dev mode)")
            return True
        try:
            inp = cv2.resize(img, (80, 80)).astype(np.float32) / 255.0
            inp = np.transpose(inp, (2, 0, 1))[np.newaxis]
            out = self._liveness_session.run(None, {"input": inp})[0]
            # Model outputs [fake_score, live_score] — live if live_score > 0.5
            return float(out[0][1]) > 0.5
        except Exception as e:
            logger.warning(f"Liveness check error: {e}")
            return True

    # ── Card OCR ──────────────────────────────────────────────────────────────
    #
    # OCR engine is loaded lazily on first call so FastAPI startup stays fast.
    # We try EasyOCR first (pure-pip install, no system deps), then PaddleOCR,
    # then pytesseract. Whichever is installed wins.

    _ocr_reader = None  # cached EasyOCR Reader instance

    @staticmethod
    def _score_card_text(lines: list[str]) -> float:
        """
        Score how "card-like" a list of OCR'd lines looks. Higher = better.

        We use this to pick the BEST preprocessed variant out of several
        candidates instead of taking the first non-empty one (which was the
        old behaviour and frequently picked up junk before it ever saw the
        printed enrollment number).

        Components:
          + 6.0  per enrollment-number-shaped match (NN-NNNNNN-NNN)
          + 4.0  per legacy university_id-shaped match (BU-YYYY-DEPT-NNNN)
          + 3.0  per name-shaped line (2-4 ALL-CAPS words, no template tokens)
          + 1.5  per card-keyword hit (BAHRIA, CAMPUS, STUDENT, ENROLLMENT, …)
          + 0.5  per non-trivial line (length ≥ 4) — cheap "we're reading text"
        """
        import re
        if not lines:
            return 0.0
        joined = " ".join(lines)
        score = 0.0

        # Enrollment number — strict digits (NN-NNNNNN-NNN, separators flexible)
        score += 6.0 * len(re.findall(r"\d{2}[-_~\s\.]\d{6}[-_~\s\.]\d{3}", joined))
        # Legacy university_id (BU-YYYY-DEPT-NNNN style)
        score += 4.0 * len(re.findall(
            r"\b(?:BU|FAC|STF|SEC|ADM)[-_~\s\.]?\d{2,4}[-_~\s\.]?[A-Z]{0,4}[-_~\s\.]?\d{3,5}\b",
            joined, re.IGNORECASE))
        # Card keywords
        for kw in ("BAHRIA", "UNIVERSITY", "CAMPUS", "STUDENT", "FACULTY",
                   "ENROLLMENT", "REGISTRATION", "PROGRAM"):
            if re.search(rf"\b{kw}\b", joined, re.IGNORECASE):
                score += 1.5
        # Plausible name lines (cheap — anything 2-4 words ALL CAPS, no template tokens)
        BLOCK = {"BAHRIA", "UNIVERSITY", "CAMPUS", "STUDENT", "FACULTY",
                 "STAFF", "ENROLLMENT", "PROGRAM", "ISSUED", "VALID"}
        for ln in lines:
            s = ln.strip()
            if not re.match(r"^[A-Z][A-Z\s\.\-']{4,40}$", s):
                continue
            words = [w for w in s.split() if w]
            if 2 <= len(words) <= 4 and not any(w.upper() in BLOCK for w in words):
                score += 3.0
                break
        # Cheap baseline so a totally-empty result is clearly worse than any read
        score += 0.5 * sum(1 for ln in lines if len(ln.strip()) >= 4)
        return score

    @staticmethod
    def _score_cnic_text(lines: list[str]) -> float:
        """
        Score how "CNIC-like" a list of OCR'd lines looks.

        Components:
          + 6.0  per CNIC-shaped match (NNNNN-NNNNNNN-N)
          + 3.0  per name-shaped line
          + 1.5  per CNIC keyword hit (Pakistan, Identity, Father, Date, …)
          + 0.5  per non-trivial line
        """
        import re
        if not lines:
            return 0.0
        joined = " ".join(lines)
        score = 0.0
        score += 6.0 * len(re.findall(r"\d{5}[-_~\s\.]\d{7}[-_~\s\.]\d", joined))
        for kw in ("PAKISTAN", "IDENTITY", "NATIONAL", "FATHER", "GENDER",
                   "BIRTH", "EXPIRY", "ISSUE", "GOVERNMENT", "NADRA"):
            if re.search(rf"\b{kw}\b", joined, re.IGNORECASE):
                score += 1.5
        for ln in lines:
            s = ln.strip()
            if re.match(r"^[A-Za-z][A-Za-z\s\.\-']{2,40}$", s) and 2 <= len(s.split()) <= 4:
                score += 3.0
                break
        score += 0.5 * sum(1 for ln in lines if len(ln.strip()) >= 4)
        return score

    @staticmethod
    def is_high_confidence_card_read(result: Optional[dict]) -> bool:
        """
        True when a card OCR result is clean enough that running OCR on more
        frames in the burst is unlikely to improve it. Used by the API server
        to short-circuit the multi-frame loop and cut perceived scan latency.
        """
        if not result:
            return False
        has_id = bool(result.get("enrollment_number") or result.get("university_id"))
        has_name = bool(result.get("name"))
        return has_id and has_name

    @staticmethod
    def is_high_confidence_cnic_read(result: Optional[dict]) -> bool:
        """Same idea as is_high_confidence_card_read but for Pakistani CNICs."""
        if not result:
            return False
        return bool(result.get("cnic")) and bool(result.get("name"))

    def ocr_card(self, img: np.ndarray) -> Optional[dict]:
        """
        Read a campus card and extract every structured field we can recognise.

        Returns a dict (keys are None when not found):
            {
                "enrollment_number": "03-134222-110",   # primary lookup key
                "university_id":     "BU-2026-CS-1234", # legacy auto-generated ID
                "name":              "UMER JAVAID",
                "card_type":         "STUDENT",         # STUDENT / FACULTY / STAFF / ADMIN
                "program":           "BS (CS)",
                "campus":            "Lahore Campus",
                "issued_on":         "SEP-2022",
                "valid_upto":        "SEP-2028",
                "serial_no":         "36192",
                "raw_text":          ["UMER JAVAID", "Enrollment: 03-134222-110", ...],
                "engine":            "easyocr" | "paddleocr" | "tesseract",
            }

        Returns None only when OCR can read no text at all. If text is read but
        no enrollment number / university_id matches a known pattern, the dict
        is still returned with `enrollment_number=None` so the caller can show
        a helpful diagnostic.

        Future: when a real RFID / USB card reader is wired in, the printed-card
        OCR step is replaced by a direct serial read.
        """
        ocr = self._run_ocr(img, kind="card")
        if not ocr:
            return None
        text_lines, engine_used = ocr

        fields = self._parse_card_fields(text_lines)
        fields["raw_text"] = text_lines
        fields["engine"] = engine_used
        return fields

    def _run_ocr(self, img: np.ndarray, kind: Optional[str] = None) -> Optional[tuple]:
        """
        Run OCR on a frame using whichever engine is installed. Returns
        (text_lines, engine_name) or None when no text could be read.

        Shared by ocr_card (campus IDs) and ocr_cnic (Pakistani CNIC scans)
        so the engine-loading + preprocessing pipeline lives in one place.

        `kind` lets the caller hint at which patterns matter ("card" or "cnic"),
        so when several preprocessed variants all return text we can pick the
        one whose text best matches the patterns we care about. None = score
        for both.

        Strategy:
          1. Generate 4 preprocessed variants (mild / denoised / binarised / raw)
          2. Run EasyOCR on each with detail=1 (gets per-token confidence)
          3. Drop low-confidence tokens
          4. Score each variant's text against the expected patterns
          5. Return the best-scoring variant

        This replaces the old "first non-empty result wins" loop, which often
        accepted the noisiest variant just because it happened to read first.
        """
        # Pick the appropriate scorer for the call site. None = sum of both,
        # so generic callers (if any) still get a sensible ranking.
        if kind == "card":
            scorer = FaceEngine._score_card_text
        elif kind == "cnic":
            scorer = FaceEngine._score_cnic_text
        else:
            scorer = lambda lines: (FaceEngine._score_card_text(lines)
                                    + FaceEngine._score_cnic_text(lines))

        variants = FaceEngine._ocr_variants(img)

        # ── EasyOCR (preferred) ───────────────────────────────────────────
        try:
            import easyocr  # type: ignore
            if FaceEngine._ocr_reader is None:
                # Auto-enable GPU when CUDA is available — same accuracy,
                # roughly 5–10× faster per readtext call. Safe to fall back
                # to CPU silently if torch/CUDA aren't installed.
                gpu = False
                try:
                    import torch  # type: ignore
                    gpu = bool(torch.cuda.is_available())
                except Exception:
                    pass
                logger.info("Loading EasyOCR reader (one-time, ~2-3 sec, gpu=%s)...", gpu)
                FaceEngine._ocr_reader = easyocr.Reader(["en"], gpu=gpu, verbose=False)

            # Run every variant and keep the one whose text scores highest.
            # Quality > speed: an early-exit threshold here would risk picking
            # a "good enough" read when a later variant would have been better.
            # The slow-variant cost is bounded by the 4-pass cap and the lazy
            # variant factories (denoised only materialises if reached).
            #
            # `detail=1` returns [(bbox, text, conf), ...] so we can drop
            # very-low-confidence tokens before scoring (those are almost
            # always artefacts that hurt name detection later).
            best_score: float = -1.0
            best_lines: list[str] = []
            best_label: str = ""
            best_raw: list = []        # full (bbox, text, conf) tuples — needed for
            best_source: Optional[np.ndarray] = None  # the digit-allowlist refinement pass
            CONF_FLOOR = 0.30  # below this, EasyOCR is essentially guessing
            for label, factory in variants:
                source = factory()
                try:
                    # `decoder='beamsearch'` is ~5–10% more accurate than the
                    # default greedy decoder on noisy ID-card text — it
                    # explores multiple candidate strings instead of locking
                    # in on the first guess. Cost is ~1.5–2× more compute per
                    # readtext call, which the GPU path absorbs trivially and
                    # which the CPU path can also afford given our budgets.
                    raw = FaceEngine._ocr_reader.readtext(
                        source, detail=1, paragraph=False,
                        decoder="beamsearch", beamWidth=5,
                    )
                except Exception as e:
                    logger.debug("EasyOCR variant %s failed: %s", label, e)
                    continue
                lines = [str(text).strip() for (_box, text, conf) in raw
                         if text and conf >= CONF_FLOOR]
                if not lines:
                    continue
                s = scorer(lines)
                logger.debug("OCR variant %s scored %.2f (%d lines)", label, s, len(lines))
                if s > best_score:
                    best_score = s
                    best_lines = lines
                    best_label = label
                    best_raw = raw
                    best_source = source

            if best_lines:
                # ── Second-pass refinement on the digit field ────────────
                # Only re-run when the strict-format ID isn't already there.
                # On a clean read the regex matches and we skip the extra OCR.
                if kind in ("card", "cnic") and best_source is not None and best_raw:
                    import re
                    strict_re = (re.compile(r"\d{2}-\d{6}-\d{3}") if kind == "card"
                                 else re.compile(r"\d{5}-\d{7}-\d"))
                    if not any(strict_re.search(ln) for ln in best_lines):
                        try:
                            refined = FaceEngine._refine_digit_field(
                                best_raw, best_source, kind,
                            )
                            if refined:
                                # Replace the matching line, or insert if not found.
                                shape_re = (re.compile(r"\d{2}\W?\d{6}\W?\d{3}") if kind == "card"
                                            else re.compile(r"\d{5}\W?\d{7}\W?\d"))
                                replaced = False
                                for i, ln in enumerate(best_lines):
                                    if shape_re.search(ln):
                                        if best_lines[i] != refined:
                                            logger.info("OCR refined: %r → %r", best_lines[i], refined)
                                        best_lines[i] = refined
                                        replaced = True
                                        break
                                if not replaced:
                                    best_lines.insert(0, refined)
                                    logger.info("OCR refined (added): %r", refined)
                        except Exception as e:
                            logger.debug("Digit-allowlist refinement skipped: %s", e)

                logger.info("OCR best variant: %s (score=%.2f, kind=%s)",
                            best_label, best_score, kind or "any")
                return best_lines, "easyocr"
        except ImportError:
            pass
        except Exception as e:
            logger.warning("EasyOCR error: %s", e)

        # ── PaddleOCR fallback ────────────────────────────────────────────
        # Paddle's preprocessing is internal so we just hand it the raw frame.
        try:
            from paddleocr import PaddleOCR  # type: ignore
            ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
            result = ocr.ocr(img, cls=True)
            paddle_lines = [line[1][0] for block in (result or []) for line in (block or [])]
            if paddle_lines:
                return paddle_lines, "paddleocr"
        except ImportError:
            pass
        except Exception as e:
            logger.warning("PaddleOCR error: %s", e)

        # ── pytesseract fallback ──────────────────────────────────────────
        try:
            import pytesseract  # type: ignore
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
            text = pytesseract.image_to_string(gray)
            tess_lines = [ln for ln in text.splitlines() if ln.strip()]
            if tess_lines:
                return tess_lines, "tesseract"
        except Exception:
            pass

        return None

    def ocr_cnic(self, img: np.ndarray) -> Optional[dict]:
        """
        Read a Pakistani CNIC card and extract structured fields.

        Pakistani CNIC layout (front):
            Government of Pakistan / National Identity Card  (header)
            <Name>                                           (cardholder)
            Father Name: <Father>
            Gender: M / F
            Country of Stay: Pakistan
            Identity Number: 35201-1234567-8
            Date of Birth: 01.02.1995
            Date of Issue:  10.08.2020
            Date of Expiry: 09.08.2030
            (Photo on the right)

        Returns a dict with these keys (None when not detected):
            {
                "cnic":            "35201-1234567-8",
                "name":            "MUHAMMAD UMER",
                "father_name":     "JAVAID HUSSAIN",
                "gender":          "M" | "F",
                "date_of_birth":   "01.02.1995",
                "date_of_issue":   "10.08.2020",
                "date_of_expiry":  "09.08.2030",
                "raw_text":        [...all OCR'd lines],
                "engine":          "easyocr" | "paddleocr" | "tesseract",
            }
        """
        ocr = self._run_ocr(img, kind="cnic")
        if not ocr:
            return None
        text_lines, engine_used = ocr

        fields = self._parse_cnic_fields(text_lines)
        fields["raw_text"] = text_lines
        fields["engine"] = engine_used
        return fields

    @staticmethod
    def _parse_cnic_fields(lines: list[str]) -> dict:
        """
        Extract everything we can from CNIC OCR output.

        Robust to:
          - separator drift (35201-1234567-8 vs 35201 1234567 8 vs 35201.1234567.8)
          - digit-letter swaps (O↔0, I↔1, S↔5)
          - missing labels — name often appears on a line by itself with no prefix
        """
        import re

        SEP = r"[-_~\s\.\,]+"            # any digit separator OCR might emit
        DIGIT = r"[0-9OoIlSsBZ]"          # digits + look-alike letters
        joined = " ".join(lines)

        out = {
            "cnic":           None,
            "name":           None,
            "father_name":    None,
            "gender":         None,
            "date_of_birth":  None,
            "date_of_issue":  None,
            "date_of_expiry": None,
        }

        # ── CNIC number (XXXXX-XXXXXXX-X) ─────────────────────────────────
        for digit_class in (r"\d", DIGIT):
            cnic_pat = re.compile(
                rf"({digit_class}{{5}}){SEP}({digit_class}{{7}}){SEP}({digit_class}{{1}})"
            )
            m = cnic_pat.search(joined)
            if m:
                raw = "-".join(m.groups()).upper()
                fixed = (raw.replace("O", "0").replace("I", "1").replace("L", "1")
                            .replace("S", "5").replace("B", "8").replace("Z", "2"))
                out["cnic"] = fixed
                break

        # ── Date helper (dd.mm.yyyy / dd-mm-yyyy / dd/mm/yyyy) ────────────
        # Wrap the label in a non-capturing group so the date is always group 1
        # regardless of which label alternative matches.
        DATE = r"(\d{2}[.\-/]\d{2}[.\-/]\d{4})"
        def find_date(label_re: str) -> Optional[str]:
            m = re.search(rf"(?:{label_re})[^\d]{{0,20}}{DATE}", joined, re.IGNORECASE)
            return m.group(1).replace("/", ".").replace("-", ".") if m else None

        out["date_of_birth"]  = find_date(r"Date of Birth|D[\.\s]*O[\.\s]*B|Birth")
        out["date_of_issue"]  = find_date(r"Date of Issue|Issue")
        out["date_of_expiry"] = find_date(r"Date of Expiry|Expiry|Expir")

        # ── Gender (M / F, often labeled or alone) ────────────────────────
        # Anchor on "Gender" first, then a defensive lone-letter fallback.
        m = re.search(r"Gender[^\w]{0,5}([MF])\b", joined, re.IGNORECASE)
        if m:
            out["gender"] = m.group(1).upper()

        # ── Name (cardholder) and Father's name ───────────────────────────
        # CNIC OCR comes in two flavours:
        #   (a) "Name: Umer Javaid"           label and value on the SAME line
        #   (b) "Name" \n "Umer Javaid"       label on one line, value on the NEXT
        # We try (a) first via inline label match, then (b) by scanning each
        # label-only line and grabbing the next non-empty line as the value.

        BLOCK = {
            "GOVERNMENT", "PAKISTAN", "NATIONAL", "IDENTITY", "CARD",
            "REPUBLIC", "ISLAMIC", "DATE", "BIRTH", "ISSUE", "EXPIRY",
            "GENDER", "FATHER", "HOLDER", "COUNTRY", "STAY", "NADRA",
            "M", "F", "MALE", "FEMALE", "NAME",
        }

        def looks_like_name(s: str) -> bool:
            # Case-insensitive: title case "Umer Javaid" and ALL CAPS both pass.
            stripped = s.strip()
            if not re.match(r"^[A-Za-z][A-Za-z\s\.\-']{2,40}$", stripped):
                return False
            words = [w.strip(".-'") for w in stripped.split() if w.strip(".-'")]
            if len(words) < 1 or len(words) > 5:
                return False
            if any(w.upper() in BLOCK for w in words):
                return False
            return True

        # Pass A: inline labels  "Father Name: Javaid Akhtar"
        for line in lines:
            m = re.match(r"\s*Father(?:'s)?\s*Name\s*[:\-]\s*(.+)$", line, re.IGNORECASE)
            if m and not out["father_name"]:
                cand = _clean_name(m.group(1))
                if cand:
                    out["father_name"] = cand
                continue
            m = re.match(r"\s*(?:Holder|Card[\s-]*Holder)?\s*Name\s*[:\-]\s*(.+)$", line, re.IGNORECASE)
            if m and not out["name"]:
                cand = _clean_name(m.group(1))
                if cand and "father" not in cand.lower():
                    out["name"] = cand

        # Pass B: "label on its own line" then next non-empty value-shaped line
        if not out["name"] or not out["father_name"]:
            cleaned = [ln.strip() for ln in lines]
            for i, line in enumerate(cleaned):
                low = line.lower().rstrip(": ")
                if low == "name" and not out["name"]:
                    # Next 1-2 lines might form the name (sometimes split across two)
                    for j in (i + 1, i + 2):
                        if j < len(cleaned) and looks_like_name(cleaned[j]):
                            out["name"] = _clean_name(cleaned[j])
                            break
                if (low == "father name" or low == "father's name") and not out["father_name"]:
                    for j in (i + 1, i + 2):
                        if j < len(cleaned) and looks_like_name(cleaned[j]):
                            out["father_name"] = _clean_name(cleaned[j])
                            break

        # Pass C: ultimate fallback — first plausible person-name line that
        # isn't already used as the father name and isn't boilerplate.
        if not out["name"]:
            for line in lines:
                stripped = line.strip()
                if not looks_like_name(stripped):
                    continue
                if out["father_name"] and stripped == out["father_name"]:
                    continue
                # Need at least 2 words for the cardholder fallback (single-
                # word lines too often pick up labels that snuck through).
                if len(stripped.split()) < 2:
                    continue
                out["name"] = stripped
                break

        return out

    @staticmethod
    def consensus_ocr(per_frame: list[dict]) -> dict:
        """
        Combine OCR results from multiple frames into a single best-guess
        dict via per-field majority voting.

        The frontend captures 3-5 frames in quick succession; each frame
        sees slightly different optical conditions (hand jitter, focus
        refresh, micro-changes in glare). For any single field, the most
        frequently-read value across frames is overwhelmingly likely to
        be correct — even if any one frame got it wrong.

        Tie-breaking rules:
          - Prefer values that appear in multiple frames over values that
            appear in only one
          - On ties, prefer non-empty strings over empty
          - On further ties, prefer the value from the earliest frame (we
            capture before the user has time to move)

        `raw_text` is concatenated across frames so the audit trail is
        preserved (Visitor.ocr_raw_text uses this).
        """
        from collections import Counter

        if not per_frame:
            return {}
        if len(per_frame) == 1:
            return per_frame[0]

        # Fields we vote on. Anything else falls through to the first frame.
        VOTE_FIELDS = (
            # Card
            "enrollment_number", "university_id", "name", "card_type",
            "program", "campus", "issued_on", "valid_upto", "serial_no",
            # CNIC
            "cnic", "father_name", "gender",
            "date_of_birth", "date_of_issue", "date_of_expiry",
        )

        out: dict = dict(per_frame[0])  # start from frame 0 (preserves engine + any extras)

        for field in VOTE_FIELDS:
            values = [d.get(field) for d in per_frame if d.get(field)]
            if not values:
                out[field] = None
                continue
            counter = Counter(values)
            # most_common returns [(value, count), ...] sorted by count desc.
            # When counts tie, Counter preserves insertion order in Python 3.7+
            # so the value from the earliest frame wins — exactly what we want.
            top_value, top_count = counter.most_common(1)[0]
            out[field] = top_value
            if len(per_frame) >= 3 and top_count >= 2:
                # Strong agreement — log so we can see the win in debug
                logger.debug("consensus %s: %r won %d/%d", field, top_value, top_count, len(per_frame))

        # Audit: keep raw text from every frame so the diagnostic is complete.
        merged_raw: list = []
        for d in per_frame:
            for ln in (d.get("raw_text") or []):
                if ln and ln not in merged_raw:
                    merged_raw.append(ln)
        out["raw_text"] = merged_raw

        # Engine — most-common engine across frames (almost always identical)
        engines = [d.get("engine") for d in per_frame if d.get("engine")]
        if engines:
            out["engine"] = Counter(engines).most_common(1)[0][0]

        # Diagnostic field so the API response can show "we read N frames"
        out["frame_count"] = len(per_frame)

        return out

    @staticmethod
    def _refine_digit_field(
        raw_results: list,
        source_img: np.ndarray,
        kind: str,
    ) -> Optional[str]:
        """
        Second-pass OCR on JUST the digit field, with the model's character
        set locked to digits + dashes. Greatly reduces O↔0, I↔1, B↔8, S↔5
        confusion on enrollment numbers and CNICs.

        How it works:
          1. Scan the first-pass (bbox, text, conf) tuples for one whose
             text loosely matches the target shape (\\d{2}-\\d{6}-\\d{3}
             for cards, \\d{5}-\\d{7}-\\d for CNICs — letter look-alikes
             treated as digits).
          2. Crop that bbox from the source image with 15% padding.
          3. Re-run EasyOCR on the crop with `allowlist='0123456789-'`.
          4. If the new text strictly matches the target pattern, return
             it as the corrected value; otherwise return None and let the
             caller fall back to the original first-pass text.

        Returns the refined string in canonical "XX-XXXXXX-XXX" /
        "XXXXX-XXXXXXX-X" form, or None when no refinement was possible.
        """
        import re
        if FaceEngine._ocr_reader is None or not raw_results:
            return None

        # Match patterns. The "loose" form lets letters that OCR commonly
        # picks up (O, I, L, B, S, Z) substitute for their digit twins so
        # we still find the candidate bbox even when the first read was
        # garbled. The "strict" form is what the second pass must produce.
        if kind == "card":
            loose = re.compile(r"[\dOoIlLBSZ]{2}\W?[\dOoIlLBSZ]{6}\W?[\dOoIlLBSZ]{3}")
            strict = re.compile(r"^(\d{2})-(\d{6})-(\d{3})$")
            length = (2, 6, 3)
        else:  # "cnic"
            loose = re.compile(r"[\dOoIlLBSZ]{5}\W?[\dOoIlLBSZ]{7}\W?[\dOoIlLBSZ]")
            strict = re.compile(r"^(\d{5})-(\d{7})-(\d)$")
            length = (5, 7, 1)

        # Pick the bbox whose text looks most like the target field.
        # Prefer the highest-confidence loose match.
        candidate = None
        best_conf = -1.0
        for bbox, text, conf in raw_results:
            if text and loose.search(str(text)) and conf > best_conf:
                candidate = (bbox, str(text), conf)
                best_conf = conf
        if not candidate:
            return None
        bbox, _, _ = candidate

        # bbox is a list of 4 [x, y] pairs (top-left, top-right, bottom-right,
        # bottom-left). Take the axis-aligned bounding rect with 15% padding
        # to give the recognizer breathing room around the digits.
        try:
            xs = [int(p[0]) for p in bbox]
            ys = [int(p[1]) for p in bbox]
            x1, y1, x2, y2 = min(xs), min(ys), max(xs), max(ys)
            w = x2 - x1
            h = y2 - y1
            pad_x = max(8, int(w * 0.15))
            pad_y = max(8, int(h * 0.30))  # extra vertical padding — digits are short
            H, W = source_img.shape[:2]
            x1c = max(0, x1 - pad_x); y1c = max(0, y1 - pad_y)
            x2c = min(W, x2 + pad_x); y2c = min(H, y2 + pad_y)
            crop = source_img[y1c:y2c, x1c:x2c]
            if crop.size == 0:
                return None
        except Exception:
            return None

        # Upscale the crop further — EasyOCR struggles when the field is
        # tiny. Target 80px tall so each digit is ~50-60px (very legible).
        try:
            ch, cw = crop.shape[:2]
            if ch < 80:
                scale = 80.0 / ch
                crop = cv2.resize(crop, (int(cw * scale), 80),
                                  interpolation=cv2.INTER_CUBIC)
        except Exception:
            pass

        # Run the digit-only pass.
        try:
            refined_raw = FaceEngine._ocr_reader.readtext(
                crop, detail=1, paragraph=False,
                allowlist="0123456789-",
            )
        except Exception:
            return None
        if not refined_raw:
            return None

        # Concatenate the digit tokens we got back, in left-to-right order.
        try:
            tokens = sorted(
                [(min(int(p[0]) for p in box), str(text), conf)
                 for box, text, conf in refined_raw if text],
                key=lambda t: t[0],
            )
        except Exception:
            tokens = [(0, str(t[1]), t[2]) for t in refined_raw if t[1]]
        joined = "".join(t[1] for t in tokens)

        # Strip whitespace and normalise separator runs to a single dash, then
        # try to split into the (2,6,3) or (5,7,1) shape using only the digits.
        digits = re.sub(r"\D", "", joined)
        a, b, c = length
        if len(digits) != a + b + c:
            return None
        canonical = f"{digits[:a]}-{digits[a:a+b]}-{digits[a+b:]}"
        if not strict.match(canonical):
            return None
        return canonical

    @staticmethod
    def _prepare_for_ocr(img: np.ndarray) -> np.ndarray:
        """
        Single-variant preprocessing — returns the "mild" CLAHE+unsharp pass.
        Kept for backwards compat with anyone calling this directly.
        """
        variants = FaceEngine._ocr_variants(img)
        # variants[0] is the mild pass; invoke the factory to materialise it.
        return variants[0][1]() if variants else img

    @staticmethod
    def _ocr_variants(img: np.ndarray):
        """
        Build several preprocessed variants of a frame as **lazy factories** so
        OCR can short-circuit after the first variant that scores well — the
        denoised variant in particular is expensive (fastNlMeans) and is rarely
        needed when the mild pass already nails the read.

        Returns a list of (label, factory) tuples where factory() → np.ndarray.

        Variants (in order tried):
          1. mild       — upscale → CLAHE → unsharp        (cheap; usually enough)
          2. denoised   — upscale → fastNlMeans → CLAHE    (slow; for noisy phones)
          3. binarised  — upscale → adaptive thresh        (good for glossy cards)
          4. raw        — original frame                   (last-ditch fallback)
        """
        try:
            h, w = img.shape[:2]
            target_w = 1280
            if w < target_w:
                scale = target_w / w
                base = cv2.resize(img, (target_w, int(h * scale)),
                                  interpolation=cv2.INTER_CUBIC)
            else:
                base = img
            gray = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY) if base.ndim == 3 else base
        except Exception as e:
            logger.warning("OCR preprocessing failed, using raw frame only: %s", e)
            return [("raw", lambda: img)]

        # Shared CLAHE result — both mild and denoised want it; compute on first use.
        cache: dict = {}

        def _clahe_gray() -> np.ndarray:
            if "clahe" not in cache:
                cache["clahe"] = cv2.createCLAHE(
                    clipLimit=2.5, tileGridSize=(8, 8)
                ).apply(gray)
            return cache["clahe"]

        def make_mild() -> np.ndarray:
            v = _clahe_gray()
            blurred = cv2.GaussianBlur(v, (0, 0), sigmaX=1.0)
            v = cv2.addWeighted(v, 1.5, blurred, -0.5, 0)
            return cv2.cvtColor(v, cv2.COLOR_GRAY2BGR)

        def make_denoised() -> np.ndarray:
            # h=10 kills phone-camera JPEG noise without smearing fine glyphs.
            # This is the slowest of the four variants (~50–150ms on 1280px).
            v = cv2.fastNlMeansDenoising(gray, None, h=10,
                                         templateWindowSize=7,
                                         searchWindowSize=21)
            v = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(v)
            return cv2.cvtColor(v, cv2.COLOR_GRAY2BGR)

        def make_binarised() -> np.ndarray:
            v = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY,
                blockSize=31, C=10,
            )
            return cv2.cvtColor(v, cv2.COLOR_GRAY2BGR)

        return [
            ("mild", make_mild),
            ("denoised", make_denoised),
            ("binarised", make_binarised),
            ("raw", lambda: img),
        ]

    # ── Card field parsing ────────────────────────────────────────────────────

    @staticmethod
    def _parse_card_fields(lines: list[str]) -> dict:
        """
        Extract every structured field we recognise from a list of OCR'd lines.

        Bahria card layout (front):
            BAHRIA UNIVERSITY / LAHORE CAMPUS  (header)
            STUDENT                            (card type banner)
            UMER JAVAID                        (cardholder name)
            Registration:
            Enrollment: 03-134222-110
            Program: BS (CS)
            Issued on  SEP-2022
            Valid upto SEP-2028
            S.No: 36192

        OCR is messy: it joins/splits lines unpredictably and confuses
        dashes with underscores, O with 0, l with 1, etc. We search both
        per-line and the joined string, and tolerate common separator
        misreads in the patterns.
        """
        import re

        SEP = r"[-_~\s\.\,]+"           # anything OCR might emit between digits
        OPT = r"[-_~\s\.\,]*"           # zero or more separators
        DIGIT = r"[0-9OoIlBSsZ]"        # digits + letters OCR commonly swaps in
        joined = " ".join(lines)

        out = {
            "enrollment_number": None,
            "university_id":     None,
            "name":              None,
            "card_type":         None,
            "program":           None,
            "campus":            None,
            "issued_on":         None,
            "valid_upto":        None,
            "serial_no":         None,
        }

        # ── Enrollment number (XX-XXXXXX-XXX) ─────────────────────────
        # Strict-digits first, then permissive (letters that look like digits).
        for digit_class in (r"\d", DIGIT):
            enroll_pat = re.compile(
                rf"({digit_class}{{2}}){SEP}({digit_class}{{6}}){SEP}({digit_class}{{3}})"
            )
            m = enroll_pat.search(joined)
            if m:
                # Normalise: uppercase letters back to digits, single dashes
                raw = "-".join(m.groups()).upper()
                fixed = (raw.replace("O", "0").replace("I", "1").replace("L", "1")
                            .replace("B", "8").replace("S", "5").replace("Z", "2"))
                out["enrollment_number"] = fixed
                break

        # ── Legacy university_id (BU-YYYY-DEPT-NNNN etc.) ─────────────
        long_pat = re.compile(rf"BU{SEP}\d{{4}}{SEP}[A-Z]{{2,4}}{SEP}\d{{3,5}}", re.IGNORECASE)
        short_pat = re.compile(rf"BU{SEP}[A-Z]{{2,4}}{SEP}\d{{3,5}}", re.IGNORECASE)
        other_pat = re.compile(
            rf"(FAC|STF|SEC|ADM){SEP}\d{{4}}{SEP}(?:[A-Z]{{2,4}}{SEP})?\d{{3,5}}",
            re.IGNORECASE,
        )
        for pat in (long_pat, other_pat, short_pat):
            m = pat.search(joined)
            if m:
                raw = m.group().upper()
                out["university_id"] = re.sub(r"[-_~\s\.\,]+", "-", raw).strip("-")
                break

        # ── Card type ─────────────────────────────────────────────────
        ct_pat = re.compile(r"\b(STUDENT|FACULTY|STAFF|ADMIN|EMPLOYEE)\b", re.IGNORECASE)
        m = ct_pat.search(joined)
        if m:
            out["card_type"] = m.group(1).upper()

        # ── Program (e.g. "BS (CS)" / "MS (Software Engineering)") ────
        # Anchor on "Program:" prefix so we don't over-match elsewhere.
        prog_pat = re.compile(
            r"Program\s*[:\.]?\s*([A-Z]{1,3}(?:\.|S)?\s*\([^)]{1,40}\)|[A-Z]{2,3}\s+\([^)]{1,40}\))",
            re.IGNORECASE,
        )
        m = prog_pat.search(joined)
        if m:
            out["program"] = re.sub(r"\s+", " ", m.group(1).strip())

        # ── Campus (e.g. "Lahore Campus", "Karachi Campus") ───────────
        camp_pat = re.compile(r"\b([A-Z][a-zA-Z]+)\s+CAMPUS\b", re.IGNORECASE)
        m = camp_pat.search(joined)
        if m:
            out["campus"] = f"{m.group(1).title()} Campus"

        # ── Issued / Valid dates (MMM-YYYY) ───────────────────────────
        MONTH = r"(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)"
        date_pat = lambda label: re.compile(
            rf"{label}{OPT}{MONTH}{OPT}(\d{{4}})", re.IGNORECASE,
        )
        m = date_pat(r"Issued\s*on").search(joined)
        if m:
            out["issued_on"] = f"{m.group(1).upper()}-{m.group(2)}"
        m = date_pat(r"Valid\s*upto").search(joined)
        if m:
            out["valid_upto"] = f"{m.group(1).upper()}-{m.group(2)}"

        # ── Serial number (S.No: 36192 — also tolerate "S,No", "SNo:", etc.) ─
        sn_pat = re.compile(r"S[\.,;:_~\s]*No[\.,;:_~\s]*(\d{3,8})", re.IGNORECASE)
        m = sn_pat.search(joined)
        if m:
            out["serial_no"] = m.group(1)

        # ── Cardholder name (hardest field) ───────────────────────────
        # Heuristic: look for an all-caps line of 2-4 words that doesn't
        # contain known card-template keywords. Falls back to None.
        # Blocklist contains card-template keywords only — common name tokens
        # like ALI / KHAN / AHMED are NOT blocked (otherwise OCR'd names like
        # "HASSAN ALI" or "MUHAMMAD KHAN" would be silently dropped).
        BLOCK = {
            "BAHRIA", "UNIVERSITY", "CAMPUS", "PAKISTAN", "STUDENT", "FACULTY",
            "STAFF", "ADMIN", "EMPLOYEE", "REGISTRATION", "ENROLLMENT", "PROGRAM",
            "ISSUED", "VALID", "UPTO", "ON", "LAHORE", "KARACHI", "ISLAMABAD",
            "LAHORF", "S.NO", "SNO", "BAHRIAUNIVERSITY", "BS", "MS", "CS", "EE",
            "PHD", "BBA", "MBA",
        }
        name_pat = re.compile(r"^[A-Z][A-Z\s\.\-']{4,40}$")
        for line in lines:
            stripped = line.strip()
            if not name_pat.match(stripped):
                continue
            words = [w.strip(".-'") for w in stripped.split() if w.strip(".-'")]
            if len(words) < 2 or len(words) > 4:
                continue
            if any(w.upper() in BLOCK for w in words):
                continue
            # Looks like a personal name
            out["name"] = stripped
            break

        return out

    # ── User lookup ───────────────────────────────────────────────────────────

    def get_user_info(self, user_id: str) -> Optional[dict]:
        """Fetch user details from Django by UUID."""
        try:
            headers = {"Authorization": f"Bearer {DJANGO_TOKEN}"}
            res = requests.get(f"{DJANGO_API}/users/{user_id}/", headers=headers, timeout=5)
            if res.status_code == 200:
                return res.json()
        except Exception as e:
            logger.warning(f"Could not fetch user {user_id}: {e}")
        return None

    def get_user_by_card(self, card_id: str) -> Optional[dict]:
        """
        Fetch a user by card identifier.

        Tries `enrollment_number` first (the real printed ID like 03-134222-110)
        then falls back to `university_id` (auto-generated like BU-2026-CS-1234)
        so this works for both card-issued users and legacy seed data.

        Calls Django's /users/lookup-card/ which is gated by INTERNAL_SERVICE_TOKEN.
        """
        if not card_id:
            return None
        headers = {"X-Internal-Token": INTERNAL_TOKEN}

        for param in ("enrollment_number", "university_id"):
            try:
                res = requests.get(
                    f"{DJANGO_API}/users/lookup-card/",
                    params={param: card_id},
                    headers=headers,
                    timeout=5,
                )
                if res.status_code == 200:
                    return res.json()
                if res.status_code != 404:
                    logger.warning("Lookup by %s=%s returned %s", param, card_id, res.status_code)
            except Exception as e:
                logger.warning("Lookup by %s=%s failed: %s", param, card_id, e)
        return None

    # ── Quality & enrollment ──────────────────────────────────────────────────

    def assess_frame_quality(self, img: np.ndarray) -> dict:
        """
        Score a single frame for enrollment fitness. Returns:
          - face_detected: bool
          - face_count: int (must be 1 for enrollment)
          - face_size_ratio: float (face area / frame area)
          - sharpness: float (Laplacian variance, higher is sharper)
          - brightness: float (0-255 mean grayscale)
          - composite_score: float (0.0–1.0)
          - issues: list of human-readable problems
        """
        h, w = img.shape[:2]
        result = {
            "face_detected": False, "face_count": 0,
            "face_size_ratio": 0.0, "sharpness": 0.0, "brightness": 0.0,
            "composite_score": 0.0, "issues": [],
        }

        if self._face_app is None:
            result["issues"].append("Face engine not loaded")
            return result

        faces = self._face_app.get(img)
        result["face_count"] = len(faces)

        if not faces:
            result["issues"].append("No face detected")
            return result
        if len(faces) > 1:
            result["issues"].append(f"Multiple faces detected ({len(faces)}) — only one person allowed")
            return result

        face = faces[0]
        result["face_detected"] = True
        bbox = face.bbox
        face_area = max(0, (bbox[2] - bbox[0])) * max(0, (bbox[3] - bbox[1]))
        result["face_size_ratio"] = float(face_area / (w * h))

        # Sharpness via Laplacian variance on the face crop
        x1, y1, x2, y2 = [int(max(0, v)) for v in bbox]
        crop = img[y1:y2, x1:x2]
        if crop.size > 0:
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            result["sharpness"] = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            result["brightness"] = float(gray.mean())

        # Moderate-mode quality gates (neither strict nor relaxed)
        if result["face_size_ratio"] < 0.05:
            result["issues"].append("Face too small — move closer")
        elif result["face_size_ratio"] > 0.8:
            result["issues"].append("Face too close — step back")

        if result["sharpness"] < 40:
            result["issues"].append("Image too blurry — hold still")

        if result["brightness"] < 50:
            result["issues"].append("Too dark — improve lighting")
        elif result["brightness"] > 220:
            result["issues"].append("Too bright / overexposed")

        # Composite score: 0.0–1.0
        # Normalised contributions: size (target ~0.15), sharpness (target ~150), brightness (target ~120)
        size_score = min(1.0, result["face_size_ratio"] / 0.15)
        sharp_score = min(1.0, result["sharpness"] / 150.0)
        bright_score = 1.0 - abs(result["brightness"] - 120) / 120.0
        bright_score = max(0.0, min(1.0, bright_score))
        result["composite_score"] = float((size_score * 0.4 + sharp_score * 0.4 + bright_score * 0.2))

        return result

    def enroll_from_frames(self, frames: List[np.ndarray]) -> dict:
        """
        Run the full enrollment pipeline on multiple frames.

        For each frame:
          1. Quality assessment (must pass moderate gate)
          2. Liveness check (anti-spoof)
          3. Embedding extraction

        Then averages embeddings → returns final result dict ready for the
        Django API to store as a FaceEnrollment row.

        Raises ValueError if fewer than 3 frames pass all checks.
        """
        if self._face_app is None:
            raise RuntimeError("Face engine not loaded — cannot enroll")

        accepted_embeddings: List[np.ndarray] = []
        accepted_qualities: List[float] = []
        rejected_frames: List[dict] = []
        liveness_results: List[bool] = []

        for idx, img in enumerate(frames):
            quality = self.assess_frame_quality(img)
            if not quality["face_detected"] or quality["issues"]:
                rejected_frames.append({"frame_index": idx, "reason": quality["issues"] or ["No face"]})
                continue

            # Liveness — enforced at enrollment per policy
            live = self.check_liveness(img)
            liveness_results.append(live)
            if not live:
                rejected_frames.append({"frame_index": idx, "reason": ["Liveness check failed (possible spoof)"]})
                continue

            embedding = self.get_face_encoding(img)
            if embedding is None:
                rejected_frames.append({"frame_index": idx, "reason": ["Embedding extraction failed"]})
                continue

            accepted_embeddings.append(embedding)
            accepted_qualities.append(quality["composite_score"])

        if len(accepted_embeddings) < 3:
            raise ValueError(
                f"Only {len(accepted_embeddings)} of {len(frames)} frames passed quality + liveness checks. "
                f"Need at least 3. Issues: {rejected_frames}"
            )

        # Average + L2-normalise (so cosine similarity at gate is consistent)
        averaged = np.mean(accepted_embeddings, axis=0)
        averaged = averaged / np.linalg.norm(averaged)
        averaged = averaged.astype(np.float32)

        avg_quality = float(np.mean(accepted_qualities))
        if avg_quality >= 0.75:
            grade = "EXCELLENT"
        elif avg_quality >= 0.55:
            grade = "GOOD"
        else:
            grade = "ACCEPTABLE"

        return {
            "embedding": averaged.tobytes().hex(),
            "frame_embeddings": [e.astype(np.float32).tobytes().hex() for e in accepted_embeddings],
            "frame_count": len(accepted_embeddings),
            "quality_score": avg_quality,
            "quality_grade": grade,
            "liveness_passed": all(liveness_results) if liveness_results else False,
            "rejected_frames": rejected_frames,
        }
