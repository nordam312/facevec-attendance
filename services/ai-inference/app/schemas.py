"""Pydantic response models for the inference API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class DetectedFace(BaseModel):
    """A single detected face and its embedding."""

    embedding: list[float] = Field(..., description="L2-normalised face embedding")
    bbox: list[float] = Field(..., description="Bounding box [x1, y1, x2, y2]")
    det_score: float = Field(..., description="Detector confidence in [0, 1]")
    area: float = Field(..., description="Bounding-box area in pixels")


class EmbeddingResponse(BaseModel):
    """Result of extracting embeddings from one image."""

    model: str
    dimensions: int
    face_count: int
    faces: list[DetectedFace]
    # The largest detected face, for the common single-subject case.
    primary: DetectedFace | None = None


class HealthResponse(BaseModel):
    status: str
    service: str
    ts: str


class ReadyResponse(BaseModel):
    status: str
    service: str
    model_loaded: bool
