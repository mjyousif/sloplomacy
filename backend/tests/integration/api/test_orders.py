"""Order submission: single orders, batches, confirm-all, build slots, and orders that name nothing real."""

import pytest
from domain.orders import OrderType
from fastapi.testclient import TestClient
from main import app
from storage.store import GAMES
from tests.integration.api.helpers import (
    _auth_headers,
    _new_game,
    _order_payload,
    _place_unit,
)

client = TestClient(app)


def test_api_order_updates_finalize_and_unfinalize():
    """Test order updating, finalizing with warnings, and unfinalizing."""
    # Reset default scenario
    client.post("/api/scenario", json={"scenario_id": "standard_1901", "active_power": "FRANCE"})

    # Update FRA_A_PAR
    order_res = client.post(
        "/api/order",
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
    assert order_res.status_code == 200
    st = order_res.json()
    assert st["orders"]["FRA_A_PAR"]["target"] == "BUR"

    # Confirm all orders for France
    conf_res = client.post("/api/orders/confirm-all", json={"power": "FRANCE"})
    assert conf_res.status_code == 200
    assert conf_res.json()["orders"]["FRA_A_PAR"]["is_explicit"] is True

    # Finalize France
    fin_res = client.post("/api/finalize", json={"power": "FRANCE", "force": False})
    assert fin_res.status_code == 200
    assert "FRANCE" in fin_res.json()["state"]["finalized_powers"]

    # Unfinalize France
    unfin_res = client.post("/api/unfinalize", json={"power": "FRANCE"})
    assert unfin_res.status_code == 200
    assert "FRANCE" not in unfin_res.json()["finalized_powers"]


def test_api_clear_all_resets_only_the_named_power_to_defaults():
    """Clear-all puts a power's units back on hold and withdraws its finalization."""
    client.post("/api/scenario", json={"scenario_id": "standard_1901", "active_power": "FRANCE"})
    for unit_id, power, unit_type, origin, target in (
        ("FRA_A_PAR", "FRANCE", "A", "PAR", "BUR"),
        ("GER_A_MUN", "GERMANY", "A", "MUN", "RUH"),
    ):
        res = client.post(
            "/api/order",
            json={
                "order": {
                    "unit_id": unit_id,
                    "power": power,
                    "unit_type": unit_type,
                    "origin": origin,
                    "order_type": "MOVE",
                    "target": target,
                    "is_explicit": True,
                }
            },
        )
        assert res.status_code == 200
    client.post("/api/finalize", json={"power": "FRANCE", "force": True})

    res = client.post("/api/orders/clear-all", json={"power": "FRANCE"})
    assert res.status_code == 200
    st = res.json()
    assert st["orders"]["FRA_A_PAR"]["order_type"] == "HOLD"
    assert st["orders"]["FRA_A_PAR"]["is_explicit"] is False
    assert "FRANCE" not in st["finalized_powers"]
    assert st["orders"]["GER_A_MUN"]["order_type"] == "MOVE"


def test_api_winter_builds_and_slot_management():
    """Full API flow into Winter Adjustments preserves game.builds and spawns built units."""
    client.post("/api/scenario", json={"scenario_id": "standard_1901", "active_power": "FRANCE"})

    # Spring 1901: France moves F BRE -> MAO, A MAR -> SPA, A PAR -> GAS
    client.post(
        "/api/order",
        json={
            "order": {
                "unit_id": "FRA_F_BRE",
                "power": "FRANCE",
                "unit_type": "F",
                "origin": "BRE",
                "order_type": "MOVE",
                "target": "MAO",
                "is_explicit": True,
            }
        },
    )
    client.post(
        "/api/order",
        json={
            "order": {
                "unit_id": "FRA_A_MAR",
                "power": "FRANCE",
                "unit_type": "A",
                "origin": "MAR",
                "order_type": "MOVE",
                "target": "SPA",
                "is_explicit": True,
            }
        },
    )
    client.post(
        "/api/order",
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
    res_s1901 = client.post("/api/adjudicate").json()
    assert res_s1901["season"] == "Fall"
    assert res_s1901["phase"] == "Movement"

    # Fall 1901: France moves F MAO -> POR, A SPA Holds, A BUR -> BEL
    client.post(
        "/api/order",
        json={
            "order": {
                "unit_id": "FRA_F_BRE",
                "power": "FRANCE",
                "unit_type": "F",
                "origin": "MAO",
                "order_type": "MOVE",
                "target": "POR",
                "is_explicit": True,
            }
        },
    )
    client.post(
        "/api/order",
        json={
            "order": {
                "unit_id": "FRA_A_PAR",
                "power": "FRANCE",
                "unit_type": "A",
                "origin": "BUR",
                "order_type": "MOVE",
                "target": "BEL",
                "is_explicit": True,
            }
        },
    )
    res_f1901 = client.post("/api/adjudicate").json()
    assert res_f1901["season"] == "Winter"
    assert res_f1901["phase"] == "Adjustments"

    # France now has 6 SCs (PAR, MAR, BRE, SPA, POR, BEL) and 3 units -> count == 3, 3 open homes
    assert res_f1901["builds"]["FRANCE"]["count"] == 3
    assert set(res_f1901["builds"]["FRANCE"]["homes"]) == {"PAR", "MAR", "BRE"}

    # Update BUILD_FRANCE_BRE to build a Fleet
    upd_bre = client.post(
        "/api/order",
        json={
            "order": {
                "unit_id": "BUILD_FRANCE_BRE",
                "power": "FRANCE",
                "unit_type": "F",
                "origin": "BRE",
                "order_type": "BUILD",
                "is_explicit": True,
            }
        },
    ).json()
    # Critical regression check: updating an order in Adjustments must NOT wipe game.builds!
    assert upd_bre["builds"]["FRANCE"]["count"] == 3
    assert set(upd_bre["builds"]["FRANCE"]["homes"]) == {"PAR", "MAR", "BRE"}

    # A build only happens if it is ordered, so order the other two as armies
    for home in ("PAR", "MAR"):
        client.post(
            "/api/order",
            json={
                "order": {
                    "unit_id": f"BUILD_FRANCE_{home}",
                    "power": "FRANCE",
                    "unit_type": "A",
                    "origin": home,
                    "order_type": "BUILD",
                    "is_explicit": True,
                }
            },
        )

    # Confirm all orders for France and adjudicate Winter 1901 Adjustments -> Spring 1902 Movement
    client.post("/api/orders/confirm-all", json={"power": "FRANCE"})
    res_w1901 = client.post("/api/adjudicate").json()
    assert res_w1901["season"] == "Spring"
    assert res_w1901["year"] == 1902
    assert res_w1901["phase"] == "Movement"

    fra_units = [u for u in res_w1901["units"] if u["power"] == "FRANCE"]
    assert len(fra_units) == 6
    assert len({u["id"] for u in fra_units}) == 6


@pytest.mark.parametrize(
    "overrides",
    [
        {"target": "ZZZ"},
        {"target": "BUR; DROP"},
        {"order_type": "SUPPORT", "target": "BUR", "aux_unit_origin": "ZZZ"},
        {"target": "BRE", "target_coast": "NC"},  # Brest has no named coasts
        {"target": "SPA", "target_coast": "EC"},  # Spain has no east coast
        {"target": None, "target_coast": "NC"},
    ],
)
def test_order_naming_a_place_that_does_not_exist_is_refused(overrides):
    game_id = _new_game()

    res = client.post(f"/api/order?game_id={game_id}", json={"order": _order_payload(**overrides)})

    assert res.status_code == 400
    assert GAMES[game_id].orders["FRA_A_PAR"].order_type == OrderType.HOLD


def test_build_order_for_unknown_province_is_refused():
    game_id = _new_game()
    payload = _order_payload(
        unit_id="BUILD_FRANCE_ZZZ", origin="ZZZ", order_type="BUILD", target=None
    )

    res = client.post(f"/api/order?game_id={game_id}", json={"order": payload})

    assert res.status_code == 400
    assert "BUILD_FRANCE_ZZZ" not in GAMES[game_id].orders


def test_valid_coast_and_illegal_but_real_moves_are_still_accepted():
    """Drafting a bad move is allowed: the validator flags it and the engine refuses it."""
    game_id = _new_game()

    legal_coast = client.post(
        f"/api/order?game_id={game_id}",
        json={
            "order": _order_payload(
                unit_id="FRA_F_BRE", unit_type="F", origin="BRE", target="SPA", target_coast="NC"
            )
        },
    )
    illegal_move = client.post(
        f"/api/order?game_id={game_id}", json={"order": _order_payload(target="MOS")}
    )

    assert legal_coast.status_code == 200
    assert illegal_move.status_code == 200
    assert any(i["code"] == "ILLEGAL_MOVE" for i in illegal_move.json()["issues"])


def test_incomplete_support_does_not_break_the_game():
    game_id = _new_game()
    payload = _order_payload(order_type="SUPPORT", target=None, aux_unit_origin=None)

    drafted = client.post(f"/api/order?game_id={game_id}", json={"order": payload})

    assert drafted.status_code == 200
    assert any(i["code"] == "ILLEGAL_SUPPORT" for i in drafted.json()["issues"])
    assert client.get(f"/api/game?game_id={game_id}").status_code == 200
    assert (
        client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).status_code
        == 200
    )


def test_batch_with_one_bad_order_changes_nothing():
    game_id = _new_game()
    res = client.post(
        f"/api/orders/batch?game_id={game_id}",
        json={
            "power": "FRANCE",
            "orders": [
                _order_payload(),
                _order_payload(unit_id="FRA_A_MAR", origin="MAR", target="ZZZ"),
            ],
        },
    )

    assert res.status_code == 400
    assert GAMES[game_id].orders["FRA_A_PAR"].order_type == OrderType.HOLD


def test_a_coast_on_an_army_order_is_ignored():
    game_id = _new_game()
    _place_unit(game_id, "FRA_A_MAR", "GAS")
    order = _order_payload(unit_id="FRA_A_MAR", origin="GAS", target="SPA", target_coast="NC")

    client.post(f"/api/order?game_id={game_id}", json={"order": order})
    client.post(f"/api/orders/batch?game_id={game_id}", json={"power": "FRANCE", "orders": [order]})
    client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers())

    assert [(u.province, u.coast) for u in GAMES[game_id].units if u.id == "FRA_A_MAR"] == [
        ("SPA", None)
    ]
