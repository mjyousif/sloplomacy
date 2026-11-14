"""Integration tests for admin action audit logging, warning notifications, and turn history."""

from fastapi.testclient import TestClient
from main import app
from tests.integration.api.helpers import (
    _auth_headers,
    _seated_game,
    make_auth_headers,
)

client = TestClient(app)


def test_admin_unit_spawn_and_warning_acknowledgment():
    game_id = _seated_game()
    creator_headers = _auth_headers()

    # 1. Admin spawns an army in Ruh
    res = client.post(
        f"/api/admin/unit/spawn?game_id={game_id}",
        json={"power": "GERMANY", "unit_type": "A", "province": "RUH"},
        headers=creator_headers,
    )
    assert res.status_code == 200
    st = res.json()
    assert len(st["admin_log"]) == 1
    entry = st["admin_log"][0]
    assert "@" not in entry["actor"]
    assert entry["actor"] == "host"
    # Creator is already acknowledged
    assert "host" in entry["acknowledged_by"]

    # History contains the consolidated Admin phase
    history = client.get(f"/api/history?game_id={game_id}").json()
    assert len(history) == 1
    assert history[0]["phase"] == "Admin"
    assert history[0]["season"] == "Spring"

    # Turn record returns stored resolution with created piece
    record = client.get(f"/api/history/0?game_id={game_id}").json()
    assert record["phase"] == "Admin"
    assert any(
        "[ADMIN OVERRIDE] Spawned GERMANY A at RUH." in s for s in record["resolution"]["summary"]
    )
    assert "BUILD_GERMANY_RUH" in record["orders"]
    assert record["orders"]["BUILD_GERMANY_RUH"]["order_type"] == "BUILD"

    # 2. Player 2 (Bob) loads game and acknowledges the notification
    bob_headers = make_auth_headers("bob", "bob@test.com")
    ack_res = client.post(
        f"/api/admin/acknowledge?game_id={game_id}",
        json={"entry_ids": [entry["id"]]},
        headers=bob_headers,
    )
    assert ack_res.status_code == 200
    ack_data = ack_res.json()
    assert ack_data["ok"] is True
    assert ack_data["acknowledged_by"] == "bob"

    # Re-reading game state shows Bob has acknowledged
    game_res = client.get(f"/api/game?game_id={game_id}", headers=bob_headers).json()
    updated_entry = game_res["state"]["admin_log"][0]
    assert "bob" in updated_entry["acknowledged_by"]


def test_consecutive_admin_actions_consolidate_in_history():
    game_id = _seated_game()
    creator_headers = _auth_headers()

    # Action 1: Set ownership of BEL to FRANCE
    r1 = client.post(
        f"/api/admin/ownership?game_id={game_id}",
        json={"province": "BEL", "power": "FRANCE"},
        headers=creator_headers,
    )
    assert r1.status_code == 200

    # Action 2: Relocate GER_A_BER to SIL
    r2 = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        json={"unit_id": "GER_A_BER", "new_province": "SIL"},
        headers=creator_headers,
    )
    assert r2.status_code == 200

    # There should only be 1 history entry, consolidating both actions
    history = client.get(f"/api/history?game_id={game_id}").json()
    assert len(history) == 1
    assert history[0]["phase"] == "Admin"

    record = client.get(f"/api/history/0?game_id={game_id}").json()
    summary = record["resolution"]["summary"]
    assert len(summary) == 2
    assert any("Set ownership of BEL to FRANCE" in s for s in summary)
    assert any("Relocated GERMANY A from BER to SIL" in s for s in summary)


def test_admin_batch_board_edit_and_optimistic_concurrency_conflict():
    game_id = _seated_game()
    creator_headers = _auth_headers()

    initial = client.get(f"/api/game?game_id={game_id}", headers=creator_headers).json()["state"]
    initial_rev = initial["state_revision"]

    # Modify units (relocate GER_A_BER -> SYR, spawn FRA_F_NTH, remove ENG_F_LON) and ownership (BEL -> FRANCE)
    modified_units = []
    for u in initial["units"]:
        if u["id"] == "ENG_F_LON":
            continue
        if u["id"] == "GER_A_BER":
            modified_units.append({**u, "province": "SYR"})
        else:
            modified_units.append(u)
    modified_units.append(
        {"id": "FRA_F_NTH", "power": "FRANCE", "unit_type": "F", "province": "NTH", "coast": None}
    )
    modified_ownership = {**initial["ownership"], "BEL": "FRANCE"}

    res = client.post(
        f"/api/admin/board-edit?game_id={game_id}",
        json={
            "expected_revision": initial_rev,
            "expected_season": initial["season"],
            "expected_year": initial["year"],
            "expected_phase": initial["phase"],
            "units": modified_units,
            "ownership": modified_ownership,
        },
        headers=creator_headers,
    )
    assert res.status_code == 200
    updated = res.json()
    assert updated["state_revision"] > initial_rev
    assert updated["ownership"]["BEL"] == "FRANCE"
    assert any(u["id"] == "GER_A_BER" and u["province"] == "SYR" for u in updated["units"])
    assert any(u["id"] == "FRA_F_NTH" and u["province"] == "NTH" for u in updated["units"])
    assert not any(u["id"] == "ENG_F_LON" for u in updated["units"])

    # Submitting with stale expected_revision returns 409 Conflict
    conflict_res = client.post(
        f"/api/admin/board-edit?game_id={game_id}",
        json={
            "expected_revision": initial_rev,
            "expected_season": initial["season"],
            "expected_year": initial["year"],
            "expected_phase": initial["phase"],
            "units": modified_units,
            "ownership": modified_ownership,
        },
        headers=creator_headers,
    )
    assert conflict_res.status_code == 409
    assert "Board state changed" in conflict_res.json()["detail"]
