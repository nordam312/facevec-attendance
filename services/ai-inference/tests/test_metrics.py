"""Tests for the Prometheus /metrics endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_metrics_endpoint(client_ready: TestClient) -> None:
    res = client_ready.get("/metrics")
    assert res.status_code == 200
    body = res.text
    # Custom metrics are always registered (even at zero).
    assert "ai_faces_detected_total" in body
    assert "ai_inference_duration_seconds" in body


def test_metrics_counts_requests(client_ready: TestClient) -> None:
    client_ready.get("/health")
    res = client_ready.get("/metrics")
    assert "http_requests_total" in res.text
