# Deploy Django Backend to Render

## Quick Start (5 minutes)

### 1. Connect GitHub to Render
1. Go to https://render.com
2. Sign up or log in
3. Click **"New +"** → **"Web Service"**
4. Select **"Connect a repository"**
5. Authorize Render to access your GitHub
6. Select `ai-campus-security` repo

### 2. Configure the Web Service
- **Name:** `fyp-django-backend`
- **Runtime:** Python 3.9
- **Build Command:** 
  ```
  pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate --noinput
  ```
- **Start Command:** 
  ```
  gunicorn fyp_backend.wsgi:application --bind 0.0.0.0:$PORT
  ```

### 3. Add Environment Variables
Click **"Environment"** and add:

| Key | Value |
|-----|-------|
| `DEBUG` | `false` |
| `ALLOWED_HOSTS` | `*.onrender.com` |
| `DATABASE_NAME` | `postgres` |
| `DATABASE_USER` | `postgres` |
| `DATABASE_PASSWORD` | `nahibataunga` |
| `DATABASE_HOST` | `db.ukyouxpohohlcyecbmxn.supabase.co` |
| `DATABASE_PORT` | `5432` |
| `FRONTEND_URL` | `https://ai-campus-security.vercel.app` |
| `FACE_SERVICE_URL` | `https://lemeumer-fyp-faceapi.hf.space` |
| `INTERNAL_SERVICE_TOKEN` | `dev-internal-token-change-me-in-prod` |
| `EMAIL_HOST_USER` | `umerjavaid5845@gmail.com` |
| `EMAIL_HOST_PASSWORD` | `vxatsadoqjfnozjf` |
| `FIREBASE_ENABLED` | `true` |
| `FIREBASE_PROJECT_ID` | `fyp-project-bd5b0` |
| `FIREBASE_CREDENTIALS_PATH` | `/etc/secrets/firebase-service-account.json` |

### 4. Deploy
- Click **"Create Web Service"**
- Wait for build to complete (2-5 minutes)
- Note your Render URL: `https://fyp-django-backend.onrender.com`

---

## After Deployment

Once Django is live on Render:

### 1. Update Vercel Frontend
Go to Vercel dashboard → Settings → Environment Variables

Add: `VITE_API_URL = https://fyp-django-backend.onrender.com`

Redeploy or wait for automatic redeploy.

### 2. Update HF Spaces FastAPI (if needed)
If HF Space is still on localhost in `FACE_SERVICE_URL`, run migrations:
```bash
python manage.py migrate
```

### 3. Verify All Services
- Frontend: https://ai-campus-security.vercel.app
- Backend: https://fyp-django-backend.onrender.com/api/auth/profile/
- FastAPI: https://lemeumer-fyp-faceapi.hf.space/docs

---

## Troubleshooting

**Build fails with "psycopg2"?**
- Render has psycopg2-binary in requirements.txt ✓

**Database connection error?**
- Check DATABASE_* env vars match Supabase exactly
- Verify Supabase is accessible from Render (it is)

**500 errors?**
- Check Render logs: Dashboard → Logs
- Look for migration errors

**Frontend still doesn't work?**
- Make sure VITE_API_URL is set in Vercel
- Clear browser cache and redeploy Vercel
