"""Integration tests for admin action audit logging, warning notifications, and turn history."""

from fastapi.testclient import TestClient
from main import app
from tests.integration.api.helpers import (
    _auth_headers,
    _seated_game,
    direct_edit,
    make_auth_headers,
)

client = TestClient(app)


def test_admin_direct_edit_and_warning_acknowledgment():
    game_id = _seated_game()
    creator_headers = _auth_headers()

    # 1. Admin places an army in Ruh
    res = direct_edit(
        game_id,
        creator_headers,
        place=[("GERMANY", "A", "RUH")],
        summary_lines=["Spawned GERMANY A at RUH."],
    )
    assert res.status_code == 200
    st = res.json()
    assert len(st["admin_log"]) == 1
    entry = st["admin_log"][0]
    assert "@" not in entry["actor"]
    assert entry["actor"] == "Envoy"
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
    assert any(u["id"] == "GER_A_RUH" for u in st["units"])

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
    r1 = direct_edit(
        game_id,
        creator_headers,
        owners={"BEL": "FRANCE"},
        summary_lines=["Set ownership of BEL to FRANCE."],
    )
    assert r1.status_code == 200

    # Action 2: Relocate GER_A_BER to SIL
    r2 = direct_edit(
        game_id,
        creator_headers,
        moves={"GER_A_BER": "SIL"},
        summary_lines=["Relocated GERMANY A from BER to SIL."],
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
    initial_rev = initial["board_revision"]
    initial_state_rev = initial["state_revision"]

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
    assert updated["board_revision"] > initial_rev
    assert updated["state_revision"] > initial_state_rev
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


def test_board_edit_succeeds_after_concurrent_orders_and_finalization_preserving_orders():
    from domain.orders import OrderType
    from storage.store import GAMES

    game_id = _seated_game()
    creator_headers = _auth_headers()
    bob_headers = make_auth_headers("bob", "bob@test.com")

    # 1. Host opens Direct-Edit and snapshots initial board_revision
    initial = client.get(f"/api/game?game_id={game_id}", headers=creator_headers).json()["state"]
    initial_board_rev = initial["board_revision"]
    initial_state_rev = initial["state_revision"]

    # 2. Bob submits an order and finalizes; France also submits orders
    assert (
        client.post(
            f"/api/order?game_id={game_id}",
            json={
                "order": {
                    "unit_id": "GER_A_BER",
                    "power": "GERMANY",
                    "unit_type": "A",
                    "origin": "BER",
                    "order_type": "MOVE",
                    "target": "SIL",
                    "is_explicit": True,
                }
            },
            headers=bob_headers,
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/finalize?game_id={game_id}",
            json={"power": "GERMANY", "force": True},
            headers=bob_headers,
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/orders/batch?game_id={game_id}",
            json={
                "power": "FRANCE",
                "orders": [
                    {
                        "unit_id": "FRA_A_PAR",
                        "power": "FRANCE",
                        "unit_type": "A",
                        "origin": "PAR",
                        "order_type": "MOVE",
                        "target": "BUR",
                        "is_explicit": True,
                    },
                    {
                        "unit_id": "FRA_A_MAR",
                        "power": "FRANCE",
                        "unit_type": "A",
                        "origin": "MAR",
                        "order_type": "MOVE",
                        "target": "SPA",
                        "is_explicit": True,
                    },
                ],
            },
            headers=creator_headers,
        ).status_code
        == 200
    )

    after_orders = client.get(f"/api/game?game_id={game_id}", headers=creator_headers).json()[
        "state"
    ]
    assert after_orders["state_revision"] > initial_state_rev
    assert after_orders["board_revision"] == initial_board_rev

    # 3. Host commits a board edit using initial_board_rev (relocating FRA_A_MAR -> GAS and
    #    setting BEL -> FRANCE), even with masked unexplicit HOLD orders present in `orders`.
    modified_units = [
        {**u, "province": "GAS"} if u["id"] == "FRA_A_MAR" else u for u in initial["units"]
    ]
    modified_ownership = {**initial["ownership"], "BEL": "FRANCE"}
    edit_res = client.post(
        f"/api/admin/board-edit?game_id={game_id}",
        json={
            "expected_revision": initial_board_rev,
            "expected_season": initial["season"],
            "expected_year": initial["year"],
            "expected_phase": initial["phase"],
            "units": modified_units,
            "ownership": modified_ownership,
            "orders": initial["orders"],
        },
        headers=creator_headers,
    )
    assert edit_res.status_code == 200
    updated = edit_res.json()
    assert updated["board_revision"] > initial_board_rev

    # 4. Fog of war: host response masks Bob's GER_A_BER order as HOLD
    assert updated["orders"]["GER_A_BER"]["order_type"] == "HOLD"
    assert updated["orders"]["GER_A_BER"]["target"] is None

    # 5. Authoritative state preserves unimpacted orders for both powers and resets moved unit
    live_orders = GAMES[game_id].orders
    assert live_orders["GER_A_BER"].order_type == OrderType.MOVE
    assert live_orders["GER_A_BER"].target == "SIL"
    assert live_orders["GER_A_BER"].is_explicit is True
    assert live_orders["FRA_A_PAR"].order_type == OrderType.MOVE
    assert live_orders["FRA_A_PAR"].target == "BUR"
    assert live_orders["FRA_A_MAR"].order_type == OrderType.HOLD
    assert live_orders["FRA_A_MAR"].origin == "GAS"

    # 6. Turn/board changes (set-turn, adjudicate, rollback) bump board_revision and cause 409
    rev_before_turn_change = updated["board_revision"]
    set_turn_res = client.post(
        f"/api/admin/set-turn?game_id={game_id}",
        json={"season": "Fall", "year": 1901, "phase": "Movement"},
        headers=creator_headers,
    )
    assert set_turn_res.status_code == 200
    rev_after_set_turn = set_turn_res.json()["board_revision"]
    assert rev_after_set_turn > rev_before_turn_change

    stale_after_set_turn = client.post(
        f"/api/admin/board-edit?game_id={game_id}",
        json={
            "expected_revision": rev_before_turn_change,
            "expected_season": "Fall",
            "expected_year": 1901,
            "expected_phase": "Movement",
            "units": modified_units,
            "ownership": modified_ownership,
        },
        headers=creator_headers,
    )
    assert stale_after_set_turn.status_code == 409

    adj_res = client.post(f"/api/adjudicate?game_id={game_id}", headers=creator_headers)
    assert adj_res.status_code == 200
    rev_after_adj = adj_res.json()["board_revision"]
    assert rev_after_adj > rev_after_set_turn

    stale_after_adj = client.post(
        f"/api/admin/board-edit?game_id={game_id}",
        json={
            "expected_revision": rev_after_set_turn,
            "expected_season": adj_res.json()["season"],
            "expected_year": adj_res.json()["year"],
            "expected_phase": adj_res.json()["phase"],
            "units": adj_res.json()["units"],
            "ownership": adj_res.json()["ownership"],
        },
        headers=creator_headers,
    )
    assert stale_after_adj.status_code == 409

    rb_res = client.post(f"/api/admin/rollback?game_id={game_id}", headers=creator_headers)
    assert rb_res.status_code == 200
    rev_after_rb = rb_res.json()["board_revision"]
    assert rev_after_rb > rev_after_adj

    stale_after_rb = client.post(
        f"/api/admin/board-edit?game_id={game_id}",
        json={
            "expected_revision": rev_after_adj,
            "expected_season": rb_res.json()["season"],
            "expected_year": rb_res.json()["year"],
            "expected_phase": rb_res.json()["phase"],
            "units": rb_res.json()["units"],
            "ownership": rb_res.json()["ownership"],
        },
        headers=creator_headers,
    )
    assert stale_after_rb.status_code == 409


def test_admin_force_resolve_logs_warning_for_other_players():
    game_id = _seated_game()
    creator_headers = _auth_headers()
    bob_headers = make_auth_headers("bob", "bob@test.com")

    res = client.post(f"/api/adjudicate?game_id={game_id}", headers=creator_headers)
    assert res.status_code == 200
    st = res.json()
    assert st["season"] == "Fall"
    assert st["year"] == 1901
    assert st["phase"] == "Movement"
    assert len(st["admin_log"]) == 1
    entry = st["admin_log"][0]
    assert entry["actor"] == "Envoy"
    assert "host" in entry["acknowledged_by"]
    assert "bob" not in entry["acknowledged_by"]
    assert any(
        "Force-resolved Spring 1901 Movement Phase." in line for line in entry["summary_lines"]
    )
    assert st["turn_history"][0].startswith("[ADMIN OVERRIDE] Force-resolved Spring 1901 Movement:")

    # Bob sees the unacknowledged entry until he acknowledges it
    bob_state = client.get(f"/api/game?game_id={game_id}", headers=bob_headers).json()["state"]
    assert len(bob_state["admin_log"]) == 1
    assert "bob" not in bob_state["admin_log"][0]["acknowledged_by"]

    ack_res = client.post(
        f"/api/admin/acknowledge?game_id={game_id}",
        json={"entry_ids": [entry["id"]]},
        headers=bob_headers,
    )
    assert ack_res.status_code == 200
    assert ack_res.json()["acknowledged_by"] == "bob"


def test_board_edit_adjustments_drops_stale_build_slots_and_preserves_valid_ones():
    from storage.store import GAMES

    game_id = _seated_game()
    creator_headers = _auth_headers()
    bob_headers = make_auth_headers("bob", "bob@test.com")

    # Jump to Winter 1901 Adjustments and give France +2 builds (PAR vacant, MAR vacant)
    # and Germany +1 build (BER vacant).
    assert (
        client.post(
            f"/api/admin/set-turn?game_id={game_id}",
            json={"season": "Winter", "year": 1901, "phase": "Adjustments"},
            headers=creator_headers,
        ).status_code
        == 200
    )
    state = client.get(f"/api/game?game_id={game_id}", headers=creator_headers).json()["state"]
    # Remove FRA_A_PAR and GER_A_BER and give France BEL + HOL so France has 2 builds and Germany 1
    trimmed_units = [u for u in state["units"] if u["id"] not in ("FRA_A_PAR", "GER_A_BER")]
    expanded_ownership = {**state["ownership"], "BEL": "FRANCE", "HOL": "FRANCE"}
    setup_res = client.post(
        f"/api/admin/board-edit?game_id={game_id}",
        json={
            "expected_revision": state["board_revision"],
            "expected_season": "Winter",
            "expected_year": 1901,
            "expected_phase": "Adjustments",
            "units": trimmed_units,
            "ownership": expanded_ownership,
        },
        headers=creator_headers,
    )
    assert setup_res.status_code == 200
    adj_state = setup_res.json()
    assert "BUILD_FRANCE_PAR" in adj_state["orders"]
    assert "BUILD_GERMANY_BER" in GAMES[game_id].orders

    # Bob submits a BUILD in BER; France submits a BUILD in PAR
    assert (
        client.post(
            f"/api/order?game_id={game_id}",
            json={
                "order": {
                    "unit_id": "BUILD_GERMANY_BER",
                    "power": "GERMANY",
                    "unit_type": "A",
                    "origin": "BER",
                    "order_type": "BUILD",
                    "is_explicit": True,
                }
            },
            headers=bob_headers,
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/order?game_id={game_id}",
            json={
                "order": {
                    "unit_id": "BUILD_FRANCE_PAR",
                    "power": "FRANCE",
                    "unit_type": "A",
                    "origin": "PAR",
                    "order_type": "BUILD",
                    "is_explicit": True,
                }
            },
            headers=creator_headers,
        ).status_code
        == 200
    )

    # Admin occupies PAR with a spawned unit (invalidating BUILD_FRANCE_PAR), while leaving
    # BUILD_GERMANY_BER valid and unimpacted.
    spawned_units = [
        *adj_state["units"],
        {"id": "FRA_A_PAR", "power": "FRANCE", "unit_type": "A", "province": "PAR", "coast": None},
    ]
    after_res = client.post(
        f"/api/admin/board-edit?game_id={game_id}",
        json={
            "expected_revision": adj_state["board_revision"],
            "expected_season": "Winter",
            "expected_year": 1901,
            "expected_phase": "Adjustments",
            "units": spawned_units,
            "ownership": expanded_ownership,
        },
        headers=creator_headers,
    )
    assert after_res.status_code == 200
    assert "BUILD_FRANCE_PAR" not in GAMES[game_id].orders
    assert GAMES[game_id].orders["BUILD_GERMANY_BER"].order_type.value == "BUILD"


def test_board_edit_summary_skips_order_update_line_when_unit_power_changes():
    from storage.store import GAMES

    game_id = _seated_game()
    creator_headers = _auth_headers()
    bob_headers = make_auth_headers("bob", "bob@test.com")

    # Bob orders GER_A_BER -> SIL
    assert (
        client.post(
            f"/api/order?game_id={game_id}",
            json={
                "order": {
                    "unit_id": "GER_A_BER",
                    "power": "GERMANY",
                    "unit_type": "A",
                    "origin": "BER",
                    "order_type": "MOVE",
                    "target": "SIL",
                    "is_explicit": True,
                }
            },
            headers=bob_headers,
        ).status_code
        == 200
    )

    initial = client.get(f"/api/game?game_id={game_id}", headers=creator_headers).json()["state"]
    modified_units = [
        {**u, "power": "FRANCE"} if u["id"] == "GER_A_BER" else u for u in initial["units"]
    ]
    res = client.post(
        f"/api/admin/board-edit?game_id={game_id}",
        json={
            "expected_revision": initial["board_revision"],
            "expected_season": initial["season"],
            "expected_year": initial["year"],
            "expected_phase": initial["phase"],
            "units": modified_units,
            "ownership": initial["ownership"],
        },
        headers=creator_headers,
    )
    assert res.status_code == 200
    summary = res.json()["admin_log"][-1]["summary_lines"]
    assert any("Changed GERMANY A in BER to FRANCE A in BER." in line for line in summary)
    assert not any("Updated order" in line for line in summary)
    assert GAMES[game_id].orders["GER_A_BER"].order_type.value == "HOLD"
