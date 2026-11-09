"""What happens to what nobody ordered: missed retreats disband, missed builds are waived, missed disbands still happen."""

from domain.board import Power, Unit, UnitType
from domain.orders import OrderType
from engine.order_utils import (
    create_default_orders,
)
from fastapi.testclient import TestClient
from main import app
from storage.store import GAMES
from tests.integration.api.helpers import (
    _auth_headers,
    _dislodge_russia_in_silesia,
    _remove_unit,
    _seated_game,
    _set_turn,
)

client = TestClient(app)


def test_a_missed_retreat_disbands_the_unit():
    game_id = _seated_game()
    _dislodge_russia_in_silesia(game_id)
    state = client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).json()

    # Nobody commands Russia, so the unit that had somewhere to go disbands.
    assert not any(u["id"] == "RUS_A_WAR" for u in state["units"])


def test_a_dislodged_units_default_order_is_to_disband():
    orders = create_default_orders(
        [
            Unit(
                id="x",
                power=Power.FRANCE,
                unit_type=UnitType.ARMY,
                province="MUN",
                is_dislodged=True,
            )
        ],
        "Retreats",
    )

    assert orders["x"].order_type == OrderType.DISBAND
    assert orders["x"].is_explicit is False


def _winter_with_a_french_build():
    game_id = _seated_game()
    _remove_unit(game_id, "FRA_A_PAR")
    _set_turn(game_id, "Winter", "Adjustments")
    client.get(f"/api/game?game_id={game_id}")
    return game_id


def test_a_missed_build_is_waived():
    game_id = _winter_with_a_french_build()
    assert GAMES[game_id].orders["BUILD_FRANCE_PAR"].order_type == OrderType.WAIVE

    state = client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).json()

    assert state["phase"] == "Movement"
    assert sum(u["power"] == "FRANCE" for u in state["units"]) == 2


def test_an_ordered_build_is_built():
    game_id = _winter_with_a_french_build()
    build = {
        "unit_id": "BUILD_FRANCE_PAR",
        "power": "FRANCE",
        "unit_type": "A",
        "origin": "PAR",
        "order_type": "BUILD",
        "is_explicit": True,
    }
    client.post(f"/api/order?game_id={game_id}", json={"order": build})

    state = client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).json()

    assert sum(u["power"] == "FRANCE" for u in state["units"]) == 3


def test_a_build_chosen_before_surrendering_is_dropped():
    game_id = _winter_with_a_french_build()
    build = {
        "unit_id": "BUILD_FRANCE_PAR",
        "power": "FRANCE",
        "unit_type": "A",
        "origin": "PAR",
        "order_type": "BUILD",
        "is_explicit": True,
    }
    client.post(f"/api/order?game_id={game_id}", json={"order": build})

    res = client.post(
        f"/api/games/{game_id}/surrender",
        json={"power": "FRANCE", "user_id": "host", "leave": False},
    )

    # Nobody else had anything to do this Winter, so surrendering also finished the phase.
    assert res.json()["state"]["phase"] == "Movement"
    assert sum(u["power"] == "FRANCE" for u in res.json()["state"]["units"]) == 2


def test_a_retreat_chosen_before_surrendering_is_dropped():
    game_id = _seated_game()
    game = GAMES[game_id]
    game.season, game.phase = "Spring", "Retreats"
    unit = next(u for u in game.units if u.id == "GER_A_BER")
    unit.is_dislodged = True
    game.retreats = {"GERMANY": {"A BER": ["PRU"]}}
    client.post(
        f"/api/order?game_id={game_id}",
        json={
            "order": {
                "unit_id": "GER_A_BER",
                "power": "GERMANY",
                "unit_type": "A",
                "origin": "BER",
                "order_type": "RETREAT",
                "target": "PRU",
                "is_explicit": True,
            }
        },
    )

    res = client.post(
        f"/api/games/{game_id}/surrender",
        json={"power": "GERMANY", "user_id": "bob", "leave": False},
    )

    # The surrender also finished the phase, and the unit it left behind did not retreat.
    assert res.json()["state"]["phase"] == "Movement"
    assert not any(u["id"] == "GER_A_BER" for u in res.json()["state"]["units"])


def test_a_power_that_misses_its_disbands_still_loses_units():
    game_id = _seated_game()
    game = GAMES[game_id]
    game.ownership = {k: v for k, v in game.ownership.items() if k != "PAR"}
    _set_turn(game_id, "Winter", "Adjustments")
    client.get(f"/api/game?game_id={game_id}")
    assert game.builds["FRANCE"]["count"] == -1

    state = client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).json()

    assert state["phase"] == "Movement"
    assert sum(u["power"] == "FRANCE" for u in state["units"]) == 2
