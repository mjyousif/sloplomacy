"""Unit and integration tests for structured telemetry and Terraform monitoring config."""

import asyncio
import json
import logging
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from domain.board import Power
from domain.press import PressMessage
from engine.adjudicator.resolver import adjudicate_turn
from fastapi.testclient import TestClient
from main import app
from scenarios.presets import build_scenario
from storage.press import load_press_from_db, save_press_to_db
from storage.supabase import SupabaseUnavailable, load_game_from_db, save_game_to_db
from telemetry import TelemetryMiddleware, emit_telemetry

client = TestClient(app)


def _telemetry_events(
    caplog: pytest.LogCaptureFixture, event_type: str | None = None
) -> list[dict]:
    events = []
    for rec in caplog.records:
        if rec.name != "diplomacy.telemetry":
            continue
        payload = json.loads(rec.getMessage())
        if event_type is None or payload.get("event_type") == event_type:
            events.append(payload)
    return events


def test_api_middleware_normalizes_parameterized_routes(caplog: pytest.LogCaptureFixture):
    with caplog.at_level(logging.INFO, logger="diplomacy.telemetry"):
        res_game = client.get("/api/game")
        assert res_game.status_code == 200

        res_by_id = client.get("/api/games/mp_test123")
        assert res_by_id.status_code in (200, 404)

    events = _telemetry_events(caplog, "api_request")
    assert len(events) == 2

    first = events[0]
    assert first["endpoint"] == "/api/game"
    assert first["method"] == "GET"
    assert first["route_key"] == "GET /api/game"
    assert first["status_code"] == 200
    assert first["status_class"] == "2xx"
    assert first["severity"] == "INFO"
    assert first["latency_ms"] >= 0

    second = events[1]
    assert second["endpoint"] == "/api/games/{game_id}"
    assert second["route_key"] == "GET /api/games/{game_id}"


def test_api_middleware_collapses_unmatched_routes_and_errors(caplog: pytest.LogCaptureFixture):
    with caplog.at_level(logging.INFO, logger="diplomacy.telemetry"):
        res = client.get("/api/does-not-exist")
        assert res.status_code == 404

    events = _telemetry_events(caplog, "api_request")
    assert len(events) == 1
    ev = events[0]
    assert ev["endpoint"] == "/api/_unmatched"
    assert ev["route_key"] == "GET /api/_unmatched"
    assert ev["status_code"] == 404
    assert ev["status_class"] == "4xx"
    assert ev["severity"] == "WARNING"


def test_api_middleware_handles_unhandled_exceptions(caplog: pytest.LogCaptureFixture):
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/order",
        "headers": [],
        "route": SimpleNamespace(path="/api/order"),
    }

    async def boom_app(_scope, _receive, _send):
        raise RuntimeError("boom")

    async def noop_receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def noop_send(_message):
        return None

    middleware = TelemetryMiddleware(boom_app)
    with caplog.at_level(logging.INFO, logger="diplomacy.telemetry"):
        with pytest.raises(RuntimeError, match="boom"):
            asyncio.run(middleware(scope, noop_receive, noop_send))

    events = _telemetry_events(caplog, "api_request")
    assert len(events) == 1
    assert events[0]["route_key"] == "POST /api/order"
    assert events[0]["status_code"] == 500
    assert events[0]["status_class"] == "5xx"
    assert events[0]["severity"] == "ERROR"


def test_non_api_paths_do_not_emit_api_telemetry(caplog: pytest.LogCaptureFixture):
    with caplog.at_level(logging.INFO, logger="diplomacy.telemetry"):
        res_docs = client.get("/docs")
        assert res_docs.status_code == 200
        client.get("/non-api-path")

    assert _telemetry_events(caplog, "api_request") == []


def test_gcp_stdout_emission_controlled_by_env(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
):
    monkeypatch.delenv("K_SERVICE", raising=False)
    monkeypatch.delenv("ENABLE_GCP_TELEMETRY", raising=False)

    emit_telemetry("INFO", "api_request", "local", route_key="GET /api/game", latency_ms=1.5)
    assert capsys.readouterr().out == ""

    monkeypatch.setenv("K_SERVICE", "diplomacy-1901")
    emit_telemetry("INFO", "api_request", "cloud", route_key="GET /api/game", latency_ms=2.25)
    out_k = capsys.readouterr().out.strip()
    assert json.loads(out_k)["route_key"] == "GET /api/game"

    monkeypatch.delenv("K_SERVICE", raising=False)
    monkeypatch.setenv("ENABLE_GCP_TELEMETRY", "1")
    emit_telemetry("WARNING", "supabase_query", "flag", operation="save_game", outcome="error")
    out_flag = capsys.readouterr().out.strip()
    parsed = json.loads(out_flag)
    assert parsed["severity"] == "WARNING"
    assert parsed["operation"] == "save_game"


def test_engine_adjudicate_emits_telemetry(caplog: pytest.LogCaptureFixture):
    state = build_scenario("standard_1901", Power.FRANCE, "telemetry_test")
    with caplog.at_level(logging.INFO, logger="diplomacy.telemetry"):
        caplog.clear()
        adjudicate_turn(
            state.units,
            state.orders,
            state.ownership,
            season=state.season,
            year=state.year,
            phase=state.phase,
        )

    events = _telemetry_events(caplog, "engine_adjudicate")
    assert len(events) == 1
    ev = events[0]
    assert ev["phase"] == "Movement"
    assert ev["unit_count"] == len(state.units)
    assert ev["order_count"] == len(state.orders)
    assert ev["latency_ms"] >= 0


def test_supabase_and_press_queries_emit_telemetry(caplog: pytest.LogCaptureFixture):
    game = build_scenario("standard_1901", Power.FRANCE, "tele_game_1")
    env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
    row = {
        "room_code": "tele_game_1",
        "name": "Telemetry Match",
        "status": "in_progress",
        "phase": "Movement",
        "season": "Spring",
        "year": 1901,
        "game_state": {"state": game.model_dump(mode="json")},
    }
    press_msg = PressMessage(
        id="p1",
        seq=1,
        sender=Power.FRANCE,
        recipients=[],
        body="Bonjour",
        sent_at="2026-11-05T00:00:00Z",
        season="Spring",
        year=1901,
        phase="Movement",
    )

    async def run_checks():
        mock_client = AsyncMock(spec=httpx.AsyncClient)

        mock_client.post.return_value = httpx.Response(status_code=201)
        assert await save_game_to_db("tele_game_1", game, client=mock_client) is True

        mock_client.get.return_value = httpx.Response(status_code=200, json=[row])
        assert await load_game_from_db("tele_game_1", client=mock_client) is not None

        mock_client.get.return_value = httpx.Response(status_code=200, json=[])
        assert await load_game_from_db("tele_game_1", client=mock_client) is None

        mock_client.get.return_value = httpx.Response(status_code=503, text="down")
        with pytest.raises(SupabaseUnavailable):
            await load_game_from_db("tele_game_1", client=mock_client)

        mock_client.get.return_value = httpx.Response(
            status_code=200, json=[{"press": [press_msg.model_dump(mode="json")]}]
        )
        assert len(await load_press_from_db("tele_game_1", client=mock_client)) == 1

        mock_client.patch.return_value = httpx.Response(
            status_code=200, json=[{"room_code": "tele_game_1"}]
        )
        assert await save_press_to_db("tele_game_1", [press_msg], client=mock_client) is True

        mock_client.patch.return_value = httpx.Response(status_code=200, json=[])
        assert await save_press_to_db("tele_game_1", [press_msg], client=mock_client) is False

        mock_client.patch.return_value = httpx.Response(status_code=500, text="err")
        assert await save_press_to_db("tele_game_1", [press_msg], client=mock_client) is False

    with patch.dict(os.environ, env):
        with caplog.at_level(logging.INFO, logger="diplomacy.telemetry"):
            asyncio.run(run_checks())

    events = _telemetry_events(caplog, "supabase_query")
    observed = [(e["operation"], e["outcome"], e["status_code"]) for e in events]
    assert observed == [
        ("save_game", "ok", 201),
        ("load_game", "ok", 200),
        ("load_game", "not_found", 200),
        ("load_game", "error", 503),
        ("load_press", "ok", 200),
        ("save_press", "ok", 200),
        ("save_press", "not_found", 200),
        ("save_press", "error", 500),
    ]
    assert all(e["latency_ms"] >= 0 for e in events)
    assert events[3]["severity"] == "WARNING"
    assert events[7]["severity"] == "WARNING"


def test_terraform_monitoring_and_dashboards_match_telemetry_schema():
    repo_root = Path(__file__).resolve().parents[3]
    monitoring_tf = (repo_root / "terraform" / "monitoring.tf").read_text(encoding="utf-8")
    dashboards_tf = (repo_root / "terraform" / "dashboards.tf").read_text(encoding="utf-8")

    expected_metrics = [
        "diplomacy_api_request_count",
        "diplomacy_api_request_latency_ms",
        "diplomacy_engine_adjudicate_latency_ms",
        "diplomacy_supabase_query_count",
        "diplomacy_supabase_query_latency_ms",
    ]
    for metric_res in expected_metrics:
        assert f'resource "google_logging_metric" "{metric_res}"' in monitoring_tf
        assert f"google_logging_metric.{metric_res}.name" in dashboards_tf

    for field in (
        'event_type=\\"api_request\\"',
        'event_type=\\"engine_adjudicate\\"',
        'event_type=\\"supabase_query\\"',
        "jsonPayload.latency_ms",
        "jsonPayload.route_key",
        "jsonPayload.endpoint",
        "jsonPayload.method",
        "jsonPayload.status_class",
        "jsonPayload.status_code",
        "jsonPayload.phase",
        "jsonPayload.operation",
        "jsonPayload.outcome",
    ):
        assert field in monitoring_tf

    for dash_res in ("api_endpoint_performance", "cloud_run_infrastructure", "engine_and_supabase"):
        assert f'resource "google_monitoring_dashboard" "{dash_res}"' in dashboards_tf

    # Verify HCL escaping for Cloud Monitoring legend templates (${...} must be escaped as $${...})
    assert "$${metric.label.route_key}" in dashboards_tf
    assert "run.googleapis.com/container/instance_count" in dashboards_tf
    assert "run.googleapis.com/container/startup_latencies" in dashboards_tf


def test_sync_gcp_monitoring_script_matches_schema():
    from scripts.sync_gcp_monitoring import build_dashboards, build_log_metrics

    metrics = build_log_metrics("diplomacy-1901")
    metric_names = {m["name"] for m in metrics}
    assert metric_names == {
        "diplomacy-1901_api_request_count",
        "diplomacy-1901_api_request_latency_ms",
        "diplomacy-1901_engine_adjudicate_latency_ms",
        "diplomacy-1901_supabase_query_count",
        "diplomacy-1901_supabase_query_latency_ms",
    }

    dashboards = build_dashboards("diplomacy-1901")
    assert len(dashboards) == 3
    assert [len(d["mosaicLayout"]["tiles"]) for d in dashboards] == [8, 8, 6]
    serialized = json.dumps(dashboards)
    for name in metric_names:
        assert f"logging.googleapis.com/user/{name}" in serialized
    assert "${metric.label.route_key}" in serialized
    assert "$${" not in serialized
