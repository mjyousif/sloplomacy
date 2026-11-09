"""Helpers shared by the API tests: games with seats, orders, tokens, and board edits."""

import time

import jwt
from domain.board import Power, Unit, UnitType
from domain.orders import Order, OrderType
from engine.topology.provinces import PROVINCES
from fastapi.testclient import TestClient
from main import app
from storage.store import GAMES

client = TestClient(app)


def _new_game(power="FRANCE"):
    res = client.post(
        "/api/games",
        json={
            "name": "Regression",
            "creator_power": power,
            "user_id": "host",
            "email": "host@test.com",
        },
    )
    assert res.status_code == 200
    return res.json()["game_id"]


def _auth_headers(user_id="host", email="host@test.com"):
    import jwt

    token = jwt.encode(
        {"sub": user_id, "email": email, "aud": "authenticated"},
        "test-secret-at-least-32-chars-long-12345",
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def _order_payload(**overrides):
    order = {
        "unit_id": "FRA_A_PAR",
        "power": "FRANCE",
        "unit_type": "A",
        "origin": "PAR",
        "order_type": "MOVE",
        "target": "BUR",
        "is_explicit": True,
    }
    order.update(overrides)
    return order


def _put_game_one_center_from_a_solo(game_id):
    game = GAMES[game_id]
    centers = sorted(
        p.id for p in PROVINCES.values() if p.is_supply_center and p.id not in ("TUN", "PAR")
    )[:16]
    game.ownership = {center: Power.FRANCE for center in centers}
    game.ownership["PAR"] = Power.FRANCE
    game.season, game.year, game.phase = "Fall", 1907, "Movement"
    game.units = [
        Unit(id="FRA_F_ION", power=Power.FRANCE, unit_type=UnitType.FLEET, province="ION"),
        Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PAR"),
        Unit(id="TUR_A_SMY", power=Power.TURKEY, unit_type=UnitType.ARMY, province="SMY"),
    ]
    game.orders = {
        "FRA_F_ION": Order(
            unit_id="FRA_F_ION",
            power=Power.FRANCE,
            unit_type=UnitType.FLEET,
            origin="ION",
            order_type=OrderType.MOVE,
            target="TUN",
            is_explicit=True,
        )
    }


def _seated_game():
    """A live match: the host commands France and Bob commands Germany."""
    game_id = _new_game()
    res = client.post(
        f"/api/games/{game_id}/join",
        json={"power": "GERMANY", "user_id": "bob", "email": "bob@test.com", "display_name": "Bob"},
    )
    assert res.status_code == 200
    return game_id


def _germany_moves_to_silesia(game_id):
    order = {
        "unit_id": "GER_A_BER",
        "power": "GERMANY",
        "unit_type": "A",
        "origin": "BER",
        "order_type": "MOVE",
        "target": "SIL",
        "is_explicit": True,
    }
    assert client.post(f"/api/order?game_id={game_id}", json={"order": order}).status_code == 200
    return order


def _set_turn(game_id, season, phase):
    game = GAMES[game_id]
    game.season, game.phase = season, phase
    game.builds, game.retreats = None, None


def _remove_unit(game_id, unit_id):
    game = GAMES[game_id]
    game.units = [u for u in game.units if u.id != unit_id]
    game.orders.pop(unit_id, None)


def _place_unit(game_id, unit_id, province):
    game = GAMES[game_id]
    next(u for u in game.units if u.id == unit_id).province = province
    game.orders[unit_id].origin = province


def _finalize(game_id, power):
    res = client.post(f"/api/finalize?game_id={game_id}", json={"power": power, "force": True})
    assert res.status_code == 200
    return res.json()


def _dislodge_russia_in_silesia(game_id):
    """Germany attacks a Russian army in Silesia with support, leaving Russia with a retreat."""
    _place_unit(game_id, "RUS_A_WAR", "SIL")
    client.post(
        f"/api/orders/batch?game_id={game_id}",
        json={
            "power": "GERMANY",
            "orders": [
                {
                    "unit_id": "GER_A_BER",
                    "power": "GERMANY",
                    "unit_type": "A",
                    "origin": "BER",
                    "order_type": "MOVE",
                    "target": "SIL",
                    "is_explicit": True,
                },
                {
                    "unit_id": "GER_A_MUN",
                    "power": "GERMANY",
                    "unit_type": "A",
                    "origin": "MUN",
                    "order_type": "SUPPORT",
                    "aux_unit_origin": "BER",
                    "target": "SIL",
                    "is_explicit": True,
                },
            ],
        },
    )


TEST_JWT_SECRET = "test-secret-at-least-32-chars-long-12345"


def make_token(
    user_id: str, email: str, secret: str = TEST_JWT_SECRET, exp_offset: int = 3600
) -> str:
    return jwt.encode(
        {"sub": user_id, "email": email, "exp": int(time.time()) + exp_offset},
        secret,
        algorithm="HS256",
    )


def make_auth_headers(
    user_id: str, email: str, secret: str = TEST_JWT_SECRET, exp_offset: int = 3600
) -> dict:
    return {"Authorization": f"Bearer {make_token(user_id, email, secret, exp_offset)}"}
