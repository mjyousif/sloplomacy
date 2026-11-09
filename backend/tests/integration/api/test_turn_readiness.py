"""Who a turn waits for: unclaimed powers, retreats, surrenders and players who leave."""

from domain.board import Power
from domain.orders import OrderType
from engine.order_utils import (
    get_required_finalizing_powers,
)
from fastapi.testclient import TestClient
from main import app
from storage.store import GAME_SUMMARIES, GAMES
from tests.integration.api.helpers import (
    _auth_headers,
    _dislodge_russia_in_silesia,
    _finalize,
    _place_unit,
    _remove_unit,
    _seated_game,
    _set_turn,
)

client = TestClient(app)


def _claim(game_id, power, user_id):
    res = client.post(
        f"/api/games/{game_id}/join",
        json={"power": power, "user_id": user_id, "email": f"{user_id}@test.com"},
    )
    assert res.status_code == 200


def test_phases_with_only_unclaimed_powers_involved_resolve_by_themselves():
    game_id = _seated_game()
    _set_turn(game_id, "Fall", "Movement")
    _remove_unit(game_id, "RUS_A_WAR")  # Russia alone has an adjustment to make this Winter

    _finalize(game_id, "FRANCE")
    state = _finalize(game_id, "GERMANY")["state"]

    assert (state["season"], state["year"], state["phase"]) == ("Spring", 1902, "Movement")


def test_host_forced_turn_also_skips_phases_nobody_has_to_act_in():
    game_id = _seated_game()
    _set_turn(game_id, "Fall", "Movement")
    _remove_unit(game_id, "RUS_A_WAR")

    state = client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).json()

    assert (state["season"], state["year"], state["phase"]) == ("Spring", 1902, "Movement")


def test_unclaimed_powers_retreat_phase_plays_out_without_anyone():
    game_id = _seated_game()
    _dislodge_russia_in_silesia(game_id)

    _finalize(game_id, "GERMANY")
    state = _finalize(game_id, "FRANCE")["state"]

    assert (state["season"], state["phase"]) == ("Fall", "Movement")
    assert not any(u["id"] == "RUS_A_WAR" for u in state["units"])


def test_a_retreat_that_concerns_a_player_still_waits_for_them():
    game_id = _seated_game()
    _place_unit(game_id, "GER_A_BER", "SIL")
    # Russia's seat is empty, so nobody may order it through the API. Set its moves directly.
    _place_unit(game_id, "RUS_A_MOS", "GAL")
    orders = GAMES[game_id].orders
    orders["RUS_A_WAR"] = orders["RUS_A_WAR"].model_copy(
        update={"order_type": OrderType.MOVE, "target": "SIL", "is_explicit": True}
    )
    orders["RUS_A_MOS"] = orders["RUS_A_MOS"].model_copy(
        update={
            "order_type": OrderType.SUPPORT,
            "aux_unit_origin": "WAR",
            "target": "SIL",
            "is_explicit": True,
        }
    )

    _finalize(game_id, "FRANCE")
    state = _finalize(game_id, "GERMANY")["state"]

    assert state["phase"] == "Retreats"


def test_turn_resolves_when_the_last_unready_player_surrenders():
    game_id = _seated_game()
    _claim(game_id, "RUSSIA", "cal")
    _finalize(game_id, "FRANCE")
    _finalize(game_id, "RUSSIA")

    res = client.post(
        f"/api/games/{game_id}/surrender",
        json={"power": "GERMANY", "user_id": "bob", "leave": False},
    )

    assert res.status_code == 200
    assert res.json()["state"]["season"] == "Fall"


def test_turn_resolves_when_the_last_unready_player_leaves():
    game_id = _seated_game()
    _claim(game_id, "RUSSIA", "cal")
    _finalize(game_id, "FRANCE")
    _finalize(game_id, "RUSSIA")

    res = client.post(f"/api/games/{game_id}/leave", json={"user_id": "bob"})

    assert res.status_code == 200
    assert GAMES[game_id].season == "Fall"


def test_a_match_with_nobody_left_playing_does_not_run_on_by_itself():
    game_id = _seated_game()
    for power, user_id in (("FRANCE", "host"), ("GERMANY", "bob")):
        client.post(
            f"/api/games/{game_id}/surrender",
            json={"power": power, "user_id": user_id, "leave": False},
        )

    assert GAMES[game_id].season == "Spring"
    assert GAMES[game_id].phase == "Movement"


def test_a_power_with_no_room_to_build_is_not_waited_for():
    game_id = _seated_game()
    game = GAMES[game_id]
    game.builds = {
        "FRANCE": {"count": 1, "homes": []},
        "GERMANY": {"count": 1, "homes": ["KIE"]},
    }
    game.season, game.phase = "Winter", "Adjustments"

    assert get_required_finalizing_powers(game, GAME_SUMMARIES[game_id]) == [Power.GERMANY]


def test_retreat_consensus_is_read_from_dislodged_units():
    game_id = _seated_game()
    game = GAMES[game_id]
    game.season, game.phase = "Spring", "Retreats"
    next(u for u in game.units if u.id == "GER_A_BER").is_dislodged = True
    game.retreats = None

    assert get_required_finalizing_powers(game, GAME_SUMMARIES[game_id]) == [Power.GERMANY]
