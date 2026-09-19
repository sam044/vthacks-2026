FROM node:24-bookworm-slim AS frontend
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000 HOKIECARE_STATIC_DIR=/app/static
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home hokiecare
COPY backend/hokiecare ./hokiecare
COPY --from=frontend /web/dist ./static
USER hokiecare
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/api/health',timeout=4)"
CMD ["sh", "-c", "exec uvicorn hokiecare.app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --no-access-log"]
