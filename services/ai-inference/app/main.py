"""
Phase 0 bootstrap for the AI inference service.

Exposes liveness (`/health`) and readiness (`/ready`) probes so the container is
observable from the first phase. Phase 4 adds the InsightFace model loader, the
512-dim embedding extraction endpoint, and upgrades `/ready` to report whether
the face-analysis model has finished loading.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.responses import JSONResponse

SERVICE = "ai-inference"

app = FastAPI(
    title="FaceVec AI Inference",
    version="0.1.0",
    description="Facial geometry processing and 512-dim embedding extraction.",
)


@app.get("/health", tags=["observability"])
async def health() -> JSONResponse:
    """Liveness: the process is up and serving."""
    return JSONResponse(
        {
            "status": "ok",
            "service": SERVICE,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
    )


@app.get("/ready", tags=["observability"])
async def ready() -> JSONResponse:
    """Readiness: dependencies are reachable. Extended with model-load + DB checks in Phase 4."""
    return JSONResponse({"status": "ready", "service": SERVICE})
