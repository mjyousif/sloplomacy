"""Structured JSON telemetry for Cloud Logging, log-based metrics, and dashboards."""

import json
import logging
import os
import sys
import time
from typing import Any

from fastapi import Request

telemetry_logger = logging.getLogger("diplomacy.telemetry")


def _is_gcp_stdout_enabled() -> bool:
    """Return True when running in Cloud Run or explicitly enabled via env var."""
    if os.environ.get("K_SERVICE"):
        return True
    return os.environ.get("ENABLE_GCP_TELEMETRY", "").strip().lower() in ("1", "true", "yes")


def emit_telemetry(
    severity: str,
    event_type: str,
    message: str,
    **fields: Any,
) -> dict[str, Any]:
    """Emit a single-line structured JSON telemetry event for Cloud Logging."""
    payload: dict[str, Any] = {
        "severity": severity,
        "event_type": event_type,
        "message": message,
        **fields,
    }
    raw = json.dumps(payload, separators=(",", ":"))
    telemetry_logger.info(raw)
    if _is_gcp_stdout_enabled():
        print(raw, file=sys.stdout, flush=True)
    return payload


def resolve_route_template(request: Request) -> str:
    """Return the normalized FastAPI route template for /api/* requests."""
    route = request.scope.get("route")
    route_path = getattr(route, "path", None)
    if isinstance(route_path, str) and (route_path == "/api" or route_path.startswith("/api/")):
        return route_path
    return "/api/_unmatched"


def status_class_for(status_code: int) -> str:
    """Return HTTP status class label such as '2xx', '4xx', or '5xx'."""
    return f"{status_code // 100}xx"


def severity_for_status(status_code: int) -> str:
    """Map HTTP status code to Google Cloud Logging severity."""
    if status_code >= 500:
        return "ERROR"
    if status_code >= 400:
        return "WARNING"
    return "INFO"


async def telemetry_middleware(request: Request, call_next):
    """Time /api/* HTTP requests and emit structured per-endpoint telemetry."""
    path = request.url.path
    if path != "/api" and not path.startswith("/api/"):
        return await call_next(request)

    start = time.perf_counter()
    method = request.method.upper()
    try:
        response = await call_next(request)
    except Exception:
        latency_ms = round((time.perf_counter() - start) * 1000.0, 2)
        endpoint = resolve_route_template(request)
        emit_telemetry(
            "ERROR",
            "api_request",
            f"{method} {endpoint} -> 500 ({latency_ms:.2f}ms)",
            route_key=f"{method} {endpoint}",
            endpoint=endpoint,
            method=method,
            status_code=500,
            status_class="5xx",
            latency_ms=latency_ms,
        )
        raise

    latency_ms = round((time.perf_counter() - start) * 1000.0, 2)
    endpoint = resolve_route_template(request)
    status_code = int(response.status_code)
    status_class = status_class_for(status_code)
    severity = severity_for_status(status_code)
    emit_telemetry(
        severity,
        "api_request",
        f"{method} {endpoint} -> {status_code} ({latency_ms:.2f}ms)",
        route_key=f"{method} {endpoint}",
        endpoint=endpoint,
        method=method,
        status_code=status_code,
        status_class=status_class,
        latency_ms=latency_ms,
    )
    return response


def record_engine_adjudication(
    phase: str,
    unit_count: int,
    order_count: int,
    latency_ms: float,
) -> dict[str, Any]:
    """Emit DATC adjudication engine execution timing telemetry."""
    ms = round(latency_ms, 2)
    return emit_telemetry(
        "INFO",
        "engine_adjudicate",
        f"Adjudicated {phase} phase ({unit_count} units, {order_count} orders) in {ms:.2f}ms",
        phase=phase,
        unit_count=unit_count,
        order_count=order_count,
        latency_ms=ms,
    )


def record_supabase_query(
    operation: str,
    outcome: str,
    status_code: int,
    latency_ms: float,
) -> dict[str, Any]:
    """Emit Supabase PostgREST operation timing and outcome telemetry."""
    ms = round(latency_ms, 2)
    severity = "WARNING" if outcome == "error" else "INFO"
    return emit_telemetry(
        severity,
        "supabase_query",
        f"Supabase {operation} [{outcome}] (HTTP {status_code}) in {ms:.2f}ms",
        operation=operation,
        outcome=outcome,
        status_code=status_code,
        latency_ms=ms,
    )
