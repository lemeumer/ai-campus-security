# Firebase Cloud Messaging Setup Guide

## Phase 6: Real-Time Push Notifications

This guide explains how to set up Firebase Cloud Messaging (FCM) for the campus security system. FCM enables real-time push notifications to:

- **Security staff**: Campus access events, denial alerts, suspicious activity
- **Admins**: Enrollment completions, system alerts, gate events
- **Parents**: Student entry/exit notifications

---

## Overview

When a user logs in or an event occurs at the gate, the system sends push notifications to subscribed devices:

```
┌─────────────────┐
│   Gate Entry    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Django Backend                     │
│  - Verifies user                    │
│  - Sends FCM notification           │
│  - Logs gate entry to PostgreSQL    │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Firebase Cloud Messaging (Google)  │
│  - Routes notification to devices   │
│  - Handles delivery, retry, TTL     │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  User's Browser / Mobile Device     │
│  - Receives push (foreground toast) │
│  - Shows notification (background)  │
│  - Navigates on click               │
└─────────────────────────────────────┘
```

---

## Step 1: Create a Firebase Project

1. **Go to Firebase Console**: https://console.firebase.google.com/
2. **Sign in** with your Google account (or create one)
3. **Create a new project**:
   - Name: "Campus Security" (or similar)
   - Accept terms and create
4. **Enable Firestore** (optional, for future data sync)

---

## Step 2: Create a Service Account Key

The Django backend needs a service account key to authenticate with Firebase.

### In Firebase Console:

1. Go to **Project Settings** (gear icon, top-right)
2. Click **Service Accounts** tab
3. Select **Python** from the SDK snippet dropdown
4. Click **Generate New Private Key**
5. Save the downloaded JSON file to a secure location

The file will look like:

```json
{
  "type": "service_account",
  "project_id": "campus-security-xxxxx",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@campus-security-xxxxx.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

---

## Step 3: Set Up Django Backend

### Install Firebase Admin SDK:

```bash
cd "C:\Users\Hp\Desktop\.vs\FYP folder\auth_module\venv1\Scripts"
activate
pip install firebase-admin
```

### Add Environment Variables to `.env`:

```env
# ── Firebase Cloud Messaging (Phase 6) ────────────────────────────────
FIREBASE_ENABLED=true
FIREBASE_CREDENTIALS_PATH=<path-to-service-account-json>
FIREBASE_PROJECT_ID=campus-security-xxxxx
```

### Example `.env` entry:

```env
FIREBASE_ENABLED=true
FIREBASE_CREDENTIALS_PATH=C:\Users\Hp\Desktop\.vs\FYP folder\config\firebase-service-account.json
FIREBASE_PROJECT_ID=campus-security-demo
```

### Place the Service Account JSON:

Copy the service account JSON file to a secure location in your project (not git-tracked):

```
C:\Users\Hp\Desktop\.vs\FYP folder\
├── config/
│   └── firebase-service-account.json  (in .gitignore)
└── .env  (updated with path)
```

---

## Step 4: Configure React Frontend

### Get Web Config from Firebase:

1. In **Firebase Console**, go to **Project Settings** > **General**
2. Scroll down to **Your apps** section
3. Click the web icon to create a web app (if you don't have one)
4. Copy the Firebase config object

### Create `.env.local` in frontend:

```env
VITE_FIREBASE_API_KEY=xxxxx
VITE_FIREBASE_AUTH_DOMAIN=campus-security-xxxxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=campus-security-xxxxx
VITE_FIREBASE_STORAGE_BUCKET=campus-security-xxxxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
VITE_FIREBASE_VAPID_KEY=<your-vapid-key>
```

### Get VAPID Key:

1. In **Firebase Console**, go to **Messaging** > **Cloud Messaging** tab
2. Scroll to **Web configuration**
3. Under **Web Push certificates**, click **Generate key pair**
4. Copy the **public key** and paste it in `.env.local` as `VITE_FIREBASE_VAPID_KEY`

---

## Step 5: Create Web App in Firebase (if needed)

If your project doesn't have a web app yet:

1. In **Firebase Console**, click **Create app**
2. Choose **Web** platform
3. Register app with name (e.g., "Campus Security Web")
4. Copy the config snippet
5. Use the values to populate `.env.local`

---

## Step 6: Test the Setup

### Start the full stack (3 terminals):

**Terminal 1 — Django Backend:**
```bash
cd "C:\Users\Hp\Desktop\.vs\FYP folder"
auth_module\venv1\Scripts\activate
python -m django runserver 8000 --settings=fyp_backend.settings
```

**Terminal 2 — FastAPI Face Service:**
```bash
cd "C:\Users\Hp\Desktop\.vs\FYP folder\face detection"
venv\Scripts\activate
python api_server.py
```

**Terminal 3 — React Frontend:**
```bash
cd "C:\Users\Hp\Desktop\.vs\FYP folder\frontend"
npm run dev
```

### Test Notifications:

1. **Open browser**: http://localhost:5173/
2. **Login** with any user (admin: `umerjavaid5845@gmail.com`)
3. **Allow notifications** when prompted
4. **Open Security Dashboard** and perform a gate entry
5. **Check for push notification** — you should see a toast notification

### Check Django Console:

You'll see logs like:
```
[Firebase] Initialized successfully
[FCM] Sent to topic "admin/gate": message_id_xyz
[FCM-DEV] Device: ... (if Firebase not configured)
```

---

## Step 7: Testing Without Firebase Credentials

If you don't have Firebase set up yet, the system **gracefully degrades**:

- **Backend**: Logs notifications to console instead of sending via FCM
- **Frontend**: Requests permission but doesn't register device token
- **Gate entries**: Still work normally; admins just don't get push notifications

This means you can demo the entire system without Firebase credentials.

To enable dev-mode logging, either:
1. Leave `FIREBASE_ENABLED=false` in `.env`, or
2. Leave `FIREBASE_CREDENTIALS_PATH` empty

---

## Admin Control Panel

After setup, admins can:

1. **Go to `/admin/logs`** → Filter for "enrollment", "gate" events
2. **Check notification delivery** via the audit log
3. **Manually test SMS/FCM** via `/admin/test-sms/` endpoint

---

## Troubleshooting

### Django says "firebase_admin not found"

```bash
pip install firebase-admin
```

### Service account JSON not found

Check `FIREBASE_CREDENTIALS_PATH` in `.env` — use an absolute path.

### Browser console shows "[Firebase] Initialization failed"

- Verify `VITE_FIREBASE_*` env vars in `.env.local`
- Make sure values match your Firebase project
- Check that service worker file exists at `/firebase-messaging-sw.js`

### Notifications aren't being delivered

1. Check **Firebase Cloud Messaging** settings in console
2. Verify **Web Push certificates** are valid
3. Ensure service worker is registered (`chrome://serviceworker-internals/`)
4. Check browser notification permission: **Settings > Privacy > Notifications** > allow localhost

### "Notification permission denied"

Users can re-enable notifications in browser settings:
- **Chrome**: Settings > Privacy > Notifications > localhost > Allow

---

## Architecture

### Backend Flow:

```python
# When gate entry succeeds:
from notifications_fcm import send_gate_entry_notification

send_gate_entry_notification(
    user=target_user,
    entry_type='ENTRY',
    method='BIOMETRIC',
    when=now,
)

# Sends to:
# - topic "admin/gate" → all admins + security
# - topic "parent/student/{id}" → student's parents
```

### Frontend Flow:

```javascript
// 1. On login:
const token = await registerDeviceToken()  // Get FCM token from browser
await sendDeviceTokenToBackend(token)      // Register with Django

// 2. Background messages:
// Service worker handles and shows notification

// 3. Foreground messages:
// useFirebaseNotifications hook shows toast
```

---

## Production Checklist

Before deploying to production:

- [ ] Generate new service account key (don't commit existing key)
- [ ] Set `FIREBASE_ENABLED=true` in production `.env`
- [ ] Use absolute path for `FIREBASE_CREDENTIALS_PATH`
- [ ] Test push notifications with real users
- [ ] Monitor Firebase quota (`Free tier: 10,000 messages/day`)
- [ ] Set up Firebase logging/alerts in console
- [ ] Document VAPID key rotation process

---

## Costs

**Firebase Cloud Messaging is FREE** for:
- Up to 10,000 messages per day
- Device token registration
- All push notification features

For the FYP demo with ~100 users doing ~1000 gate entries/day, you'll stay well within the free tier.

---

## References

- [Firebase Admin SDK (Python)](https://firebase.google.com/docs/admin/setup)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [Web Push with FCM](https://firebase.google.com/docs/cloud-messaging/js/client-setup)
