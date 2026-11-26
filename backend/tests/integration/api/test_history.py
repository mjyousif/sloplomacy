"""The turn history endpoints."""

import pytest
from fastapi.testclient import TestClient
from main import app
from storage.store import GAMES
from tests.integration.api.helpers import (
    _auth_headers,
    _finalize,
    _new_game,
    _order_payload,
    _seated_game,
)

pytestmark = pytest.mark.usefixtures("forget_games_made_by_test")

client = TestClient(app)


def _bounce_in_burgundy(game_id):
    """France and Germany both move into Burgundy, so both bounce."""
    _order = {
        "unit_id": "GER_A_MUN",
        "power": "GERMANY",
        "unit_type": "A",
        "origin": "MUN",
        "order_type": "MOVE",
        "target": "BUR",
        "is_explicit": True,
    }
    assert client.post(f"/api/order?game_id={game_id}", json={"order": _order}).status_code == 200
    assert (
        client.post(f"/api/order?game_id={game_id}", json={"order": _order_payload()}).status_code
        == 200
    )


def test_a_new_game_has_no_turn_history():
    game_id = _new_game()
    res = client.get(f"/api/history?game_id={game_id}")
    assert res.status_code == 200
    assert res.json() == []
    assert client.get(f"/api/history/0?game_id={game_id}").status_code == 404


def test_turn_history_shows_every_nations_orders_and_what_happened():
    game_id = _seated_game()
    _bounce_in_burgundy(game_id)
    _finalize(game_id, "FRANCE")
    _finalize(game_id, "GERMANY")
    assert GAMES[game_id].season == "Fall"

    entries = client.get(f"/api/history?game_id={game_id}").json()
    assert entries == [{"index": 0, "season": "Spring", "year": 1901, "phase": "Movement"}]

    turn = client.get(f"/api/history/0?game_id={game_id}").json()
    assert turn["season"] == "Spring"
    assert turn["orders"]["FRA_A_PAR"]["target"] == "BUR"
    assert turn["orders"]["GER_A_MUN"]["target"] == "BUR"
    # The board is the one the turn began with.
    assert next(u for u in turn["units"] if u["id"] == "FRA_A_PAR")["province"] == "PAR"
    for unit_id in ("FRA_A_PAR", "GER_A_MUN"):
        res = turn["resolution"]["resolutions"][unit_id]
        assert res["succeeded"] is False
        assert res["bounced"] is True
    # Only what a past turn needs leaves the server.
    assert "timer" not in turn
    assert "turn_history" not in turn
    assert "finalized_powers" not in turn


def test_turn_history_follows_a_rollback():
    game_id = _seated_game()
    client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers())
    assert len(client.get(f"/api/history?game_id={game_id}").json()) == 1

    client.post(f"/api/admin/rollback?game_id={game_id}", headers=_auth_headers())

    assert client.get(f"/api/history?game_id={game_id}").json() == []


def test_turn_history_of_an_unknown_game_is_not_found():
    assert client.get("/api/history?game_id=ghost_game_9999").status_code == 404
    assert client.get("/api/history/stats?game_id=ghost_game_9999").status_code == 404


def test_history_stats_aggregates_resolved_turns_and_ignores_live_orders():
    game_id = _seated_game()
    _bounce_in_burgundy(game_id)
    _finalize(game_id, "FRANCE")
    _finalize(game_id, "GERMANY")
    assert GAMES[game_id].season == "Fall"

    # Submit a live Fall order that has NOT resolved yet.
    assert (
        client.post(
            f"/api/order?game_id={game_id}",
            json={"order": _order_payload(target="PIC")},
            headers=_auth_headers(),
        ).status_code
        == 200
    )

    res = client.get(f"/api/history/stats?game_id={game_id}")
    assert res.status_code == 200
    stats = res.json()
    assert stats["game_id"] == game_id
    assert stats["turns_resolved"] == 1
    assert stats["powers"]["FRANCE"]["moves_bounced"] == 1
    assert stats["powers"]["FRANCE"]["moves_succeeded"] == 0
    assert stats["powers"]["GERMANY"]["moves_bounced"] == 1
    assert stats["powers"]["GERMANY"]["player_name"] == "Bob"
    assert len(stats["sc_timeline"]) == 2


def test_history_stats_counts_press_only_after_game_over():
    from domain.board import Power
    from domain.press import PressMessage
    from storage.press import add_press

    game_id = _seated_game()
    add_press(
        game_id,
        PressMessage(
            id="m1",
            seq=1,
            sender=Power.FRANCE,
            anonymous=False,
            recipients=[],
            body="Public",
            sent_at="2026-11-15T00:00:00+00:00",
            season="Spring",
            year=1901,
            phase="Movement",
        ),
    )
    add_press(
        game_id,
        PressMessage(
            id="m2",
            seq=2,
            sender=Power.GERMANY,
            anonymous=True,
            recipients=[Power.FRANCE],
            body="Secret",
            sent_at="2026-11-15T00:01:00+00:00",
            season="Spring",
            year=1901,
            phase="Movement",
        ),
    )
    add_press(
        game_id,
        PressMessage(
            id="m3",
            seq=3,
            sender=Power.GERMANY,
            anonymous=False,
            recipients=[],
            body="Public 2",
            sent_at="2026-11-15T00:02:00+00:00",
            season="Spring",
            year=1901,
            phase="Movement",
        ),
    )

    # Mid-game: press counts are not exposed.
    mid = client.get(f"/api/history/stats?game_id={game_id}").json()
    assert mid["powers"]["FRANCE"]["press_messages_sent"] == 0
    assert mid["powers"]["GERMANY"]["press_messages_sent"] == 0
    assert all(a["id"] != "silver_tongue" for a in mid["awards"])

    # After game over: all press (public + private + anonymous) is counted for Silver Tongue.
    GAMES[game_id].winner = Power.FRANCE
    end = client.get(f"/api/history/stats?game_id={game_id}").json()
    assert end["powers"]["FRANCE"]["press_messages_sent"] == 1
    assert end["powers"]["GERMANY"]["press_messages_sent"] == 2
    award = next((a for a in end["awards"] if a["id"] == "silver_tongue"), None)
    assert award is not None
    assert award["power"] == "GERMANY"
    assert award["count"] == 2


def test_history_and_stats_keep_full_35_turn_campaign_without_30_phase_cap():
    game_id = _seated_game()
    # Turn 0: record an explicit bounce in BUR so we verify turn-0 stats are never dropped.
    assert (
        client.post(
            f"/api/order?game_id={game_id}",
            json={
                "order": {
                    "unit_id": "FRA_A_PAR",
                    "power": "FRANCE",
                    "unit_type": "A",
                    "origin": "PAR",
                    "order_type": "MOVE",
                    "target": "BUR",
                }
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/order?game_id={game_id}",
            json={
                "order": {
                    "unit_id": "GER_A_MUN",
                    "power": "GERMANY",
                    "unit_type": "A",
                    "origin": "MUN",
                    "order_type": "MOVE",
                    "target": "BUR",
                }
            },
        ).status_code
        == 200
    )

    for _ in range(35):
        _finalize(game_id, "FRANCE")
        _finalize(game_id, "GERMANY")

    entries = client.get(f"/api/history?game_id={game_id}").json()
    assert len(entries) == 35
    assert (entries[0]["index"], entries[0]["season"], entries[0]["year"]) == (0, "Spring", 1901)

    turn0 = client.get(f"/api/history/0?game_id={game_id}").json()
    assert turn0["season"] == "Spring"
    assert turn0["year"] == 1901

    stats = client.get(f"/api/history/stats?game_id={game_id}").json()
    assert stats["turns_resolved"] == 35
    assert len(stats["sc_timeline"]) == 36
    assert stats["powers"]["FRANCE"]["moves_bounced"] == 1
    assert stats["powers"]["GERMANY"]["moves_bounced"] == 1


def test_history_stats_cache_hits_and_invalidates_on_turn_advance(monkeypatch):
    from unittest.mock import MagicMock

    import api.history as history_api
    from domain.board import Power

    game_id = _seated_game()
    _finalize(game_id, "FRANCE")
    _finalize(game_id, "GERMANY")

    real_compute = history_api.compute_campaign_stats
    spy = MagicMock(side_effect=real_compute)
    monkeypatch.setattr(history_api, "compute_campaign_stats", spy)

    first = client.get(f"/api/history/stats?game_id={game_id}")
    second = client.get(f"/api/history/stats?game_id={game_id}")
    assert first.status_code == 200 and second.status_code == 200
    assert spy.call_count == 1
    assert second.json()["turns_resolved"] == 1

    # Advancing another turn invalidates the cache key.
    _finalize(game_id, "FRANCE")
    _finalize(game_id, "GERMANY")
    third = client.get(f"/api/history/stats?game_id={game_id}")
    assert third.status_code == 200
    assert spy.call_count == 2
    assert third.json()["turns_resolved"] == 2

    # Game completion also invalidates so post-game press counts appear immediately.
    GAMES[game_id].winner = Power.FRANCE
    fourth = client.get(f"/api/history/stats?game_id={game_id}")
    assert fourth.status_code == 200
    assert spy.call_count == 3
