"""A game held in memory with no summary has no seats, owner or passcode on record. It fails closed.

`cache_loaded_game` and a half-finished create can leave one. The shared default board and a
member's private sandbox copy lack a summary by design, and keep working.
"""

import pytest
from storage.store import GAME_SUMMARIES, GAMES, PRIVATE_SANDBOXES, is_multiplayer_match
from tests.integration.security.helpers import (
    alice_headers,
    bob_headers,
    client,
    secret_plan_match,
)

pytestmark = pytest.mark.usefixtures("forget_games_made_by_test")


@pytest.fixture
def orphan() -> str:
    """Alice's match with its summary lost: her secret plan is still in memory."""
    gid = secret_plan_match()
    del GAME_SUMMARIES[gid]
    return gid


def test_orphan_counts_as_a_live_match_and_masks_orders(orphan):
    assert is_multiplayer_match(orphan)
    for headers in ({}, alice_headers(), bob_headers()):
        res = client.get(f"/api/game?game_id={orphan}", headers=headers)
        if res.status_code == 200:
            assert res.json()["orders"]["FRA_A_PAR"]["order_type"] == "HOLD"


def test_orphan_cannot_be_administered_by_anyone(orphan):
    for headers in ({}, alice_headers(), bob_headers()):
        for path, body in (
            (f"/api/adjudicate?game_id={orphan}", None),
            (f"/api/admin/rollback?game_id={orphan}", None),
            (
                f"/api/admin/set-turn?game_id={orphan}",
                {"season": "Fall", "year": 1901, "phase": "Movement"},
            ),
        ):
            res = client.post(path, json=body, headers=headers)
            assert res.status_code in (401, 403), (path, res.status_code)
    assert GAMES[orphan].season == "Spring"


def test_orphan_accepts_no_orders_or_finalize_for_any_power(orphan):
    for headers in ({}, alice_headers(), bob_headers()):
        res = client.post(
            f"/api/finalize?game_id={orphan}",
            json={"power": "FRANCE", "force": True},
            headers=headers,
        )
        assert res.status_code in (401, 403)
        res = client.post(
            f"/api/orders/batch?game_id={orphan}",
            json={"power": "FRANCE", "orders": []},
            headers=headers,
        )
        assert res.status_code in (401, 403)
    assert GAMES[orphan].finalized_powers == []


def test_default_board_and_private_sandboxes_keep_working_without_a_summary():
    assert client.get("/api/game?game_id=proto_1901").status_code == 200
    # The default board has no summary and is still open to its admin tools.
    moved = client.post(
        "/api/admin/set-turn?game_id=proto_1901",
        json={"season": "Spring", "year": 1901, "phase": "Movement"},
    )
    assert moved.status_code == 200

    gid = secret_plan_match()
    entered = client.post(
        f"/api/sandbox/enter?game_id={gid}", json={"power": "FRANCE"}, headers=alice_headers()
    )
    assert entered.status_code == 200, entered.text
    sbx = entered.json()["game_id"]
    assert sbx in PRIVATE_SANDBOXES and sbx not in GAME_SUMMARIES
    assert not is_multiplayer_match(sbx)
    assert client.get(f"/api/game?game_id={sbx}", headers=alice_headers()).status_code == 200
    # Bob has no seat in Alice's sandbox copy.
    assert client.get(f"/api/game?game_id={sbx}", headers=bob_headers()).status_code == 403
