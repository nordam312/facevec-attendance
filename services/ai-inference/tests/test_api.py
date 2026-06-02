"""HTTP-surface tests for the inference API (model injected via a fake engine)."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_health(client_ready: TestClient) -> None:
    res = client_ready.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_ready_when_loaded(client_ready: TestClient) -> None:
    res = client_ready.get("/ready")
    assert res.status_code == 200
    assert res.json()["model_loaded"] is True


def test_ready_when_loading(client_not_ready: TestClient) -> None:
    res = client_not_ready.get("/ready")
    assert res.status_code == 503
    assert res.json()["model_loaded"] is False


def test_embeddings_ok(client_ready: TestClient, png_bytes: bytes) -> None:
    res = client_ready.post("/v1/embeddings", files={"file": ("face.png", png_bytes, "image/png")})
    assert res.status_code == 200
    body = res.json()
    assert body["face_count"] == 1
    assert body["dimensions"] == 512
    assert len(body["primary"]["embedding"]) == 512


def test_embeddings_rejects_non_image(client_ready: TestClient) -> None:
    res = client_ready.post("/v1/embeddings", files={"file": ("note.txt", b"hello", "text/plain")})
    assert res.status_code == 415


def test_embeddings_rejects_empty(client_ready: TestClient) -> None:
    res = client_ready.post("/v1/embeddings", files={"file": ("empty.png", b"", "image/png")})
    assert res.status_code == 400


def test_embeddings_503_when_model_loading(client_not_ready: TestClient, png_bytes: bytes) -> None:
    res = client_not_ready.post(
        "/v1/embeddings",
        files={"file": ("face.png", png_bytes, "image/png")},
    )
    assert res.status_code == 503
