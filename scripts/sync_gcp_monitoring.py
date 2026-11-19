"""Idempotently sync Cloud Logging log-based metrics and Cloud Monitoring dashboards."""

from __future__ import annotations

import argparse
import http.client
import json
import os
import shutil
import subprocess
import sys
import urllib.parse
from pathlib import Path
from typing import Any


def _metric(
    name: str,
    desc: str,
    event_filter: str,
    labels: list[tuple[str, str]],
    value_type: str = "INT64",
    unit: str = "1",
    extractor: str | None = None,
    buckets: tuple[int, float, float] | None = None,
) -> dict[str, Any]:
    spec: dict[str, Any] = {
        "name": name,
        "description": desc,
        "filter": event_filter,
        "metricDescriptor": {
            "metricKind": "DELTA",
            "valueType": value_type,
            "unit": unit,
            "labels": [{"key": k, "valueType": "STRING", "description": d} for k, d in labels],
        },
        "labelExtractors": {k: f"EXTRACT(jsonPayload.{k})" for k, _ in labels},
    }
    if extractor:
        spec["valueExtractor"] = extractor
    if buckets:
        n, gf, scale = buckets
        spec["bucketOptions"] = {
            "exponentialBuckets": {"numFiniteBuckets": n, "growthFactor": gf, "scale": scale}
        }
    return spec


def build_log_metrics(service_name: str) -> list[dict[str, Any]]:
    """Return Cloud Logging v2 LogMetric payloads matching backend/telemetry.py."""
    base = f'resource.type="cloud_run_revision" AND resource.labels.service_name="{service_name}"'
    api_labels = [
        ("route_key", "HTTP method and parameterized FastAPI route template"),
        ("endpoint", "Parameterized FastAPI route path"),
        ("method", "HTTP request method"),
        ("status_class", "HTTP status class (2xx, 4xx, 5xx)"),
    ]
    sup_labels = [
        ("operation", "Persistence operation (load_game, save_game, etc.)"),
        ("outcome", "Query outcome (ok, not_found, error)"),
    ]
    return [
        _metric(
            f"{service_name}_api_request_count",
            "Count of HTTP /api/* requests grouped by FastAPI route template and status",
            f'{base} AND jsonPayload.event_type="api_request"',
            [*api_labels, ("status_code", "HTTP status code")],
        ),
        _metric(
            f"{service_name}_api_request_latency_ms",
            "Latency distribution (ms) for HTTP /api/* requests by FastAPI route template",
            f'{base} AND jsonPayload.event_type="api_request"',
            api_labels,
            value_type="DISTRIBUTION",
            unit="ms",
            extractor="EXTRACT(jsonPayload.latency_ms)",
            buckets=(64, 1.25, 0.5),
        ),
        _metric(
            f"{service_name}_engine_adjudicate_latency_ms",
            "DATC adjudication execution latency distribution (ms) grouped by phase",
            f'{base} AND jsonPayload.event_type="engine_adjudicate"',
            [("phase", "Diplomacy phase (Movement, Retreats, Adjustments)")],
            value_type="DISTRIBUTION",
            unit="ms",
            extractor="EXTRACT(jsonPayload.latency_ms)",
            buckets=(48, 1.25, 0.25),
        ),
        _metric(
            f"{service_name}_supabase_query_count",
            "Count of Supabase PostgREST queries grouped by operation and outcome",
            f'{base} AND jsonPayload.event_type="supabase_query"',
            sup_labels,
        ),
        _metric(
            f"{service_name}_supabase_query_latency_ms",
            "Latency distribution (ms) for Supabase PostgREST queries by operation and outcome",
            f'{base} AND jsonPayload.event_type="supabase_query"',
            sup_labels,
            value_type="DISTRIBUTION",
            unit="ms",
            extractor="EXTRACT(jsonPayload.latency_ms)",
            buckets=(64, 1.25, 0.5),
        ),
    ]


def _ds(
    flt: str,
    aligner: str,
    reducer: str,
    group_by: list[str],
    plot: str,
    legend: str,
    period: str = "60s",
) -> dict[str, Any]:
    return {
        "plotType": plot,
        "legendTemplate": legend,
        "timeSeriesQuery": {
            "timeSeriesFilter": {
                "filter": flt,
                "aggregation": {
                    "alignmentPeriod": period,
                    "perSeriesAligner": aligner,
                    "crossSeriesReducer": reducer,
                    "groupByFields": group_by,
                },
            }
        },
    }


def _tile(
    pos: tuple[int, int, int, int], title: str, y: str, ds: list[dict[str, Any]]
) -> dict[str, Any]:
    x, ypos, w, h = pos
    return {
        "xPos": x,
        "yPos": ypos,
        "width": w,
        "height": h,
        "widget": {
            "title": title,
            "xyChart": {"dataSets": ds, "yAxis": {"label": y, "scale": "LINEAR"}},
        },
    }


def _rate(
    flt: str, *grp: str, plot: str = "LINE", leg: str | None = None, period: str = "60s"
) -> dict[str, Any]:
    groups = [f"metric.label.{g}" for g in grp]
    legend = leg if leg is not None else (f"${{metric.labels.{grp[0]}}}" if grp else "")
    return _ds(flt, "ALIGN_RATE", "REDUCE_SUM", groups, plot, legend, period=period)


def _pct(
    flt: str, p: int, *grp: str, leg: str | None = None, period: str = "60s"
) -> dict[str, Any]:
    groups = [f"metric.label.{g}" for g in grp]
    legend = leg if leg is not None else (f"${{metric.labels.{grp[0]}}}" if grp else f"p{p}")
    return _ds(flt, "ALIGN_DELTA", f"REDUCE_PERCENTILE_{p}", groups, "LINE", legend, period=period)


def _pcts(
    flt: str, ps: tuple[int, ...] = (50, 95, 99), period: str = "60s"
) -> list[dict[str, Any]]:
    return [_pct(flt, p, period=period) for p in ps]


def build_dashboards(service_name: str) -> list[dict[str, Any]]:
    """Return Cloud Monitoring v1 Dashboard payloads."""
    res = f'resource.type="cloud_run_revision" resource.label."service_name"="{service_name}"'

    def m(metric_type: str) -> str:
        return f'metric.type="{metric_type}" {res}'

    api_c = m(f"logging.googleapis.com/user/{service_name}_api_request_count")
    api_l = m(f"logging.googleapis.com/user/{service_name}_api_request_latency_ms")
    eng_l = m(f"logging.googleapis.com/user/{service_name}_engine_adjudicate_latency_ms")
    sup_c = m(f"logging.googleapis.com/user/{service_name}_supabase_query_count")
    sup_l = m(f"logging.googleapis.com/user/{service_name}_supabase_query_latency_ms")
    err_flt = f'{api_c} metric.label."status_class"=monitoring.regex.full_match("4xx|5xx")'

    api_tiles = [
        _tile(
            (0, 0, 6, 4),
            "Overall API Request Rate by Status Class (RPS)",
            "Requests / sec",
            [_rate(api_c, "status_class", plot="STACKED_BAR")],
        ),
        _tile(
            (6, 0, 6, 4),
            "Overall API Latency Percentiles (p50 / p95 / p99)",
            "Latency (ms)",
            _pcts(api_l),
        ),
        _tile(
            (0, 4, 6, 5),
            "p95 Latency by Endpoint",
            "Latency (ms)",
            [_pct(api_l, 95, "route_key")],
        ),
        _tile(
            (6, 4, 6, 5),
            "p50 Median Latency by Endpoint",
            "Latency (ms)",
            [_pct(api_l, 50, "route_key")],
        ),
        _tile(
            (0, 9, 6, 5),
            "p99 Tail Latency by Endpoint",
            "Latency (ms)",
            [_pct(api_l, 99, "route_key")],
        ),
        _tile(
            (6, 9, 6, 5),
            "Request Rate (RPS) by Endpoint",
            "Requests / sec",
            [_rate(api_c, "route_key", plot="STACKED_BAR")],
        ),
        _tile(
            (0, 14, 6, 4),
            "4xx & 5xx Error Rate by Endpoint",
            "Errors / sec",
            [
                _rate(
                    err_flt,
                    "route_key",
                    "status_class",
                    plot="STACKED_BAR",
                    leg="${metric.labels.route_key} (${metric.labels.status_class})",
                )
            ],
        ),
        _tile(
            (6, 14, 6, 4),
            "API Traffic by HTTP Method",
            "Requests / sec",
            [_rate(api_c, "method", plot="STACKED_AREA")],
        ),
    ]
    run_tiles = [
        _tile(
            (0, 0, 6, 4),
            "Container Instance Count (Active vs Idle)",
            "Instances",
            [
                _ds(
                    m("run.googleapis.com/container/instance_count"),
                    "ALIGN_MEAN",
                    "REDUCE_SUM",
                    ["metric.label.state"],
                    "STACKED_AREA",
                    "${metric.labels.state}",
                )
            ],
        ),
        _tile(
            (6, 0, 6, 4),
            "Cold-Start Container Startup Latency (p50 / p95 / p99)",
            "Startup Latency (ms)",
            _pcts(m("run.googleapis.com/container/startup_latencies")),
        ),
        _tile(
            (0, 4, 6, 4),
            "Container CPU Utilization (p50 / p95 / p99)",
            "Utilization (0-1)",
            _pcts(m("run.googleapis.com/container/cpu/utilizations")),
        ),
        _tile(
            (6, 4, 6, 4),
            "Container Memory Utilization (p50 / p95 / p99)",
            "Utilization (0-1)",
            _pcts(m("run.googleapis.com/container/memory/utilizations")),
        ),
        _tile(
            (0, 8, 6, 4),
            "Max Concurrent Requests (WebSockets + HTTP)",
            "Concurrent Requests",
            _pcts(m("run.googleapis.com/container/max_request_concurrencies"), (50, 95)),
        ),
        _tile(
            (6, 8, 6, 4),
            "Cloud Run Total Requests by Response Code Class (All Traffic)",
            "Requests / sec",
            [
                _rate(
                    m("run.googleapis.com/request_count"), "response_code_class", plot="STACKED_BAR"
                )
            ],
        ),
        _tile(
            (0, 12, 6, 4),
            "Billable Container Instance Time",
            "Instance-seconds / sec",
            [
                _rate(
                    m("run.googleapis.com/container/billable_instance_time"),
                    plot="STACKED_BAR",
                    leg="Billable instance-s / s",
                )
            ],
        ),
        _tile(
            (6, 12, 6, 4),
            "Container Network Egress & Ingress",
            "Bytes / sec",
            [
                _rate(
                    m("run.googleapis.com/container/network/sent_bytes_count"), leg="Sent (bytes/s)"
                ),
                _rate(
                    m("run.googleapis.com/container/network/received_bytes_count"),
                    leg="Received (bytes/s)",
                ),
            ],
        ),
    ]
    eng_tiles = [
        _tile(
            (0, 0, 6, 4),
            "DATC Adjudication p95 Latency by Phase",
            "Latency (ms)",
            [_pct(eng_l, 95, "phase", leg="${metric.labels.phase} (p95)")],
        ),
        _tile(
            (6, 0, 6, 4),
            "DATC Adjudication Calls by Phase (per minute)",
            "Adjudications / min",
            [
                _ds(
                    eng_l,
                    "ALIGN_COUNT",
                    "REDUCE_SUM",
                    ["metric.label.phase"],
                    "STACKED_BAR",
                    "${metric.labels.phase}",
                )
            ],
        ),
        _tile(
            (0, 4, 6, 4),
            "Supabase Query p95 Latency by Operation",
            "Latency (ms)",
            [_pct(sup_l, 95, "operation")],
        ),
        _tile(
            (6, 4, 6, 4),
            "Supabase Query p50 Median Latency by Operation",
            "Latency (ms)",
            [_pct(sup_l, 50, "operation")],
        ),
        _tile(
            (0, 8, 6, 4),
            "Supabase Query Rate by Operation & Outcome",
            "Queries / sec",
            [
                _rate(
                    sup_c,
                    "operation",
                    "outcome",
                    plot="STACKED_BAR",
                    leg="${metric.labels.operation} (${metric.labels.outcome})",
                )
            ],
        ),
        _tile(
            (6, 8, 6, 4),
            "Supabase Persistence Errors by Operation",
            "Errors / sec",
            [_rate(f'{sup_c} metric.label."outcome"="error"', "operation", plot="STACKED_BAR")],
        ),
    ]
    return [
        {
            "displayName": f"Sloplomacy — API Endpoint Performance ({service_name})",
            "mosaicLayout": {"columns": 12, "tiles": api_tiles},
        },
        {
            "displayName": f"Sloplomacy — Cloud Run Infrastructure & Scale-to-Zero ({service_name})",
            "mosaicLayout": {"columns": 12, "tiles": run_tiles},
        },
        {
            "displayName": f"Sloplomacy — Game Engine & Supabase Persistence ({service_name})",
            "mosaicLayout": {"columns": 12, "tiles": eng_tiles},
        },
    ]


def _gcloud_access_token() -> str:
    gcloud_exe = shutil.which("gcloud") or "gcloud"
    res = subprocess.run(  # noqa: S603
        [gcloud_exe, "auth", "print-access-token"], capture_output=True, text=True, check=True
    )
    return res.stdout.strip()


def _https_json(
    method: str, host: str, path: str, token: str, body: dict[str, Any] | None = None
) -> tuple[int, dict[str, Any]]:
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = json.dumps(body) if body is not None else None
    conn = http.client.HTTPSConnection(host, timeout=20)
    try:
        conn.request(method, path, body=payload, headers=headers)
        resp = conn.getresponse()
        raw = resp.read().decode("utf-8", errors="replace")
        if resp.status == 404:
            return 404, {}
        if resp.status >= 400:
            raise RuntimeError(f"{method} https://{host}{path} -> HTTP {resp.status}: {raw}")
        return resp.status, json.loads(raw) if raw else {}
    finally:
        conn.close()


def sync_monitoring(
    project_id: str, service_name: str, summary_path: str | None = None
) -> list[tuple[str, str]]:
    """Create or update all log-based metrics and dashboards in GCP."""
    token = _gcloud_access_token()
    log_host, mon_host = "logging.googleapis.com", "monitoring.googleapis.com"
    metric_base = f"/v2/projects/{project_id}/metrics"

    for metric in build_log_metrics(service_name):
        metric_id = urllib.parse.quote(metric["name"], safe="")
        status, _ = _https_json("GET", log_host, f"{metric_base}/{metric_id}", token)
        if status == 200:
            _https_json("PUT", log_host, f"{metric_base}/{metric_id}", token, metric)
            print(f"[updated] metric {metric['name']}")
        else:
            _https_json("POST", log_host, metric_base, token, metric)
            print(f"[created] metric {metric['name']}")

    dash_base = f"/v1/projects/{project_id}/dashboards"
    _, listed = _https_json("GET", mon_host, dash_base, token)
    existing = {d["displayName"]: d for d in listed.get("dashboards", []) if "displayName" in d}

    results: list[tuple[str, str]] = []
    for dash in build_dashboards(service_name):
        title = dash["displayName"]
        if title in existing:
            prev = existing[title]
            payload = {**dash, "etag": prev["etag"]}
            _, updated = _https_json("PATCH", mon_host, f"/v1/{prev['name']}", token, payload)
            res_name = updated.get("name", prev["name"])
            print(f"[updated] dashboard {title}")
        else:
            _, created = _https_json("POST", mon_host, dash_base, token, dash)
            res_name = created["name"]
            print(f"[created] dashboard {title}")
        dash_id = res_name.rsplit("/", 1)[-1]
        url = f"https://console.cloud.google.com/monitoring/dashboards/builder/{dash_id}?project={project_id}"
        print(f"          {url}")
        results.append((title, url))

    target = summary_path or os.environ.get("GITHUB_STEP_SUMMARY", "")
    if target:
        lines = [
            "### Google Cloud Monitoring Dashboards",
            *[f"- [{t}]({u})" for t, u in results],
            "",
        ]
        with Path(target).open("a", encoding="utf-8") as fh:
            fh.write("\n".join(lines))
    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Sync Cloud Logging metrics and Monitoring dashboards."
    )
    parser.add_argument("--project", required=True, help="GCP Project ID")
    parser.add_argument("--service", default="diplomacy-1901", help="Cloud Run service name")
    parser.add_argument("--github-summary", default=None, help="Optional path for markdown links")
    parser.add_argument(
        "--dry-run", action="store_true", help="Print metric/dashboard summary only"
    )
    args = parser.parse_args(argv)
    if args.dry_run:
        out = {
            "metrics": [m["name"] for m in build_log_metrics(args.service)],
            "dashboards": [d["displayName"] for d in build_dashboards(args.service)],
        }
        print(json.dumps(out, indent=2))
        return 0
    sync_monitoring(args.project, args.service, summary_path=args.github_summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
