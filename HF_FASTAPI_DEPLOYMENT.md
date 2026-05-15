# Deploy FastAPI Face Engine to Hugging Face Spaces

The FastAPI face recognition + OCR engine runs on the HF Space at
`lemeumer/fyp-faceapi` (https://lemeumer-fyp-faceapi.hf.space).

## Initial setup

1. Create a Docker Space on https://huggingface.co/new-space:
   - Name: `fyp-faceapi`
   - SDK: **Docker → Blank**
   - Hardware: CPU basic (free)

2. Add the Space as a git remote in this repo:
   ```
   git remote add huggingface https://huggingface.co/spaces/lemeumer/fyp-faceapi
   ```

3. Push this repo to the Space (use the same orphan-branch dance as
   `HF_DJANGO_DEPLOYMENT.md` if the HF Space's history would reject the
   push because of historical binary files).

## Required files at the Space's repo root

HF Spaces detects a Docker app by looking for `README.md` (with YAML
frontmatter declaring `sdk: docker`) and `Dockerfile` at the repo root.
The actual face engine code lives in `face detection/`. To bridge them,
the Space's root has:

### `README.md`

```yaml
---
title: FYP Face API
emoji: 🤖
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# FYP Face API

FastAPI face recognition + OCR engine for the AI Campus Security FYP backend.
```

### `Dockerfile` (wrapper that builds from `face detection/`)

```dockerfile
FROM python:3.9-slim

# System libs required by OpenCV and insightface
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    build-essential \
    cmake \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ["face detection/requirements.txt", "./requirements.txt"]
RUN pip install --no-cache-dir -r requirements.txt

COPY ["face detection/", "./"]

EXPOSE 7860

CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "7860"]
```

Both files are kept in this doc rather than at the repo root because the
root `Dockerfile` in this repo is reserved for the Django Space. To deploy
the FastAPI Space, create these two files directly on the Space (via web
UI or by pushing them to an orphan branch).

## Required env vars (Space → Settings → Variables and secrets)

| Key | Value |
|---|---|
| `INTERNAL_SERVICE_TOKEN` | *(same long random string set in the Django Space)* |
| `DJANGO_API_URL` | `https://lemeumer-fyp-django-backend.hf.space` |

## Notes

- First container boot downloads InsightFace's `buffalo_l` models
  (~280 MB) into `/root/.insightface/`. Stored in the image after the
  first boot, not re-downloaded on warm starts.
- EasyOCR downloads its own models (~80 MB) the first time it's invoked.
- HF Space sleeps after ~48 h idle and wipes `/app/media/` on wake; the
  face encoding cache rebuilds itself from Django via `sync-add` calls.
