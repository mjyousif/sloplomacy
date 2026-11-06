import time
import jwt
import pytest
from fastapi.testclient import TestClient

from main import app, GAMES, GAME_HISTORY, GAME_SUMMARIES, seed_initial_multiplayer_lobbies
from models import Power, UnitType

TEST_JWT_SECRET = "test-secret-at-least-32-chars-long-12345"


def make_token(user_id: str, email: str, secret: str = TEST_JWT_SECRET, exp_offset: int = 3600) -> str:
    return jwt.encode(
        {"sub": user_id, "email": email, "exp": int(time.time()) + exp_offset},
        secret,
        algorithm="HS256",
    )


def make_auth_headers(user_id: str, email: str, secret: str = TEST_JWT_SECRET, exp_offset: int = 3600) -> dict:
    return {"Authorization": f"Bearer {make_token(user_id, email, secret, exp_offset)}"}


@pytest.fixture(autouse=True)
def reset_server_state(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
    seed_initial_multiplayer_lobbies()


def test_admin_status_solo_and_multiplayer():
    client = TestClient(app)

    # 1. Solo sandbox game
    res = client.get("/api/admin/status?game_id=proto_1901")
    assert res.status_code == 200
    data = res.json()
    assert data["is_creator"] is True

    # 2. Multiplayer Match #104: Creator is bismarck@diplomacy.eu / bot_bismarck
    # Test with verified JWT
    res_bismarck = client.get(
        "/api/admin/status?game_id=mp_concert_104",
        headers=make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu"),
    )
    assert res_bismarck.status_code == 200
    assert res_bismarck.json()["is_creator"] is True

    # Test with legacy headers fallback on GET status
    res_bismarck_legacy = client.get(
        "/api/admin/status?game_id=mp_concert_104",
        headers={"X-User-Id": "bot_bismarck", "X-User-Email": "bismarck@diplomacy.eu"},
    )
    assert res_bismarck_legacy.status_code == 200
    assert res_bismarck_legacy.json()["is_creator"] is True

    # Non-creator (Tsar Nicholas / bot_romanov)
    res_romanov = client.get(
        "/api/admin/status?game_id=mp_concert_104",
        headers=make_auth_headers("bot_romanov", "tsar@diplomacy.eu"),
    )
    assert res_romanov.status_code == 200
    assert res_romanov.json()["is_creator"] is False


def test_admin_security_enforcement():
    client = TestClient(app)
    game_id = "mp_concert_104"

    # 1. Unauthenticated calls without a valid Bearer token fail with 401 Unauthorized
    unauth_headers = {"X-User-Id": "random_intruder", "X-User-Email": "intruder@evil.org"}
    r_unauth = client.post(f"/api/admin/rollback?game_id={game_id}", headers=unauth_headers)
    assert r_unauth.status_code == 401
    assert "Authentication required" in r_unauth.json()["detail"]

    # 2. Authenticated non-creator calls must fail with 403 Forbidden
    headers_intruder = make_auth_headers("random_intruder", "intruder@evil.org")

    r1 = client.post(f"/api/admin/rollback?game_id={game_id}", headers=headers_intruder)
    assert r1.status_code == 403
    assert "Administrator access denied" in r1.json()["detail"]

    r2 = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        json={"unit_id": "GER_A_BER", "new_province": "MUN"},
        headers=headers_intruder,
    )
    assert r2.status_code == 403

    r3 = client.post(
        f"/api/admin/unit/spawn?game_id={game_id}",
        json={"power": "GERMANY", "unit_type": "A", "province": "SIL"},
        headers=headers_intruder,
    )
    assert r3.status_code == 403

    r4 = client.post(
        f"/api/admin/unit/destroy?game_id={game_id}",
        json={"unit_id": "GER_A_BER"},
        headers=headers_intruder,
    )
    assert r4.status_code == 403

    r5 = client.post(
        f"/api/admin/set-turn?game_id={game_id}",
        json={"season": "Fall", "year": 1902, "phase": "Movement"},
        headers=headers_intruder,
    )
    assert r5.status_code == 403

    r6 = client.post(
        f"/api/admin/ownership?game_id={game_id}",
        json={"province": "BEL", "power": "GERMANY"},
        headers=headers_intruder,
    )
    assert r6.status_code == 403

    r7 = client.post(
        f"/api/adjudicate?game_id={game_id}",
        headers=headers_intruder,
    )
    assert r7.status_code == 403
    assert "Administrator access denied" in r7.json()["detail"]

    r8 = client.post(
        f"/api/admin/unfinalize-all?game_id={game_id}",
        headers=headers_intruder,
    )
    assert r8.status_code == 403


def test_admin_rollback_turn():
    client = TestClient(app)
    creator_headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")
    game_id = "mp_concert_104"

    # Initially at Spring 1901 Movement
    initial_res = client.get(f"/api/game?game_id={game_id}")
    assert initial_res.json()["state"]["season"] == "Spring"
    assert initial_res.json()["state"]["year"] == 1901

    # Attempt rollback before any turns have advanced -> 400
    rb_fail = client.post(f"/api/admin/rollback?game_id={game_id}", headers=creator_headers)
    assert rb_fail.status_code == 400

    # Adjudicate turn to advance to Fall 1901
    adj_res = client.post(f"/api/adjudicate?game_id={game_id}", headers=creator_headers)
    assert adj_res.status_code == 200
    assert adj_res.json()["season"] == "Fall"
    assert adj_res.json()["year"] == 1901

    # Status check indicates can_rollback is True
    st_res = client.get(f"/api/admin/status?game_id={game_id}", headers=creator_headers)
    assert st_res.json()["can_rollback"] is True
    assert st_res.json()["history_count"] == 1

    # Roll back as creator
    rb_res = client.post(f"/api/admin/rollback?game_id={game_id}", headers=creator_headers)
    assert rb_res.status_code == 200
    restored = rb_res.json()
    assert restored["season"] == "Spring"
    assert restored["year"] == 1901
    assert any("[ADMIN OVERRIDE] Rolled back turn" in h for h in restored["turn_history"])


def test_admin_move_unit():
    client = TestClient(app)
    creator_headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")
    game_id = "mp_concert_104"

    # Move GER_A_BER to SIL
    res = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        json={"unit_id": "GER_A_BER", "new_province": "SIL"},
        headers=creator_headers,
    )
    assert res.status_code == 200
    updated_state = res.json()
    unit = next(u for u in updated_state["units"] if u["id"] == "GER_A_BER")
    assert unit["province"] == "SIL"
    assert updated_state["orders"]["GER_A_BER"]["origin"] == "SIL"

    # Invalid moves:
    # 1. Army to Sea
    bad_sea = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        json={"unit_id": "GER_A_BER", "new_province": "BAL"},
        headers=creator_headers,
    )
    assert bad_sea.status_code == 400
    assert "sea province" in bad_sea.json()["detail"]

    # 2. Fleet to Inland
    bad_land = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        json={"unit_id": "GER_F_KIE", "new_province": "MUN"},
        headers=creator_headers,
    )
    assert bad_land.status_code == 400
    assert "inland province" in bad_land.json()["detail"]

    # 3. Unit to Impassable
    bad_swi = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        json={"unit_id": "GER_A_BER", "new_province": "SWI"},
        headers=creator_headers,
    )
    assert bad_swi.status_code == 400
    assert "impassable" in bad_swi.json()["detail"]


def test_admin_spawn_and_destroy_units():
    client = TestClient(app)
    creator_headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")
    game_id = "mp_concert_104"

    # Spawn Austrian Army in TYR
    spawn_res = client.post(
        f"/api/admin/unit/spawn?game_id={game_id}",
        json={"power": "AUSTRIA", "unit_type": "A", "province": "TYR"},
        headers=creator_headers,
    )
    assert spawn_res.status_code == 200
    state = spawn_res.json()
    spawned = next((u for u in state["units"] if u["province"] == "TYR"), None)
    assert spawned is not None
    assert spawned["power"] == "AUSTRIA"
    assert spawned["unit_type"] == "A"

    # Destroy the newly spawned unit
    destroy_res = client.post(
        f"/api/admin/unit/destroy?game_id={game_id}",
        json={"unit_id": spawned["id"]},
        headers=creator_headers,
    )
    assert destroy_res.status_code == 200
    state_after = destroy_res.json()
    assert not any(u["id"] == spawned["id"] for u in state_after["units"])


def test_admin_set_turn_and_ownership():
    client = TestClient(app)
    creator_headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")
    game_id = "mp_concert_104"

    # Set clock
    turn_res = client.post(
        f"/api/admin/set-turn?game_id={game_id}",
        json={"season": "Fall", "year": 1905, "phase": "Retreats"},
        headers=creator_headers,
    )
    assert turn_res.status_code == 200
    assert turn_res.json()["season"] == "Fall"
    assert turn_res.json()["year"] == 1905
    assert turn_res.json()["phase"] == "Retreats"

    # Set ownership of BEL to GERMANY
    own_res = client.post(
        f"/api/admin/ownership?game_id={game_id}",
        json={"province": "BEL", "power": "GERMANY"},
        headers=creator_headers,
    )
    assert own_res.status_code == 200
    assert own_res.json()["ownership"]["BEL"] == "GERMANY"

    # Clear ownership of BEL (reset to Neutral)
    clear_res = client.post(
        f"/api/admin/ownership?game_id={game_id}",
        json={"province": "BEL", "power": None},
        headers=creator_headers,
    )
    assert clear_res.status_code == 200
    assert "BEL" not in clear_res.json()["ownership"]


# -------------------------------------------------------------
# Cryptographic Supabase JWT Authorization Tests
# -------------------------------------------------------------
def test_admin_jwt_valid_creator():
    client = TestClient(app)
    game_id = "mp_concert_104"
    token = make_token("bot_bismarck", "bismarck@diplomacy.eu")
    res = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"unit_id": "GER_A_BER", "new_province": "SIL"},
    )
    assert res.status_code == 200
    assert any(u["id"] == "GER_A_BER" and u["province"] == "SIL" for u in res.json()["units"])


def test_admin_jwt_non_creator_forbidden():
    client = TestClient(app)
    game_id = "mp_concert_104"
    token = make_token("bot_romanov", "tsar@diplomacy.eu")
    res = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"unit_id": "GER_A_BER", "new_province": "SIL"},
    )
    assert res.status_code == 403
    assert "Administrator access denied" in res.json()["detail"]


def test_admin_jwt_expired():
    client = TestClient(app)
    game_id = "mp_concert_104"
    token = make_token("bot_bismarck", "bismarck@diplomacy.eu", exp_offset=-3600)
    res = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"unit_id": "GER_A_BER", "new_province": "SIL"},
    )
    assert res.status_code == 401
    assert "Authentication token has expired" in res.json()["detail"]


def test_admin_jwt_tampered_signature():
    client = TestClient(app)
    game_id = "mp_concert_104"
    token = make_token("bot_bismarck", "bismarck@diplomacy.eu")
    parts = token.split(".")
    tampered_sig = parts[2][:-4] + ("AAAA" if not parts[2].endswith("AAAA") else "BBBB")
    tampered_token = f"{parts[0]}.{parts[1]}.{tampered_sig}"
    res = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        headers={"Authorization": f"Bearer {tampered_token}"},
        json={"unit_id": "GER_A_BER", "new_province": "SIL"},
    )
    assert res.status_code == 401
    assert "Invalid authentication token" in res.json()["detail"]


def test_admin_solo_sandbox_unauthenticated():
    client = TestClient(app)
    res = client.post(
        "/api/admin/unit/move?game_id=proto_1901",
        json={"unit_id": "FRA_A_PAR", "new_province": "BUR"},
    )
    assert res.status_code == 200
    assert any(u["id"] == "FRA_A_PAR" and u["province"] == "BUR" for u in res.json()["units"])


def test_admin_multiplayer_lobby_lifecycle_with_jwt():
    client = TestClient(app)
    # 1. Create a multiplayer lobby with User A
    res_create = client.post(
        "/api/games",
        json={"name": "Lifecycle Room", "creator_power": "ENGLAND", "user_id": "user_a", "email": "a@uk.gov"},
    )
    assert res_create.status_code == 200
    gid = res_create.json()["game_id"]

    token_a = make_token("user_a", "a@uk.gov")
    token_b = make_token("user_b", "b@france.gov")

    # User B joins as France
    res_join = client.post(
        f"/api/games/{gid}/join",
        json={"power": "FRANCE", "user_id": "user_b", "email": "b@france.gov"},
    )
    assert res_join.status_code == 200

    # 2. Attempt admin action as User B -> rejected with 403 Forbidden
    res_b_admin = client.post(
        f"/api/admin/set-turn?game_id={gid}",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"season": "Fall", "year": 1901, "phase": "Movement"},
    )
    assert res_b_admin.status_code == 403
    assert "Administrator access denied" in res_b_admin.json()["detail"]

    # 3. Perform admin action as User A -> succeeds and broadcasts WebSocket event to room
    with client.websocket_connect(f"/ws/games/{gid}") as ws:
        init_event = ws.receive_json()
        assert init_event["type"] == "game_update"

        res_a_admin = client.post(
            f"/api/admin/set-turn?game_id={gid}",
            headers={"Authorization": f"Bearer {token_a}"},
            json={"season": "Fall", "year": 1901, "phase": "Movement"},
        )
        assert res_a_admin.status_code == 200
        assert res_a_admin.json()["season"] == "Fall"

        ws_event = ws.receive_json()
        assert ws_event["type"] == "game_update"
        assert ws_event["state"]["season"] == "Fall"


@pytest.mark.parametrize(
    "season, year, phase",
    [
        ("Spring", 1902, "Adjustments"),
        ("Fall", 1902, "Adjustments"),
        ("Winter", 1902, "Movement"),
        ("Winter", 1902, "Retreats"),
        ("Spring", 1900, "Movement"),
        ("Spring", -5, "Movement"),
    ],
)
def test_set_turn_refuses_impossible_turns_and_leaves_the_game_readable(season, year, phase):
    client = TestClient(app)
    game_before = GAMES["proto_1901"].model_copy(deep=True)

    res = client.post(
        "/api/admin/set-turn?game_id=proto_1901",
        json={"season": season, "year": year, "phase": phase},
    )

    assert res.status_code == 400
    assert client.get("/api/game?game_id=proto_1901").status_code == 200
    current = GAMES["proto_1901"]
    assert (current.season, current.year, current.phase) == (
        game_before.season,
        game_before.year,
        game_before.phase,
    )


@pytest.mark.parametrize(
    "season, phase",
    [
        ("Spring", "Movement"),
        ("Spring", "Retreats"),
        ("Fall", "Movement"),
        ("Fall", "Retreats"),
        ("Winter", "Adjustments"),
    ],
)
def test_set_turn_accepts_every_real_turn(season, phase):
    client = TestClient(app)
    res = client.post(
        "/api/scenario?game_id=proto_1901", json={"scenario_id": "standard_1901"}
    )
    assert res.status_code == 200

    res = client.post(
        "/api/admin/set-turn?game_id=proto_1901",
        json={"season": season, "year": 1902, "phase": phase},
    )

    assert res.status_code == 200
    assert client.get("/api/game?game_id=proto_1901").status_code == 200
    client.post("/api/scenario?game_id=proto_1901", json={"scenario_id": "standard_1901"})


@pytest.mark.parametrize("province", ["BUR", "NTH", "SWI"])
def test_ownership_is_only_for_supply_centers(province):
    client = TestClient(app)

    res = client.post(
        "/api/admin/ownership?game_id=proto_1901",
        json={"province": province, "power": "FRANCE"},
    )

    assert res.status_code == 400
    assert province not in GAMES["proto_1901"].ownership


client = TestClient(app)


def _armies_and_fleets_at(game_id, province):
    return [(u.unit_type, u.coast) for u in GAMES[game_id].units if u.province == province]


@pytest.mark.parametrize("province", ["SPA", "STP", "BUL"])
def test_army_placed_by_admin_on_a_split_coast_province_has_no_coast(province):
    game_id = "mp_concert_104"
    headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")

    moved = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        json={"unit_id": "GER_A_MUN", "new_province": province},
        headers=headers,
    )
    assert moved.status_code == 200
    assert _armies_and_fleets_at(game_id, province) == [(UnitType.ARMY, None)]

    GAMES[game_id].units = [u for u in GAMES[game_id].units if u.province != province]
    spawned = client.post(
        f"/api/admin/unit/spawn?game_id={game_id}",
        json={"power": "FRANCE", "unit_type": "A", "province": province, "coast": "SC"},
        headers=headers,
    )
    assert spawned.status_code == 200
    assert _armies_and_fleets_at(game_id, province) == [(UnitType.ARMY, None)]


def test_fleet_placed_by_admin_keeps_its_coast():
    game_id = "mp_concert_104"
    headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")

    chosen = client.post(
        f"/api/admin/unit/spawn?game_id={game_id}",
        json={"power": "FRANCE", "unit_type": "F", "province": "SPA", "coast": "SC"},
        headers=headers,
    )
    assert chosen.status_code == 200
    assert _armies_and_fleets_at(game_id, "SPA") == [(UnitType.FLEET, "SC")]

    defaulted = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        json={"unit_id": "GER_F_KIE", "new_province": "BUL"},
        headers=headers,
    )
    assert defaulted.status_code == 200
    assert _armies_and_fleets_at(game_id, "BUL") == [(UnitType.FLEET, "EC")]


def test_army_placed_by_admin_is_a_real_unit_that_captures_its_province():
    game_id = "mp_concert_104"
    headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")
    client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        json={"unit_id": "FRA_A_MAR", "new_province": "SPA"},
        headers=headers,
    )
    game = GAMES[game_id]
    game.season = "Fall"

    resolved = client.post(f"/api/adjudicate?game_id={game_id}", headers=headers).json()

    assert resolved["ownership"]["SPA"] == "FRANCE"
    assert [u["province"] for u in resolved["units"] if u["id"] == "FRA_A_MAR"] == ["SPA"]
