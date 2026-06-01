"""InsightFace pipeline: detection, alignment, and 512-d embedding extraction."""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from .config import Settings
from .schemas import DetectedFace


class ImageDecodeError(ValueError):
    """Raised when an uploaded payload cannot be decoded as an image."""


def decode_image(data: bytes) -> np.ndarray:
    """Decode raw image bytes into a BGR ``ndarray`` (as OpenCV/InsightFace expect)."""
    buffer = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise ImageDecodeError("could not decode image; unsupported or corrupt format")
    return image


class FaceEngine:
    """Thin wrapper around InsightFace's ``FaceAnalysis``.

    ``load`` is blocking (model I/O + ORT session init) and is invoked once in a
    worker thread during application startup; ``extract`` is CPU-bound and is also
    run off the event loop (see the embeddings router).
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._app: Any | None = None

    @property
    def ready(self) -> bool:
        return self._app is not None

    def load(self) -> None:
        # Imported lazily so this module can be imported (for tests/linting)
        # without the heavy native dependency stack present.
        from insightface.app import FaceAnalysis

        app = FaceAnalysis(
            name=self._settings.insightface_model_name,
            root=self._settings.insightface_model_root,
            providers=self._settings.onnx_providers,
        )
        size = self._settings.face_det_size
        app.prepare(
            ctx_id=self._settings.onnx_ctx_id,
            det_size=(size, size),
            det_thresh=self._settings.face_det_thresh,
        )
        self._app = app

    def extract(self, image: np.ndarray) -> list[DetectedFace]:
        """Detect faces and return their normalised embeddings, largest first."""
        if self._app is None:
            raise RuntimeError("face engine not loaded")

        results: list[DetectedFace] = []
        for face in self._app.get(image):
            embedding = np.asarray(face.normed_embedding, dtype=np.float32)
            bbox = [float(v) for v in face.bbox]
            x1, y1, x2, y2 = bbox[0], bbox[1], bbox[2], bbox[3]
            area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
            results.append(
                DetectedFace(
                    embedding=embedding.tolist(),
                    bbox=[x1, y1, x2, y2],
                    det_score=float(face.det_score),
                    area=area,
                )
            )

        results.sort(key=lambda f: f.area, reverse=True)
        return results
