# syntax=docker/dockerfile:1.7
# =============================================================================
# Multi-stage build for the FastAPI AI inference service.
#   builder -> compile/install the ML stack and bake the buffalo_l model pack
#   runtime -> slim image with the venv + model + system libs OpenCV needs
# InsightFace 0.7.3 has a Cython build step, so the builder needs a toolchain;
# the model (~280 MB) is downloaded at build time so the container never needs
# network access at runtime.
# =============================================================================
ARG PYTHON_VERSION=3.12-slim

# ---- builder ----------------------------------------------------------------
FROM python:${PYTHON_VERSION} AS builder
ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    INSIGHTFACE_MODEL_ROOT=/models
WORKDIR /app

# Toolchain + OpenCV runtime libs (needed to import cv2 during the model bake).
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential cmake libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt ./
# Python 3.12 venvs no longer bootstrap setuptools, and `--no-build-isolation`
# uses the venv's build backend — so install setuptools/wheel (plus numpy +
# Cython for InsightFace's Cython extension) before building from sdist.
RUN pip install --upgrade pip setuptools wheel \
 && pip install numpy==1.26.4 Cython \
 && pip install --no-build-isolation -r requirements.txt

# Pre-download the model pack into the image (no runtime network dependency).
RUN python -c "from insightface.app import FaceAnalysis; \
app = FaceAnalysis(name='buffalo_l', root='/models', providers=['CPUExecutionProvider']); \
app.prepare(ctx_id=-1, det_size=(640, 640))"

# ---- runtime ----------------------------------------------------------------
FROM python:${PYTHON_VERSION} AS runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    INSIGHTFACE_MODEL_ROOT=/models
WORKDIR /app

# Native libraries required by OpenCV at runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

RUN groupadd -r app && useradd -r -g app -d /app app

COPY --from=builder /opt/venv /opt/venv
COPY --from=builder --chown=app:app /models /models
COPY app ./app

USER app
EXPOSE 8000

# Generous start period: the model loads into memory before /health passes.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD python -c "import urllib.request as u, sys; sys.exit(0 if u.urlopen('http://127.0.0.1:8000/health').status == 200 else 1)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
