"""Integration tests for game-over guardrails, lobby exclusion, and witness tracking."""

import asyncio

from api.turns import _execute_adjudication
from domain.board import Power
from domain.game_state import PhaseTimer, TimerStage
from storage.store import GAME_SUMMARIES, GAMES
from tests.integration.api.helpers import (
    _auth_headers,
    _new_game,
    _order_payload,
    _put_game_one_center_from_a_solo,
    client,
)


def _join_second_player(game_id: str, power: str = "ENGLAND", user_id: str = "bob"):
    res = client.post(
        f"/api/games/{game_id}/join",
        json={
            "power": power,
            "user_id": user_id,
            "email": f"{user_id}@test.com",
            "display_name": user_id.title(),
        },
        headers=_auth_headers(user_id, f"{user_id}@test.com"),
    )
    assert res.status_code == 200


async def _win_game(game_id: str) -> None:
    _put_game_one_center_from_a_solo(game_id)
    game = GAMES[game_id]
    game.timer = PhaseTimer(
        duration_seconds=3600,
        stage=TimerStage.RUNNING,
        players=[Power.FRANCE, Power.ENGLAND],
        deadline=9999999999.0,
    )
    await _execute_adjudication(game)


def test_acknowledge_game_over_requires_concluded_game():
    gid = _new_game()
    res = client.post(
        f"/api/games/{gid}/acknowledge-game-over",
        headers=_auth_headers("host", "host@test.com"),
    )
    assert res.status_code == 409


def test_game_over_clears_timer_hides_from_public_lobby_and_rejects_orders():
    gid = _new_game()
    _join_second_player(gid, "ENGLAND", "bob")
    asyncio.run(_win_game(gid))

    game = GAMES[gid]
    summary = GAME_SUMMARIES[gid]
    assert game.winner == Power.FRANCE
    assert game.timer is None
    assert summary.status == "completed"
    assert summary.winner == Power.FRANCE
    assert summary.completed_at is not None

    # Excluded from public lobby listings
    pub = client.get("/api/games").json()
    assert all(g["game_id"] != gid for g in pub)

    browse = client.get("/api/games/browse?seats=all").json()
    assert all(g["game_id"] != gid for g in browse["games"])

    # Order and finalization mutations rejected with 409
    host_headers = _auth_headers("host", "host@test.com")
    assert (
        client.post(
            f"/api/order?game_id={gid}",
            json={"order": _order_payload()},
            headers=host_headers,
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/orders/batch?game_id={gid}",
            json={"power": "FRANCE", "orders": [_order_payload()]},
            headers=host_headers,
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/orders/confirm-all?game_id={gid}",
            json={"power": "FRANCE"},
            headers=host_headers,
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/finalize?game_id={gid}",
            json={"power": "FRANCE", "force": True},
            headers=host_headers,
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/unfinalize?game_id={gid}",
            json={"power": "FRANCE"},
            headers=host_headers,
        ).status_code
        == 409
    )


def test_acknowledge_game_over_auth_and_per_participant_witness():
    gid = _new_game()
    _join_second_player(gid, "ENGLAND", "bob")
    asyncio.run(_win_game(gid))

    # Unauthenticated caller rejected
    assert client.post(f"/api/games/{gid}/acknowledge-game-over").status_code == 401

    # Non-participant rejected
    outsider_headers = _auth_headers("outsider", "outsider@test.com")
    assert (
        client.post(
            f"/api/games/{gid}/acknowledge-game-over",
            headers=outsider_headers,
        ).status_code
        == 403
    )

    # Host (France) acknowledges; Bob (England) remains unwitnessed
    host_res = client.post(
        f"/api/games/{gid}/acknowledge-game-over",
        headers=_auth_headers("host", "host@test.com"),
    )
    assert host_res.status_code == 200
    host_seen_at = host_res.json()["game_over_seen_at"]
    assert host_seen_at is not None

    summary = GAME_SUMMARIES[gid]
    assert summary.participants["FRANCE"].game_over_seen_at == host_seen_at
    assert summary.participants["ENGLAND"].game_over_seen_at is None

    # Re-acknowledging preserves the original witness timestamp
    host_res_2 = client.post(
        f"/api/games/{gid}/acknowledge-game-over",
        headers=_auth_headers("host", "host@test.com"),
    )
    assert host_res_2.status_code == 200
    assert host_res_2.json()["game_over_seen_at"] == host_seen_at

    # Bob acknowledges independently
    bob_res = client.post(
        f"/api/games/{gid}/acknowledge-game-over",
        headers=_auth_headers("bob", "bob@test.com"),
    )
    assert bob_res.status_code == 200
    assert summary.participants["ENGLAND"].game_over_seen_at is not None
