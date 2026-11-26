# Observability, Cloud Monitoring Dashboards & Telemetry Maintenance Guide

This guide documents **Sloplomacy 1901's** production observability stack on Google Cloud Run and serves as the operational playbook for both developers and AI coding agents diagnosing regressions, inspecting production logs, or modifying backend telemetry.

## Contents

- [1. Live Google Cloud Monitoring Dashboards (`diplomacy-1901-prod`)](#1-live-google-cloud-monitoring-dashboards-diplomacy-1901-prod)
- [2. Why Zero-Dependency `stdout` JSON + Log-Based Metrics](#2-why-zero-dependency-stdout-json--log-based-metrics)
- [3. Structured Telemetry Events & Log-Based Metrics](#3-structured-telemetry-events--log-based-metrics)
- [4. Performance Baselines & Regression Triage Playbook](#4-performance-baselines--regression-triage-playbook)
- [5. CLI Log Inspection Recipes (`gcloud logging read`)](#5-cli-log-inspection-recipes-gcloud-logging-read)
- [6. Maintenance Rules & Invariants](#6-maintenance-rules--invariants)

---

## 1. Live Google Cloud Monitoring Dashboards (`diplomacy-1901-prod`)

All dashboards and log-based metrics are synchronized automatically on every push/merge to `main` via [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) (running [`scripts/sync_gcp_monitoring.py`](../../scripts/sync_gcp_monitoring.py)), by [`scripts/deploy.ps1`](../../scripts/deploy.ps1) / [`scripts/deploy.sh`](../../scripts/deploy.sh), and declaratively in [`terraform/monitoring.tf`](../../terraform/monitoring.tf) and [`terraform/dashboards.tf`](../../terraform/dashboards.tf).

| Dashboard | Production URL | Primary Purpose |
| :--- | :--- | :--- |
| **API Endpoint Performance** | [Open in GCP Console](https://console.cloud.google.com/monitoring/dashboards/builder/611e8ded-9c13-4943-828f-63e0a2b69e16?project=diplomacy-1901-prod) | Per-endpoint p50/p95/p99 latency, RPS, HTTP method mix, and 4xx/5xx error rate grouped by normalized FastAPI `route_key`. |
| **Cloud Run Infrastructure & Scale-to-Zero** | [Open in GCP Console](https://console.cloud.google.com/monitoring/dashboards/builder/e732a633-5cdc-494f-b0cc-b3bd50e68316?project=diplomacy-1901-prod) | Active vs. idle instance counts, cold-start latency, container CPU & memory utilization, max concurrent requests (HTTP + WebSockets), billable instance time, and network I/O. |
| **Game Engine & Supabase Persistence** | [Open in GCP Console](https://console.cloud.google.com/monitoring/dashboards/builder/4468765b-cdbb-4a2d-b2fb-39a8cbb8f62d?project=diplomacy-1901-prod) | Pure DATC adjudication latency & call rate by phase, plus Supabase PostgREST query p50/p95 latency, throughput by outcome, and error rate by operation. |

### How to Read the Dashboards
- **Zoom the time picker to match activity**: Because the app runs scale-to-zero, traffic comes in gameplay bursts. Use the top-right time selector (`15m` or `30m` for live playtesting, `6h` / `1d` / `7d` for multi-session trends) so bursty activity fills the chart instead of sitting at the right edge.
- **Per-minute resolution & bars**: All tiles align over `60s` windows so zoomed-in 5–15 minute views plot per-minute points, while request rate and billable instance time charts render as `STACKED_BAR` columns so isolated 1-minute bursts remain clearly visible.
- **Isolate a route**: Click any route (`POST /api/order`, `GET /api/games/mine`, etc.) in a chart legend to focus on that single endpoint's line or bar.

---

## 2. Why Zero-Dependency `stdout` JSON + Log-Based Metrics

Cloud Run's built-in `run.googleapis.com/request_latencies` metric aggregates at the service/revision level and mixes `/api/*` calls with static asset downloads (`/assets/*`) and 3600 s WebSocket connections (`/ws/*`). Rather than adding OpenTelemetry or Cloud Monitoring SDKs, [`backend/telemetry.py`](../../backend/telemetry.py) emits single-line structured JSON directly to `stdout`:

- **Compatible with `--cpu-throttling` (`cpu_idle = true`) and scale-to-zero (`min_instance_count = 0`)**: Cloud Run throttles container CPU immediately after a response completes. Background exporter threads (such as OpenTelemetry's periodic gRPC reader) stall or drop trailing metric batches when frozen; `stdout` JSON is collected out-of-band by Cloud Run's host logging agent with zero background threads or network calls.
- **Zero cold-start or dependency overhead**: Adds zero packages to [`backend/requirements-runtime.txt`](../../backend/requirements-runtime.txt) and avoids SDK import latency on scale-from-zero boots.
- **Cost profile**: Log-based metrics are free on GCP, and Cloud Logging includes a 50 GiB/month free tier.

> [!NOTE]
> **When to revisit OpenTelemetry**: Only consider an in-process metric/trace SDK if sustained traffic exceeds hundreds of requests per second (approaching the 50 GiB/month logging free tier), if per-request Cloud Trace parent/child span waterfalls are needed, or if the service moves to always-on CPU (`cpu_idle = false`).

---

## 3. Structured Telemetry Events & Log-Based Metrics

[`backend/telemetry.py`](../../backend/telemetry.py) logs every event to the `diplomacy.telemetry` Python logger and prints single-line JSON to `stdout` when `K_SERVICE` (set automatically by Cloud Run) or `ENABLE_GCP_TELEMETRY=1` is present.

### Event Schemas (`jsonPayload.event_type`)

1. **`api_request`** (`TelemetryMiddleware` on `/api/*` HTTP requests only; static assets and WebSockets skipped):
   - `route_key`: Normalized method + route template (e.g. `POST /api/games/{game_id}/join`, `POST /api/order`, `GET /api/_unmatched`)
   - `endpoint`: Normalized FastAPI route template from `resolve_route_template` (e.g. `/api/games/{game_id}/join`, or `/api/_unmatched` for 404s)
   - `method`: Uppercase HTTP verb (`GET`, `POST`, `PATCH`, `DELETE`)
   - `status_code`: Integer HTTP status (`200`, `403`, `409`, `503`, etc.)
   - `status_class`: `"2xx"`, `"4xx"`, `"5xx"`, etc.
   - `latency_ms`: Request duration in milliseconds (`float`, rounded to 2 decimals)
   - `severity`: `"ERROR"` (`>= 500`), `"WARNING"` (`>= 400`), or `"INFO"` (`< 400`)

2. **`engine_adjudicate`** (`adjudicate_turn` in [`backend/engine/adjudicator/resolver.py`](../../backend/engine/adjudicator/resolver.py)):
   - `phase`: `"Movement"`, `"Retreats"`, or `"Adjustments"`
   - `unit_count`, `order_count`: Integer counts for the resolved board
   - `latency_ms`: Pure DATC adjudication execution time in milliseconds

3. **`supabase_query`** ([`backend/storage/supabase.py`](../../backend/storage/supabase.py) and [`backend/storage/press.py`](../../backend/storage/press.py)):
   - `operation`: `"load_game"`, `"load_summaries"`, `"save_game"`, `"delete_game"`, `"load_profiles"`, `"upsert_profile"`, `"load_press"`, `"save_press"`
   - `outcome`: `"ok"`, `"not_found"`, or `"error"`
   - `status_code`: Upstream HTTP status (`0` on transport/timeout exception)
   - `latency_ms`: PostgREST round-trip duration in milliseconds

### Log-Based Metrics Mapping

| Metric Name (`logging.googleapis.com/user/...`) | Kind / Type | Source Event | Labels |
| :--- | :--- | :--- | :--- |
| `${service_name}_api_request_count` | `DELTA` `INT64` | `api_request` | `route_key`, `endpoint`, `method`, `status_class`, `status_code` |
| `${service_name}_api_request_latency_ms` | `DELTA` `DISTRIBUTION` (ms) | `api_request` | `route_key`, `endpoint`, `method`, `status_class` |
| `${service_name}_engine_adjudicate_latency_ms` | `DELTA` `DISTRIBUTION` (ms) | `engine_adjudicate` | `phase` |
| `${service_name}_supabase_query_count` | `DELTA` `INT64` | `supabase_query` | `operation`, `outcome` |
| `${service_name}_supabase_query_latency_ms` | `DELTA` `DISTRIBUTION` (ms) | `supabase_query` | `operation`, `outcome` |

---

## 4. Performance Baselines & Regression Triage Playbook

Use these baselines when verifying deploys or investigating user-reported slowdowns:

| Signal | Expected Healthy Baseline | What a Regression Looks Like & Likely Cause |
| :--- | :--- | :--- |
| **`POST /api/order` p95** | **< 25 ms** (responds immediately before background save) | Jumps to **100–450 ms** matching `save_game`: `BackgroundTasks` detachment in `backend/api/orders.py` broke, or a `BaseHTTPMiddleware` was introduced in `backend/main.py` blocking HTTP keep-alive until background tasks finish. |
| **`supabase_query` p95** | **40–150 ms** (warm pooled connection) | Jumps to **350–900 ms**: the shared `httpx.AsyncClient` pool (`supabase.get_http_client()`) was bypassed or closed prematurely, forcing fresh TLS handshakes per query. |
| **`engine_adjudicate` p95** | **< 10 ms** | Spikes in a specific phase: inspect recent changes to `backend/engine/adjudicator/` or `diplomacy` library upgrades. |
| **`/api/_unmatched` 4xx** | **~0 RPS** | Sustained 4xx on `/api/_unmatched`: frontend client bundle and backend router paths are out of sync, or bots are probing unknown `/api/*` paths. |
| **Container Startup Latency** | **1–3 s** (`startup_cpu_boost = true`) | Climbs sharply: heavy runtime dependency added to `backend/requirements-runtime.txt` or startup sync (`load_all_summaries_from_db`) timing out. |
| **Billable Instance Time / Max Concurrent Requests** | Drops to `0` when idle; `1` active instance max | Stays elevated with zero API traffic: open WebSocket connections (`/ws/*`) are keeping the container awake (see [`docs/guides/google-cloud-deployment.md`](google-cloud-deployment.md)). |

---

## 5. CLI Log Inspection Recipes (`gcloud logging read`)

Developers and agents can inspect recent production telemetry directly from a shell authenticated to `diplomacy-1901-prod`:

```bash
# 1. Recent 4xx / 5xx API errors with route_key and latency
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="traitorous" AND jsonPayload.event_type="api_request" AND jsonPayload.status_code>=400' \
  --project=diplomacy-1901-prod --limit=30 --format="table(timestamp,jsonPayload.route_key,jsonPayload.status_code,jsonPayload.latency_ms)"

# 2. Slow API requests (> 100 ms)
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="traitorous" AND jsonPayload.event_type="api_request" AND jsonPayload.latency_ms>100' \
  --project=diplomacy-1901-prod --limit=30 --format="table(timestamp,jsonPayload.route_key,jsonPayload.status_code,jsonPayload.latency_ms)"

# 3. Supabase persistence failures
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="traitorous" AND jsonPayload.event_type="supabase_query" AND jsonPayload.outcome="error"' \
  --project=diplomacy-1901-prod --limit=30 --format="table(timestamp,jsonPayload.operation,jsonPayload.status_code,jsonPayload.latency_ms,jsonPayload.message)"

# 4. Recent DATC adjudication timings
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="traitorous" AND jsonPayload.event_type="engine_adjudicate"' \
  --project=diplomacy-1901-prod --limit=20 --format="table(timestamp,jsonPayload.phase,jsonPayload.unit_count,jsonPayload.order_count,jsonPayload.latency_ms)"
```

---

## 6. Maintenance Rules & Invariants

1. **Keep `TelemetryMiddleware` pure ASGI**: Never convert `TelemetryMiddleware` in [`backend/telemetry.py`](../../backend/telemetry.py) to Starlette `BaseHTTPMiddleware` (`@app.middleware("http")`), which stalls keep-alive connections until `BackgroundTasks` finish.
2. **Prevent label cardinality explosion**: Never include dynamic identifiers (`game_id`, `user_id`, raw `request.url.path`, query strings) in telemetry metric labels. Always route paths through `resolve_route_template` (collapsing unrouted paths to `/api/_unmatched`).
3. **Keep Terraform and CI sync scripts aligned**: Whenever adding or renaming metrics, labels, or dashboard widgets, update **both** [`scripts/sync_gcp_monitoring.py`](../../scripts/sync_gcp_monitoring.py) and [`terraform/monitoring.tf`](../../terraform/monitoring.tf) / [`terraform/dashboards.tf`](../../terraform/dashboards.tf), then verify with:
   ```bash
   python -m pytest backend/tests/unit/test_telemetry.py -v
   python scripts/sync_gcp_monitoring.py --project diplomacy-1901-prod --dry-run
   ```
4. **Follow Cloud Monitoring's singular vs. plural label rules**:
   - In `timeSeriesFilter.filter`: quote label keys with singular `metric.label."<key>"` (e.g., `metric.label."outcome"="error"`).
   - In `aggregation.groupByFields`: use **unquoted** singular `metric.label.<key>` (never `metric.label."<key>"`, which prevents `crossSeriesReducer` from matching the label).
   - In `xyChart.dataSets[].legendTemplate`: use **plural** `${metric.labels.<key>}` (never singular `${metric.label.<key>}`, which evaluates as undefined and causes the UI to render raw dataset UUIDs in chart legends).
5. **Never log PII or secrets**: Telemetry payloads must never include JWTs, passcodes, emails, display names, or hidden multiplayer orders.
