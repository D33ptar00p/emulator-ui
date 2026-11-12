# Emulator UI: FastAPI backend + compiled React UI, one process on :8080.
# Build context is the repo root:  docker build -f docker/console.Dockerfile -t emulator-ui .
FROM node:22.11.0-alpine3.20 AS web
WORKDIR /ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY ui/ ./
RUN npx tsc -b && npx vite build --outDir /out --emptyOutDir

FROM python:3.12.7-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    EMULATOR_UI_STATIC=/app/static
WORKDIR /app
COPY pyproject.toml LICENSE NOTICE ./
COPY src/ ./src/
RUN pip install .
COPY --from=web /out /app/static
USER 1000
EXPOSE 8080
# Listens on all interfaces *inside* the shared network namespace; the host side is
# published on 127.0.0.1 only (see scripts/emulator-up.sh).
CMD ["uvicorn", "emulator_ui.app:app", "--host", "0.0.0.0", "--port", "8080", "--no-server-header"]
