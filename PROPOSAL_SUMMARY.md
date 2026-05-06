# 📋 FYP Proposal Summary — Paste me at the start of any conversation

**Project**: AI-Based Campus Security System
**University**: Bahria University (Final Year Project)
**One-line pitch**: Multi-modal AI gate access control replacing manual ID checks and fingerprint attendance.

## Problem
Manual gate guards + fingerprint attendance are slow, error-prone, and bypassable (fake/borrowed cards, impersonation). Parents have no real-time visibility of student presence.

## Solution
A unified gate-side prototype combining: **face recognition + iris scan fallback + university card scan + CNIC scan for visitors**, all cross-checked against a central database, with real-time logging, parent SMS, and a multi-role web portal.

## Core Tech Stack (locked by proposal)
- **Face recognition**: InsightFace (ArcFace embeddings) + anti-spoofing (blink/skin-texture liveness)
- **Iris/retina**: USB scanner + Iris ID iCAM SDK (fallback for veiled/masked individuals)
- **Card scan**: QR/barcode (NOT RFID) — OpenCV + ZBar, decoded from camera feed
- **CNIC**: Tesseract OCR or Google Vision API
- **Database**: PostgreSQL (face embeddings, retina data, card data, access logs)
- **Backend**: FastAPI (Python) + JWT role-based auth
- **Frontend**: React.js multi-role portal
- **Notifications**: Firebase FCM (push) + Twilio SMS (parent alerts)
- **Edge**: Intel NUC for on-device AI inference; 2× IP cameras (1080p, IR)

## Roles in the portal
Student, Faculty, Parent, HR, Security, Admin, Director (+ Visitor for temporary CNIC entries).

## Required workflows
1. **Face recognition at gate** → match → log entry/exit → SMS parent (if student)
2. **Iris fallback** when face fails (mask/veil)
3. **Card scan** (QR/barcode) for cross-validation
4. **CNIC scan** for visitors → optional criminal record check
5. **Anti-spoofing** liveness check before any face decision
6. **Real-time dashboards** per role (entry/exit logs, attendance, events)

## Hardware Deliverables (BOM)
- 2× IP cameras (PKR 20k) — face + card OCR
- Intel NUC edge computer (PKR 20k)
- USB retina scanner (PKR 15k)
- Mounting frame (PKR 5k)
- API budget for Twilio + Google Vision (PKR 3k)

## Novelty Claim (vs. other Bahria FYPs)
Combines **face + iris + card + CNIC + real-time parent SMS + multi-role portal** in a single unified system. No other Bahria FYP integrates all five.

## Optional Scope (nice-to-have)
- Event payment integration (digital paid passes)
- CNIC criminal-record cross-check

## Build Order
1. ✅ Phase 1 — Face enrollment (admin-controlled, 5-pose, audit-trailed) — **DONE**
2. 🔜 Phase 2 — Gate face verification (recognition + entry log + audit)
3. 🔜 Phase 3 — Twilio SMS for parents on student entry/exit
4. 🔜 Phase 4 — QR/barcode card scan (OpenCV + ZBar)
5. 🔜 Phase 5 — CNIC OCR (Tesseract first, Google Vision optional)
6. 🔜 Phase 6 — Firebase FCM push notifications
7. 🔜 Phase 7 — Hardware integration (when IP cams + NUC + retina arrive)

## Key Constraints
- **Production-ready quality** ("professional and ready to sell")
- **Audit-friendly**: never hard-delete enrollments; soft-delete with reason codes
- **Admin-only enrollment** (face capture is privileged, biometric PII)
- **PostgreSQL is the single source of truth** for all biometric data
- **Hardware-agnostic FastAPI design** — the laptop webcam today will be an IP camera tomorrow without code changes
- **Liveness enforced at enrollment** (dev pass-through is tolerated only at verify, must be hardened before demo)
