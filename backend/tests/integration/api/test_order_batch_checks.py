"""Malformed orders an API client can send (#263): a build filed on another home centre's slot,
two orders for one unit in a batch, and an army ordered to a coast."""

from domain.board import Power
from domain.orders import OrderType
from fastapi.testclient import TestClient
from main import app
from storage.store import GAMES
from tests.integration.api.helpers import (
    _auth_headers,
    _new_game,
    _order_payload,
    _remove_unit,
    _seated_game,
    _set_turn,
)

client = TestClient(app)


def _winter(game_id, owed_one=False):
    """Winter with Paris and Marseilles empty, so France has a build slot in each. France is owed
    two builds, or with `owed_one` only one, because England has taken Brest."""
    _remove_unit(game_id, "FRA_A_PAR")
    _remove_unit(game_id, "FRA_A_MAR")
    if owed_one:
        GAMES[game_id].ownership["BRE"] = Power.ENGLAND
    _set_turn(game_id, "Winter", "Adjustments")
    client.get(f"/api/game?game_id={game_id}")
    return game_id


def _build(slot, home, unit_type="A"):
    return _order_payload(
        unit_id=slot, unit_type=unit_type, origin=home, order_type="BUILD", target=None
    )


def _batch(game_id, orders):
    return client.post(
        f"/api/orders/batch?game_id={game_id}",
        json={"power": "FRANCE", "orders": orders},
        headers=_auth_headers(),
    )


def test_a_build_on_another_home_centres_slot_is_refused():
    game_id = _winter(_seated_game())

    res = _batch(game_id, [_build("BUILD_FRANCE_PAR", "MAR")])

    assert res.status_code == 422
    assert "BUILD_FRANCE_PAR" in res.json()["detail"]
    assert GAMES[game_id].orders["BUILD_FRANCE_PAR"].order_type == OrderType.WAIVE


def test_a_single_order_on_another_home_centres_slot_is_refused():
    game_id = _winter(_seated_game())

    res = client.post(
        f"/api/order?game_id={game_id}",
        json={"order": _build("BUILD_FRANCE_MAR", "PAR")},
        headers=_auth_headers(),
    )

    assert res.status_code == 422
    assert GAMES[game_id].orders["BUILD_FRANCE_MAR"].order_type == OrderType.WAIVE


def test_a_build_slot_the_phase_does_not_have_is_refused():
    # Brest still holds a French fleet, so there is no slot to build there.
    game_id = _winter(_seated_game())

    res = _batch(game_id, [_build("BUILD_FRANCE_BRE", "BRE", unit_type="F")])

    assert res.status_code == 404
    assert "BUILD_FRANCE_BRE" not in GAMES[game_id].orders


def test_builds_on_their_own_slots_are_recorded_under_the_same_slot():
    game_id = _winter(_seated_game())

    res = _batch(game_id, [_build("BUILD_FRANCE_PAR", "PAR"), _build("BUILD_FRANCE_MAR", "MAR")])
    assert res.status_code == 200, res.text
    client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers())

    record = client.get(f"/api/history/0?game_id={game_id}", headers=_auth_headers()).json()
    for slot, home in (("BUILD_FRANCE_PAR", "PAR"), ("BUILD_FRANCE_MAR", "MAR")):
        assert record["orders"][slot]["origin"] == home
        assert record["resolution"]["resolutions"][slot]["succeeded"]


def test_a_power_never_builds_more_than_it_is_owed():
    game_id = _winter(_seated_game(), owed_one=True)
    assert GAMES[game_id].builds["FRANCE"]["count"] == 1

    _batch(game_id, [_build("BUILD_FRANCE_PAR", "PAR"), _build("BUILD_FRANCE_MAR", "MAR")])
    state = client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).json()

    french = [u for u in state["units"] if u["power"] == "FRANCE"]
    assert len(french) == 2


def test_two_orders_for_one_unit_in_a_batch_are_refused():
    game_id = _new_game()

    res = _batch(
        game_id,
        [_order_payload(target="BUR"), _order_payload(target="PIC")],
    )

    assert res.status_code == 422
    assert "FRA_A_PAR" in res.json()["detail"]
    assert GAMES[game_id].orders["FRA_A_PAR"].order_type == OrderType.HOLD


def test_two_builds_on_one_slot_are_refused():
    game_id = _winter(_seated_game())

    res = _batch(game_id, [_build("BUILD_FRANCE_PAR", "PAR"), _build("BUILD_FRANCE_PAR", "PAR")])

    assert res.status_code == 422


def test_an_army_ordered_to_a_coast_has_the_coast_dropped():
    game_id = _new_game()

    res = _batch(
        game_id,
        [_order_payload(unit_id="FRA_A_MAR", origin="MAR", target="SPA", target_coast="SC")],
    )

    assert res.status_code == 200, res.text
    order = GAMES[game_id].orders["FRA_A_MAR"]
    assert order.target == "SPA"
    assert order.target_coast is None
