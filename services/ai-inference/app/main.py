"""
FaceVec AI inference service.

A stateless compute service: it extracts 512-dim face embeddings via InsightFace
and never touches the database — the gateway orchestrates persistence and the
pgvector search. The model is loaded once at startup; `/ready` reports whether it
has finished loading.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from .config import get_settings
from .face_engine import FaceEngine, ImageDecodeError
from .logging_config import configure_logging, get_logger
from .routers import embeddings
from .schemas import HealthResponse

settings = get_settings()
configure_logging(settings.log_level)
log = get_logger(settings.service_name)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Load the face-analysis model before the service accepts traffic."""
    engine = FaceEngine(settings)
    app.state.engine = engine
    log.info("loading_model", model=settings.insightface_model_name)
    await run_in_threadpool(engine.load)
    log.info("model_loaded", model=settings.insightface_model_name)
    yield


app = FastAPI(
    title="FaceVec AI Inference",
    version="0.2.0",
    description="Stateless facial embedding extraction (InsightFace).",
    lifespan=lifespan,
)

app.include_router(embeddings.router)


@app.exception_handler(ImageDecodeError)
async def _image_decode_handler(_request: Request, exc: ImageDecodeError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": str(exc)},
    )


@app.get("/health", response_model=HealthResponse, tags=["observability"])
async def health() -> HealthResponse:
    """Liveness: the process is up and serving."""
    return HealthResponse(
        status="ok",
        service=settings.service_name,
        ts=datetime.now(timezone.utc).isoformat(),
    )


@app.get("/ready", tags=["observability"])
async def ready(request: Request) -> JSONResponse:
    """Readiness: the InsightFace model has finished loading."""
    engine: FaceEngine | None = getattr(request.app.state, "engine", None)
    loaded = engine is not None and engine.ready
    return JSONResponse(
        status_code=status.HTTP_200_OK if loaded else status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "status": "ready" if loaded else "loading",
            "service": settings.service_name,
            "model_loaded": loaded,
        },
    )
