"""Shared pytest fixtures. The real InsightFace model is never loaded — a fake
engine is injected so the HTTP surface can be tested without the ~280 MB pack."""

from __future__ import annotations

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas import DetectedFace


class FakeEngine:
    def __init__(self, ready: bool = True) -> None:
        self._ready = ready

    @property
    def ready(self) -> bool:
        return self._ready

    def extract(self, _image: np.ndarray) -> list[DetectedFace]:
        return [
            DetectedFace(
                embedding=[0.1] * 512, bbox=[0, 0, 100, 100], det_score=0.99, area=10000.0
            ),
        ]


@pytest.fixture
def client_ready() -> TestClient:
    app.state.engine = FakeEngine(ready=True)
    return TestClient(app)


@pytest.fixture
def client_not_ready() -> TestClient:
    app.state.engine = FakeEngine(ready=False)
    return TestClient(app)


@pytest.fixture
def png_bytes() -> bytes:
    image = np.zeros((20, 20, 3), dtype=np.uint8)
    ok, buffer = cv2.imencode(".png", image)
    assert ok
    return buffer.tobytes()
