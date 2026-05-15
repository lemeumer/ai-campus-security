# Deploy Django Backend to Hugging Face Spaces

This deploys `fyp_backend` (Django + DRF) to a new HF Space as a Docker app,
mirroring the pattern already used for the FastAPI face engine
(`lemeumer/fyp-faceapi`).

## 1. Create the Space on huggingface.co

1. Go to https://huggingface.co/new-space
2. **Owner:** `lemeumer`
3. **Space name:** `fyp-django-backend`
4. **License:** `mit`
5. **SDK:** **Docker** → **Blank**
6. **Hardware:** CPU basic (free)
7. **Visibility:** Public
8. Click **Create Space**

The Space URL will be: `https://lemeumer-fyp-django-backend.hf.space`

## 2. Add the Space as a git remote

From the repo root on your machine (PowerShell):

```
git remote add hf-django https://huggingface.co/spaces/lemeumer/fyp-django-backend
```

If `git push hf-django main` asks for credentials, use your HF username and
an **access token** (not your password) — generate one at
https://huggingface.co/settings/tokens with **write** scope.

## 3. Push the repo

```
git push hf-django main
```

HF will detect `Dockerfile` at the repo root and start building. First build
takes ~3–5 minutes.

## 4. Set environment variables in the Space

HF Space → **Settings** → **Variables and secrets** → add these as **Secrets**
(not Variables — secrets are encrypted at rest):

| Key | Value |
|---|---|
| `DEBUG` | `false` |
| `ALLOWED_HOSTS` | `lemeumer-fyp-django-backend.hf.space,.hf.space` |
| `SECRET_KEY` | *(generate a fresh 50+ char random string)* |
| `DATABASE_NAME` | `postgres` |
| `DATABASE_USER` | `postgres` |
| `DATABASE_PASSWORD` | `nahibataunga` |
| `DATABASE_HOST` | `db.ukyouxpohohlcyecbmxn.supabase.co` |
| `DATABASE_PORT` | `5432` |
| `FRONTEND_URL` | `https://ai-campus-security.vercel.app` |
| `FACE_SERVICE_URL` | `https://lemeumer-fyp-faceapi.hf.space` |
| `INTERNAL_SERVICE_TOKEN` | *(same long random string you set in the FastAPI Space)* |
| `EMAIL_HOST_USER` | `umerjavaid5845@gmail.com` |
| `EMAIL_HOST_PASSWORD` | `vxatsadoqjfnozjf` |
| `FIREBASE_ENABLED` | `false` |
| `FIREBASE_PROJECT_ID` | `fyp-project-bd5b0` |

After saving secrets, click **Factory rebuild** to apply them.

## 5. Wire the frontend

In Vercel → Project → Settings → Environment Variables:

- `VITE_API_URL` → `https://lemeumer-fyp-django-backend.hf.space`

Then click **Redeploy** in Vercel.

## 6. Verify

- Backend health: `https://lemeumer-fyp-django-backend.hf.space/api/auth/profile/` → should return **401 Unauthorized** (this is the expected state when called without a token; a 500 means something is broken).
- HF Space **Logs** tab shows gunicorn startup, then migrate output. Watch for "Listening at" → success.

## Troubleshooting

- **Build fails on `pip install psycopg2`**: requirements.txt uses `psycopg2-binary`, which doesn't need libpq-dev at build time. If you still see a build error, share the last 30 lines of the build log.
- **App boots but every request returns 400 / DisallowedHost**: `ALLOWED_HOSTS` env var is missing or doesn't include the Space's hostname.
- **DB connection refused**: Check `DATABASE_HOST` matches Supabase dashboard exactly. Supabase pauses inactive free projects after 1 week — un-pause it from the dashboard.
- **CSRF errors from Vercel frontend**: confirm `https://ai-campus-security.vercel.app` is in `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` in `fyp_backend/settings.py`.
