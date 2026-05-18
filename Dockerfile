# =============================================================================
# Accounting Tool — Backend Dockerfile
# Multi-stage build: dependency install → slim runtime image
# =============================================================================

FROM python:3.12-slim AS base

WORKDIR /app

# System dependencies for bcrypt and cryptography
RUN apt-get update && apt-get install -y --no-install-recommends \
    libffi-dev \
    libssl-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Dependency stage — install Python packages into a separate layer
# ---------------------------------------------------------------------------
FROM base AS deps

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# ---------------------------------------------------------------------------
# Runtime stage
# ---------------------------------------------------------------------------
FROM base AS runtime

# Copy installed packages from deps stage
COPY --from=deps /usr/local/lib/python3.12 /usr/local/lib/python3.12
COPY --from=deps /usr/local/bin /usr/local/bin

# Non-root user for security
RUN useradd --create-home --shell /bin/bash appuser
USER appuser

WORKDIR /app

COPY --chown=appuser:appuser . .

EXPOSE 8000

# Healthcheck — Docker will mark container unhealthy if /health fails
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

# Run migrations then start the server
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
