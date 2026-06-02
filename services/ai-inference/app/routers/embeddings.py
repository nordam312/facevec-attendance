"""Embedding extraction endpoint."""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool

from ..config import get_settings
from ..face_engine import FaceEngine, ImageDecodeError, decode_image
from ..schemas import EmbeddingResponse

router = APIRouter(prefix="/v1", tags=["inference"])


def _require_engine(request: Request) -> FaceEngine:
    engine: FaceEngine = request.app.state.engine
    if not engine.ready:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "model is still loading")
    return engine


@router.post("/embeddings", response_model=EmbeddingResponse)
async def create_embeddings(
    request: Request,
    file: UploadFile = File(..., description="An image/* file containing one or more faces"),
) -> EmbeddingResponse:
    """Detect faces in the uploaded image and return their 512-d embeddings."""
    settings = get_settings()

    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "expected an image/* upload",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "empty upload")
    if len(data) > settings.max_image_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"image exceeds {settings.max_image_bytes} bytes",
        )

    engine = _require_engine(request)

    try:
        image = decode_image(data)
    except ImageDecodeError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    # CPU-bound inference must not block the event loop.
    faces = await run_in_threadpool(engine.extract, image)

    return EmbeddingResponse(
        model=settings.insightface_model_name,
        dimensions=settings.embedding_dimensions,
        face_count=len(faces),
        faces=faces,
        primary=faces[0] if faces else None,
    )
