"""Email privacy: neither emails nor email local-parts ever leak in lobby, game, admin, history, or socket payloads."""

import json
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
from main import app
from storage.profiles import PROFILE_NAMES
from tests.integration.api.helpers import direct_edit
from tests.integration.security.helpers import auth_headers, make_jwt, socket_state
from tests.ws_testing import receive_json

client = TestClient(app)


def _assert_no_email_leaks(payload_text: str, *emails: str) -> None:
    lowered = payload_text.lower()
    for addr in emails:
        assert addr.lower() not in lowered
        local_part = addr.split("@", 1)[0].lower()
        assert local_part not in lowered


def test_emails_and_local_parts_are_never_exposed_in_lobby_game_admin_history_or_sockets(
    monkeypatch,
):
    monkeypatch.setattr(
        "storage.supabase.upsert_profile_display_name", AsyncMock(return_value=True)
    )

    alice_id = "00000000-0000-0000-0000-00000000e101"
    bob_id = "00000000-0000-0000-0000-00000000e102"
    alice_email = "alice.secret@example.com"
    bob_email = "bob.secret@example.com"
    alice_hdrs = auth_headers(alice_id, alice_email)
    bob_hdrs = auth_headers(bob_id, bob_email)

    PROFILE_NAMES.pop(alice_id, None)
    PROFILE_NAMES.pop(bob_id, None)
    try:
        # 1. With NO profile rows yet, UUID users default strictly to "Envoy" (never email local-part)
        create_res = client.post(
            "/api/games",
            json={
                "name": "Email Privacy Match",
                "creator_power": "FRANCE",
                "user_id": alice_id,
                "email": alice_email,
                "is_private": False,
            },
            headers=alice_hdrs,
        )
        assert create_res.status_code == 200
        _assert_no_email_leaks(create_res.text, alice_email)
        assert create_res.json()["created_by"] == "Envoy"
        gid = create_res.json()["game_id"]

        join_res = client.post(
            f"/api/games/{gid}/join",
            json={
                "power": "GERMANY",
                "user_id": bob_id,
                "email": bob_email,
            },
            headers=bob_hdrs,
        )
        assert join_res.status_code == 200
        _assert_no_email_leaks(join_res.text, alice_email, bob_email)
        assert join_res.json()["summary"]["participants"]["GERMANY"]["display_name"] == "Envoy"

        # 2. Admin actions with no profile must also emit "Envoy", never email local-part
        spawn_res = direct_edit(gid, alice_hdrs, place=[("ITALY", "A", "ROM")])
        assert spawn_res.status_code == 200
        _assert_no_email_leaks(spawn_res.text, alice_email, bob_email)
        assert spawn_res.json()["admin_log"][0]["actor"] == "Envoy"

        set_turn_res = client.post(
            f"/api/admin/set-turn?game_id={gid}",
            json={"season": "Fall", "year": 1901, "phase": "Movement"},
            headers=alice_hdrs,
        )
        assert set_turn_res.status_code == 200
        _assert_no_email_leaks(set_turn_res.text, alice_email, bob_email)
        assert set_turn_res.json()["admin_log"][-1]["actor"] == "Envoy"

        rb_res = client.post(f"/api/admin/rollback?game_id={gid}", headers=alice_hdrs)
        assert rb_res.status_code == 200
        _assert_no_email_leaks(rb_res.text, alice_email, bob_email)
        assert rb_res.json()["admin_log"][-1]["actor"] == "Envoy"

        # 3. Setting usernames in profiles updates all views via UUID lookup
        assert (
            client.patch(
                "/api/account/profile",
                json={"display_name": "GeneralAlice"},
                headers=alice_hdrs,
            ).status_code
            == 200
        )
        assert (
            client.patch(
                "/api/account/profile",
                json={"display_name": "KaiserBob"},
                headers=bob_hdrs,
            ).status_code
            == 200
        )

        # Public lobby endpoints
        games_res = client.get("/api/games")
        assert games_res.status_code == 200
        _assert_no_email_leaks(games_res.text, alice_email, bob_email)

        browse_res = client.get("/api/games/browse?seats=all")
        assert browse_res.status_code == 200
        _assert_no_email_leaks(browse_res.text, alice_email, bob_email)

        details_res = client.get(f"/api/games/{gid}")
        assert details_res.status_code == 200
        _assert_no_email_leaks(details_res.text, alice_email, bob_email)
        assert details_res.json()["created_by"] == "GeneralAlice"

        # Bob's own games list, game state, & campaign stats
        mine_res = client.get("/api/games/mine", headers=bob_hdrs)
        assert mine_res.status_code == 200
        _assert_no_email_leaks(mine_res.text, alice_email, bob_email)

        game_res = client.get(f"/api/game?game_id={gid}", headers=bob_hdrs)
        assert game_res.status_code == 200
        _assert_no_email_leaks(game_res.text, alice_email, bob_email)
        assert game_res.json()["state"]["admin_log"][0]["actor"] == "GeneralAlice"

        stats_res = client.get(f"/api/history/stats?game_id={gid}", headers=bob_hdrs)
        assert stats_res.status_code == 200
        _assert_no_email_leaks(stats_res.text, alice_email, bob_email)
        assert stats_res.json()["powers"]["FRANCE"]["player_name"] == "GeneralAlice"
        assert stats_res.json()["powers"]["GERMANY"]["player_name"] == "KaiserBob"

        # Admin status & denied error
        status_res = client.get(f"/api/admin/status?game_id={gid}", headers=bob_hdrs)
        assert status_res.status_code == 200
        _assert_no_email_leaks(status_res.text, alice_email, bob_email)

        denied_res = direct_edit(gid, bob_hdrs, place=[("ITALY", "A", "VEN")])
        assert denied_res.status_code == 403
        _assert_no_email_leaks(denied_res.text, alice_email, bob_email)

        # WebSockets: /ws/lobby and /ws/games/{gid}
        with client.websocket_connect("/ws/lobby") as ws_lobby:
            lobby_payload = json.dumps(receive_json(ws_lobby))
            _assert_no_email_leaks(lobby_payload, alice_email, bob_email)

        ws_game = socket_state(f"/ws/games/{gid}?handshake=1", token=make_jwt(bob_id, bob_email))
        game_payload = json.dumps(ws_game)
        _assert_no_email_leaks(game_payload, alice_email, bob_email)

        # Acknowledge game over returns sanitized summary without emails or board preview
        from domain.board import Power
        from storage.store import GAME_SUMMARIES, GAMES

        GAMES[gid].winner = Power.FRANCE
        GAME_SUMMARIES[gid].status = "completed"
        GAME_SUMMARIES[gid].winner = Power.FRANCE
        ack_res = client.post(f"/api/games/{gid}/acknowledge-game-over", headers=bob_hdrs)
        assert ack_res.status_code == 200
        _assert_no_email_leaks(ack_res.text, alice_email, bob_email)
        ack_summary = ack_res.json()["summary"]
        assert ack_summary["board"] is None
        assert ack_summary["created_by"] == "GeneralAlice"
        assert ack_summary["participants"]["FRANCE"]["display_name"] == "GeneralAlice"
        assert ack_summary["participants"]["GERMANY"]["display_name"] == "KaiserBob"
    finally:
        PROFILE_NAMES.pop(alice_id, None)
        PROFILE_NAMES.pop(bob_id, None)
