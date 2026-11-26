"""Live unmocked FastAPI <-> PostgREST <-> PostgreSQL round-trip integration tests.

Automatically skipped unless `TEST_POSTGREST_URL` is set (e.g. in CI `test-migrations` or
against a local Docker PostgreSQL + PostgREST instance).
"""

import asyncio
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote

import httpx
import jwt
import pytest
from fastapi.testclient import TestClient
from main import app
from storage.phases import (
    GAME_HISTORY_LOADED,
    clear_phase_tracking,
)
from storage.press import clear_press_tracking
from storage.store import (
    GAMES,
    evict_game,
)
from storage.supabase import GAME_DB_IDS
from storage.supabase_http import close_http_client

POSTGREST_URL = os.getenv("TEST_POSTGREST_URL", "").strip().rstrip("/")
POSTGREST_JWT_SECRET = os.getenv(
    "TEST_POSTGREST_JWT_SECRET", "benchmark-secret-key-at-least-32-bytes-long"
)

pytestmark = pytest.mark.skipif(
    not POSTGREST_URL,
    reason="TEST_POSTGREST_URL is not set; skipping live PostgREST integration test.",
)

HOST = {"user_id": "live_host", "email": "live_host@example.com", "display_name": "Live Host"}
BOB = {"user_id": "live_bob", "email": "live_bob@example.com", "display_name": "Live Bob"}
CAL = {"user_id": "live_cal", "email": "live_cal@example.com", "display_name": "Live Cal"}
DAN = {"user_id": "live_dan", "email": "live_dan@example.com", "display_name": "Live Dan"}


def _sign_postgrest_jwt(role: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {"role": role, "iss": "supabase", "iat": now, "exp": now + 3600},
        POSTGREST_JWT_SECRET,
        algorithm="HS256",
    )


def _rollback_headers(user_id: str = HOST["user_id"], email: str = HOST["email"]) -> dict[str, str]:
    secret = os.getenv("SUPABASE_JWT_SECRET", "test-secret-at-least-32-chars-long-12345")
    token = jwt.encode(
        {"sub": user_id, "email": email, "aud": "authenticated"},
        secret,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def _start_rest_v1_proxy(target_base: str) -> tuple[ThreadingHTTPServer, threading.Thread]:
    """Forward `/rest/v1/...` calls from `storage.supabase` to bare PostgREST `/...`."""
    proxy_http = httpx.Client(timeout=15.0)
    skip_req_headers = {"host", "content-length", "connection", "transfer-encoding"}
    skip_resp_headers = {"transfer-encoding", "connection", "content-encoding"}

    class Handler(BaseHTTPRequestHandler):
        def _forward(self, method: str) -> None:
            upstream_path = self.path
            if upstream_path.startswith("/rest/v1"):
                upstream_path = upstream_path[len("/rest/v1") :] or "/"
            url = f"{target_base}{upstream_path}"
            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length) if length > 0 else b""
            fwd_headers = {
                k: v for k, v in self.headers.items() if k.lower() not in skip_req_headers
            }
            resp = proxy_http.request(method, url, headers=fwd_headers, content=body or None)
            self.send_response(resp.status_code)
            for k, v in resp.headers.items():
                if k.lower() not in skip_resp_headers:
                    self.send_header(k, v)
            self.end_headers()
            if resp.content:
                self.wfile.write(resp.content)

        def do_GET(self) -> None:  # noqa: N802
            self._forward("GET")

        def do_POST(self) -> None:  # noqa: N802
            self._forward("POST")

        def do_PATCH(self) -> None:  # noqa: N802
            self._forward("PATCH")

        def do_DELETE(self) -> None:  # noqa: N802
            self._forward("DELETE")

        def log_message(self, format: str, *args) -> None:  # noqa: A002
            del format, args

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


@pytest.fixture
def live_postgrest():
    server, _thread = _start_rest_v1_proxy(POSTGREST_URL)
    port = server.server_address[1]
    service_jwt = _sign_postgrest_jwt("service_role")
    anon_jwt = _sign_postgrest_jwt("anon")

    prev_url = os.environ.get("SUPABASE_URL")
    prev_key = os.environ.get("SUPABASE_KEY")
    os.environ["SUPABASE_URL"] = f"http://127.0.0.1:{port}"
    os.environ["SUPABASE_KEY"] = service_jwt
    asyncio.run(close_http_client())
    created_games: list[str] = []

    try:
        yield {
            "client": TestClient(app),
            "postgrest_url": POSTGREST_URL,
            "service_headers": {
                "apikey": service_jwt,
                "Authorization": f"Bearer {service_jwt}",
            },
            "anon_headers": {
                "apikey": anon_jwt,
                "Authorization": f"Bearer {anon_jwt}",
            },
            "created_games": created_games,
        }
    finally:
        for gid in created_games:
            try:
                TestClient(app).delete(f"/api/games/{gid}", headers=_rollback_headers())
            except Exception as ex:
                print(f"Cleanup delete failed for {gid}: {ex}")
            evict_game(gid)
            clear_phase_tracking(gid)
            clear_press_tracking(gid)
        asyncio.run(close_http_client())
        if prev_url is None:
            os.environ.pop("SUPABASE_URL", None)
        else:
            os.environ["SUPABASE_URL"] = prev_url
        if prev_key is None:
            os.environ.pop("SUPABASE_KEY", None)
        else:
            os.environ["SUPABASE_KEY"] = prev_key
        server.shutdown()
        server.server_close()


def _finalize_powers(api: TestClient, gid: str, powers: tuple[str, ...]) -> None:
    for power in powers:
        res = api.post(f"/api/finalize?game_id={gid}", json={"power": power, "force": True})
        assert res.status_code == 200, res.text


def test_full_normalized_lifecycle_against_live_postgrest(live_postgrest):
    api: TestClient = live_postgrest["client"]
    pg_url: str = live_postgrest["postgrest_url"]
    svc_headers: dict[str, str] = live_postgrest["service_headers"]
    anon_headers: dict[str, str] = live_postgrest["anon_headers"]

    # 1. Create a public match & join 2 more powers, verifying embedded lobby serialization.
    create_res = api.post(
        "/api/games",
        json={"name": "Live PostgREST Match", "creator_power": "FRANCE", **HOST},
    )
    assert create_res.status_code == 200, create_res.text
    gid = create_res.json()["game_id"]
    live_postgrest["created_games"].append(gid)
    db_id = GAME_DB_IDS.get(gid)
    assert db_id is not None

    assert api.post(f"/api/games/{gid}/join", json={"power": "GERMANY", **BOB}).status_code == 200
    assert api.post(f"/api/games/{gid}/join", json={"power": "RUSSIA", **CAL}).status_code == 200

    # Force a fresh DB lobby sync read after eviction and confirm virtual columns + participants round-trip.
    evict_game(gid)
    lobby_rows = {g["game_id"]: g for g in api.get("/api/games").json()}
    assert gid in lobby_rows
    assert lobby_rows[gid]["has_passcode"] is False
    assert lobby_rows[gid]["board"] is None
    assert sorted(lobby_rows[gid]["participants"]) == ["FRANCE", "GERMANY", "RUSSIA"]

    mine_rows = {
        g["game_id"]: g for g in api.get("/api/games/mine", headers=_rollback_headers()).json()
    }
    assert gid in mine_rows
    assert mine_rows[gid]["board"] is not None
    assert len(mine_rows[gid]["board"]["units"]) > 0
    # Bring the game back into memory before continuing.
    assert api.get(f"/api/game?game_id={gid}").status_code == 200

    # 2. Resolve 36 turns (> old 30-phase cap) and verifyPostgres rows & current_phase_index.
    api.post(
        f"/api/order?game_id={gid}",
        json={
            "order": {
                "unit_id": "FRA_A_PAR",
                "power": "FRANCE",
                "unit_type": "A",
                "origin": "PAR",
                "order_type": "MOVE",
                "target": "BUR",
                "is_explicit": True,
            }
        },
    )
    for _ in range(36):
        _finalize_powers(api, gid, ("FRANCE", "GERMANY", "RUSSIA"))

    with httpx.Client(timeout=10.0) as raw:
        phase_rows = raw.get(
            f"{pg_url}/game_phases?game_id=eq.{quote(db_id, safe='')}&select=phase_index&order=phase_index.asc",
            headers=svc_headers,
        )
        assert phase_rows.status_code == 200, phase_rows.text
        assert [r["phase_index"] for r in phase_rows.json()] == list(range(36))

        game_row = raw.get(
            f"{pg_url}/multiplayer_games?id=eq.{quote(db_id, safe='')}&select=current_phase_index,game_type",
            headers=svc_headers,
        ).json()[0]
        assert game_row["current_phase_index"] == 36
        assert game_row["game_type"] == "PUBLIC"

    # 3. Cold start: evict memory, load live board lazily, then advance turn 37 -> index 36.
    evict_game(gid)
    assert api.get(f"/api/game?game_id={gid}").status_code == 200
    assert gid not in GAME_HISTORY_LOADED

    _finalize_powers(api, gid, ("FRANCE", "GERMANY", "RUSSIA"))
    with httpx.Client(timeout=10.0) as raw:
        phase_rows = raw.get(
            f"{pg_url}/game_phases?game_id=eq.{quote(db_id, safe='')}&select=phase_index&order=phase_index.asc",
            headers=svc_headers,
        ).json()
        assert [r["phase_index"] for r in phase_rows] == list(range(37))

    # 4. History list, turn-0 snapshot, and War Ledger stats across all 37 phases.
    hist = api.get(f"/api/history?game_id={gid}").json()
    assert len(hist) == 37
    turn0 = api.get(f"/api/history/0?game_id={gid}").json()
    assert (turn0["season"], turn0["year"]) == ("Spring", 1901)
    assert turn0["orders"]["FRA_A_PAR"]["target"] == "BUR"

    stats = api.get(f"/api/history/stats?game_id={gid}").json()
    assert stats["turns_resolved"] == 37
    assert len(stats["sc_timeline"]) == 38

    # 5. Rollback to turn 35 -> deletes Postgres game_phases >= 35 and updates index.
    rb = api.post(
        f"/api/admin/rollback?game_id={gid}",
        json={"snapshot_index": 35},
        headers=_rollback_headers(),
    )
    assert rb.status_code == 200, rb.text
    with httpx.Client(timeout=10.0) as raw:
        phase_rows = raw.get(
            f"{pg_url}/game_phases?game_id=eq.{quote(db_id, safe='')}&select=phase_index&order=phase_index.asc",
            headers=svc_headers,
        ).json()
        assert [r["phase_index"] for r in phase_rows] == list(range(35))
        g_meta = raw.get(
            f"{pg_url}/multiplayer_games?id=eq.{quote(db_id, safe='')}&select=current_phase_index",
            headers=svc_headers,
        ).json()[0]
        assert g_meta["current_phase_index"] == 35

    # 6. Soft-leave: Bob surrenders & leaves, then Dan claims GERMANY -> 2 rows, 1 active.
    assert (
        api.post(
            f"/api/games/{gid}/surrender", json={"power": "GERMANY", "leave": True, **BOB}
        ).status_code
        == 200
    )
    assert api.post(f"/api/games/{gid}/join", json={"power": "GERMANY", **DAN}).status_code == 200

    with httpx.Client(timeout=10.0) as raw:
        ger_rows = raw.get(
            f"{pg_url}/game_participants?game_id=eq.{quote(db_id, safe='')}&power=eq.GERMANY&order=joined_at.asc",
            headers=svc_headers,
        ).json()
        assert len(ger_rows) == 2
        former = next(r for r in ger_rows if r["guest_id"] == BOB["user_id"])
        active = next(r for r in ger_rows if r["guest_id"] == DAN["user_id"])
        assert former["left_at"] is not None
        assert former["left_phase_index"] == 35
        assert former["surrendered"] is True
        assert active["left_at"] is None
        assert active["joined_phase_index"] == 35

    # 7. Press threads & messages round-trip across container eviction.
    assert (
        api.post(
            f"/api/press?game_id={gid}",
            json={"power": "FRANCE", "body": "Public wire", "recipients": []},
        ).status_code
        == 200
    )
    assert (
        api.post(
            f"/api/press?game_id={gid}",
            json={
                "power": "FRANCE",
                "body": "Signed suggestion",
                "recipients": ["GERMANY"],
                "orders": [
                    {
                        "unit_id": "GER_A_MUN",
                        "power": "GERMANY",
                        "unit_type": "A",
                        "origin": "MUN",
                        "order_type": "HOLD",
                    }
                ],
            },
        ).status_code
        == 200
    )
    assert (
        api.post(
            f"/api/press?game_id={gid}",
            json={
                "power": "FRANCE",
                "body": "Anonymous DM",
                "recipients": ["GERMANY"],
                "anonymous": True,
            },
        ).status_code
        == 200
    )
    assert (
        api.post(
            f"/api/press?game_id={gid}",
            json={
                "power": "FRANCE",
                "body": "Anonymous coalition",
                "recipients": ["GERMANY", "RUSSIA"],
                "anonymous": True,
            },
        ).status_code
        == 200
    )

    evict_game(gid)
    ger_press = api.get(f"/api/press?game_id={gid}&power=GERMANY").json()["messages"]
    assert [m["body"] for m in ger_press] == [
        "Public wire",
        "Signed suggestion",
        "Anonymous DM",
        "Anonymous coalition",
    ]
    assert ger_press[1]["sender"] == "FRANCE"
    assert len(ger_press[1]["orders"]) == 1
    assert ger_press[2]["sender"] is None and ger_press[2]["anonymous"] is True
    assert ger_press[3]["sender"] is None and ger_press[3]["anonymous"] is True

    # 8. Anon JWT cannot read any game, participant, phase, or press table directly.
    with httpx.Client(timeout=10.0) as raw:
        for table in (
            "multiplayer_games",
            "game_participants",
            "game_phases",
            "press_threads",
            "press_thread_members",
            "press_messages",
        ):
            r = raw.get(f"{pg_url}/{table}?limit=5", headers=anon_headers)
            assert r.status_code in (401, 403) or r.json() == []

    # 9. DELETE game cascades cleanly across all child tables.
    del_res = api.delete(f"/api/games/{gid}", headers=_rollback_headers())
    assert del_res.status_code == 200
    assert gid not in GAMES

    with httpx.Client(timeout=10.0) as raw:
        for table, fk in (
            ("multiplayer_games", "id"),
            ("game_participants", "game_id"),
            ("game_phases", "game_id"),
            ("press_threads", "game_id"),
            ("press_messages", "game_id"),
        ):
            rem = raw.get(
                f"{pg_url}/{table}?{fk}=eq.{quote(db_id, safe='')}&limit=1",
                headers=svc_headers,
            ).json()
            assert rem == [], f"Expected {table} rows deleted via cascade, found {rem!r}"
