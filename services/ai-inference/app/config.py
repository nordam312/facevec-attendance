"""Application settings, loaded once from the environment."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven configuration for the inference service."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    service_name: str = "ai-inference"
    log_level: str = "INFO"

    # InsightFace model pack and where its weights are cached on disk.
    insightface_model_name: str = "buffalo_l"
    insightface_model_root: str = "/models"

    # Detector input size (square) and confidence threshold.
    face_det_size: int = 640
    face_det_thresh: float = Field(default=0.5, ge=0.0, le=1.0)

    # ONNXRuntime execution providers; CPU by default. ctx_id < 0 ⇒ CPU.
    onnx_providers: list[str] = ["CPUExecutionProvider"]
    onnx_ctx_id: int = -1

    # Embedding dimensionality the model produces (buffalo_l → 512).
    embedding_dimensions: int = 512

    # Reject uploads larger than this (bytes) before decoding.
    max_image_bytes: int = 10 * 1024 * 1024


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached singleton accessor for the settings."""
    return Settings()
