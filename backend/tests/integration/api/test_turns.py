"""Resolving turns: advancing, consensus finalization, and how a game ends."""

from domain.board import Power, Unit, UnitType
from domain.orders import Order, OrderType
from fastapi.testclient import TestClient
from main import app
from storage.store import GAMES
from tests.integration.api.helpers import (
    _auth_headers,
    _new_game,
    _order_payload,
    _put_game_one_center_from_a_solo,
)

client = TestClient(app)


def test_api_adjudicate_and_advance_turn():
    """Adjudicating a turn advances the phase and logs to turn history."""
    client.post("/api/scenario", json={"scenario_id": "standard_1901", "active_power": "FRANCE"})

    # Adjudicate Spring 1901 Movement -> Fall 1901 Movement
    adj_res = client.post("/api/adjudicate")
    assert adj_res.status_code == 200
    new_state = adj_res.json()
    assert new_state["season"] == "Fall"
    assert new_state["year"] == 1901
    assert new_state["phase"] == "Movement"
    assert len(new_state["turn_history"]) >= 1
    assert "Spring 1901 Movement" in new_state["turn_history"][0]
    assert new_state["finalized_powers"] == []


def test_illegal_move_does_not_teleport_through_the_full_turn_cycle():
    game_id = _new_game()
    client.post(f"/api/order?game_id={game_id}", json={"order": _order_payload(target="MOS")})

    state = client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).json()

    assert next(u for u in state["units"] if u["id"] == "FRA_A_PAR")["province"] == "PAR"


def test_game_ends_when_a_power_reaches_eighteen_centers():
    game_id = _new_game()
    _put_game_one_center_from_a_solo(game_id)

    state = client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).json()

    assert state["winner"] == "FRANCE"
    assert (state["season"], state["year"], state["phase"]) == ("Fall", 1907, "Movement")
    assert state["last_resolution"]["winner"] == "FRANCE"
    assert "FRANCE" in state["turn_history"][0]
    assert client.get(f"/api/games/{game_id}").json()["status"] == "completed"

    # Reading the finished game must not disturb it, and it cannot be played further.
    reread = client.get(f"/api/game?game_id={game_id}")
    assert reread.status_code == 200
    assert reread.json()["state"]["winner"] == "FRANCE"
    assert (
        client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).status_code
        == 409
    )
    assert client.post(f"/api/sandbox/ai-step?game_id={game_id}").status_code == 409


def test_game_ends_only_after_the_retreat_of_the_deciding_turn():
    game_id = _new_game()
    _put_game_one_center_from_a_solo(game_id)
    game = GAMES[game_id]
    # The 18th center is defended, so taking it dislodges a unit that still has to retreat.
    game.units.append(
        Unit(id="TUR_A_TUN", power=Power.TURKEY, unit_type=UnitType.ARMY, province="TUN")
    )
    game.units.append(
        Unit(id="FRA_F_WES", power=Power.FRANCE, unit_type=UnitType.FLEET, province="WES")
    )
    game.orders["FRA_F_WES"] = Order(
        unit_id="FRA_F_WES",
        power=Power.FRANCE,
        unit_type=UnitType.FLEET,
        origin="WES",
        order_type=OrderType.SUPPORT,
        aux_unit_origin="ION",
        target="TUN",
        is_explicit=True,
    )

    movement = client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).json()

    assert movement["winner"] is None
    assert (movement["season"], movement["phase"]) == ("Fall", "Retreats")

    retreat = client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).json()

    assert retreat["winner"] == "FRANCE"
    assert (retreat["season"], retreat["year"], retreat["phase"]) == ("Fall", 1907, "Retreats")
    assert client.get(f"/api/game?game_id={game_id}").status_code == 200
    assert (
        client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).status_code
        == 409
    )


def test_previewing_a_winning_turn_does_not_end_the_game():
    game_id = _new_game()
    _put_game_one_center_from_a_solo(game_id)

    # France's own preview: other viewers see the turn played out with France's orders hidden.
    state = client.get(f"/api/game?game_id={game_id}&power=FRANCE").json()["state"]

    assert state["last_resolution"]["winner"] == "FRANCE"
    assert state["winner"] is None
    assert client.get(f"/api/games/{game_id}").json()["status"] != "completed"


def test_multiplayer_auto_adjudication_on_consensus_finalization():
    """In multiplayer, resolution automatically executes when all required participants finalize."""
    # 1. Host creates game as England
    res_create = client.post(
        "/api/games",
        json={
            "name": "Consensus Test",
            "creator_power": "ENGLAND",
            "user_id": "host_george",
            "email": "king@uk.gov",
        },
    )
    assert res_create.status_code == 200
    gid = res_create.json()["game_id"]

    # 2. France joins the game
    res_join = client.post(
        f"/api/games/{gid}/join",
        json={"power": "FRANCE", "user_id": "user_napoleon", "email": "napoleon@fr.gov"},
    )
    assert res_join.status_code == 200
    assert res_join.json()["summary"]["status"] == "active"

    # 3. Non-creator France attempts manual adjudication with user credentials -> 403 Forbidden
    france_headers = _auth_headers("user_napoleon", "napoleon@fr.gov")
    res_adj_intruder = client.post(f"/api/adjudicate?game_id={gid}", headers=france_headers)
    assert res_adj_intruder.status_code == 403
    assert "Administrator access denied" in res_adj_intruder.json()["detail"]

    # Unauthenticated request fails with 401
    res_adj_unauth = client.post(f"/api/adjudicate?game_id={gid}")
    assert res_adj_unauth.status_code == 401

    # 4. France finalizes orders (1 of 2 participants)
    fin_fra = client.post(
        f"/api/finalize?game_id={gid}",
        json={"power": "FRANCE", "force": True},
    )
    assert fin_fra.status_code == 200
    # Still Spring 1901 Movement because England hasn't finalized yet
    assert fin_fra.json()["state"]["season"] == "Spring"
    assert fin_fra.json()["state"]["phase"] == "Movement"
    assert "FRANCE" in fin_fra.json()["state"]["finalized_powers"]

    # 5. England finalizes orders (2 of 2 participants -> consensus reached!)
    fin_eng = client.post(
        f"/api/finalize?game_id={gid}",
        json={"power": "ENGLAND", "force": True},
    )
    assert fin_eng.status_code == 200
    # Phase has automatically resolved and advanced to Fall 1901 Movement!
    advanced_state = fin_eng.json()["state"]
    assert advanced_state["season"] == "Fall"
    assert advanced_state["year"] == 1901
    assert advanced_state["phase"] == "Movement"
    assert advanced_state["finalized_powers"] == []
