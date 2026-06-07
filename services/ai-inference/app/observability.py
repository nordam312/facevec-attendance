"""Prometheus metrics and (optional) OpenTelemetry tracing for the AI service."""

from __future__ import annotations

import os
import time
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

REQUESTS = Counter("http_requests_total", "Total HTTP requests", ["method", "path", "status"])
LATENCY = Histogram(
    "http_request_duration_seconds", "HTTP request duration in seconds", ["method", "path"]
)
INFERENCE_DURATION = Histogram(
    "ai_inference_duration_seconds", "Embedding extraction duration in seconds"
)
FACES_DETECTED = Counter("ai_faces_detected_total", "Total faces detected across all requests")


async def metrics_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """Record request count + latency, labelled by the matched route template."""
    start = time.perf_counter()
    response = await call_next(request)
    route = request.scope.get("route")
    path = getattr(route, "path", request.url.path)
    LATENCY.labels(request.method, path).observe(time.perf_counter() - start)
    REQUESTS.labels(request.method, path, str(response.status_code)).inc()
    return response


def metrics_response() -> Response:
    """Prometheus exposition format for GET /metrics."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


def setup_tracing(app: FastAPI) -> None:
    """Enable OpenTelemetry tracing when an OTLP endpoint is configured."""
    if not os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return

    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    provider = TracerProvider(
        resource=Resource.create(
            {"service.name": os.environ.get("OTEL_SERVICE_NAME", "facevec-ai-inference")}
        )
    )
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app)
