FROM python:3.9-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY manage.py ./
COPY fyp_backend/ ./fyp_backend/
COPY auth_module/ ./auth_module/
COPY templates/ ./templates/

RUN python manage.py collectstatic --noinput || true

EXPOSE 7860

CMD sh -c "python manage.py migrate --noinput && gunicorn fyp_backend.wsgi:application --bind 0.0.0.0:${PORT:-7860} --workers 2 --timeout 120"
