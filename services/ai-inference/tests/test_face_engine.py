"""Unit tests for the face engine's pure logic (no real model required)."""

from __future__ import annotations

import cv2
import numpy as np
import pytest

from app.config import Settings
from app.face_engine import FaceEngine, ImageDecodeError, decode_image


def test_decode_image_valid() -> None:
    image = np.zeros((12, 12, 3), dtype=np.uint8)
    ok, buffer = cv2.imencode(".png", image)
    assert ok
    decoded = decode_image(buffer.tobytes())
    assert decoded.shape == (12, 12, 3)


def test_decode_image_invalid() -> None:
    with pytest.raises(ImageDecodeError):
        decode_image(b"definitely not an image")


class _FakeFace:
    def __init__(self, embedding: list[float], bbox: list[float], score: float) -> None:
        self.normed_embedding = np.array(embedding, dtype=np.float32)
        self.bbox = np.array(bbox, dtype=np.float32)
        self.det_score = score


class _FakeApp:
    def __init__(self, faces: list[_FakeFace]) -> None:
        self._faces = faces

    def get(self, _image: np.ndarray) -> list[_FakeFace]:
        return self._faces


def test_extract_maps_and_sorts_by_area() -> None:
    engine = FaceEngine(Settings())
    small = _FakeFace([0.0] * 512, [0, 0, 10, 10], 0.80)  # area 100
    large = _FakeFace([1.0] * 512, [0, 0, 100, 100], 0.95)  # area 10000
    engine._app = _FakeApp([small, large])  # type: ignore[assignment]

    faces = engine.extract(np.zeros((1, 1, 3), dtype=np.uint8))

    assert len(faces) == 2
    assert faces[0].area > faces[1].area  # largest first
    assert faces[0].det_score == 0.95
    assert len(faces[0].embedding) == 512


def test_extract_raises_when_not_loaded() -> None:
    engine = FaceEngine(Settings())
    with pytest.raises(RuntimeError):
        engine.extract(np.zeros((1, 1, 3), dtype=np.uint8))
