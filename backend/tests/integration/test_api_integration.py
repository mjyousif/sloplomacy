import pytest
from domain.models import Order, OrderType, Power, Unit, UnitType
from engine.order_utils import (
    create_default_orders,
    get_required_finalizing_powers,
    resolve_static_path,
)
from engine.topology import PROVINCES
from fastapi.testclient import TestClient
from main import app
from storage.store import GAME_HISTORY, GAME_SUMMARIES, GAMES, evict_game

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_jwt_secret(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret-at-least-32-chars-long-12345")


def test_api_404_error_handling():
    """Verify that invalid game IDs or unknown unit IDs return 404 status codes."""
    # Unknown game lookup
    res_get = client.get("/api/game?game_id=ghost_game_9999")
    assert res_get.status_code == 404
    assert "not found" in res_get.json()["detail"].lower()

    # Unknown game join
    res_join = client.post(
        "/api/games/ghost_game_9999/join",
        json={
            "power": "FRANCE",
            "user_id": "usr_test",
            "email": "test@test.com",
            "display_name": "Tester",
        },
    )
    assert res_join.status_code == 404

    # Unknown unit order in valid default game
    res_order = client.post(
        "/api/order",
        json={
            "order": {
                "unit_id": "NON_EXISTENT_UNIT",
                "power": "FRANCE",
                "unit_type": "A",
                "origin": "PAR",
                "order_type": "MOVE",
                "target": "BUR",
                "is_explicit": True,
            }
        },
    )
    assert res_order.status_code == 404


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


def test_api_clear_foreign_pre_moves():
    """Clear foreign pre-moves wipes other powers' hypothetical orders while preserving active power orders."""
    client.post("/api/scenario", json={"scenario_id": "standard_1901", "active_power": "FRANCE"})

    # France move
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

    # Germany move
    client.post(
        "/api/order",
        json={
            "order": {
                "unit_id": "GER_A_BER",
                "power": "GERMANY",
                "unit_type": "A",
                "origin": "BER",
                "order_type": "MOVE",
                "target": "KIE",
                "is_explicit": True,
            }
        },
    )

    # Clear foreign orders for France
    clr_res = client.post("/api/sandbox/clear-foreign", json={"power": "FRANCE"})
    assert clr_res.status_code == 200
    st = clr_res.json()
    assert st["orders"]["FRA_A_PAR"]["order_type"] == "MOVE"
    assert st["orders"]["FRA_A_PAR"]["target"] == "BUR"
    assert st["orders"]["GER_A_BER"]["order_type"] == "HOLD"
    assert st["orders"]["GER_A_BER"]["is_explicit"] is False


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


def test_illegal_move_does_not_teleport_through_the_full_turn_cycle():
    game_id = _new_game()
    client.post(f"/api/order?game_id={game_id}", json={"order": _order_payload(target="MOS")})

    state = client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).json()

    assert next(u for u in state["units"] if u["id"] == "FRA_A_PAR")["province"] == "PAR"


def test_scenario_refuses_unknown_scenarios_and_unknown_games():
    game_id = _new_game()
    games_before = len(GAMES)

    bad_scenario = client.post(
        f"/api/scenario?game_id={game_id}", json={"scenario_id": "not-a-scenario"}
    )
    bad_game = client.post("/api/scenario?game_id=junk_game", json={"scenario_id": "standard_1901"})

    assert bad_scenario.status_code == 400
    assert bad_game.status_code == 404
    assert len(GAMES) == games_before


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


def test_rollback_reopens_a_finished_game():
    game_id = _new_game()
    client.post(
        f"/api/games/{game_id}/join",
        json={"power": "GERMANY", "user_id": "guest2", "email": "guest2@test.com"},
    )
    _put_game_one_center_from_a_solo(game_id)
    client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers())

    state = client.post(
        f"/api/admin/rollback?game_id={game_id}",
        headers=_auth_headers(),
        json={"user_id": "host", "email": "host@test.com"},
    ).json()

    assert state["winner"] is None
    assert client.get(f"/api/games/{game_id}").json()["status"] == "active"
    assert (
        client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).json()["winner"]
        == "FRANCE"
    )


@pytest.mark.parametrize(
    "requested",
    [
        "../secret.txt",
        "..%2fsecret.txt".replace("%2f", "/"),
        "assets/../../secret.txt",
        "../static-evil/index.html",
        "/etc/passwd",
        "//etc/passwd",
        "bad\x00name",
        "",
        "assets",
        "missing.js",
    ],
)
def test_static_lookup_never_leaves_the_static_folder(tmp_path, requested):
    root = tmp_path / "static"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text("app")
    (tmp_path / "secret.txt").write_text("secret")
    (tmp_path / "static-evil").mkdir()
    (tmp_path / "static-evil" / "index.html").write_text("evil")

    assert resolve_static_path(str(root), requested) is None


def test_static_lookup_does_not_follow_links_out_of_the_folder(tmp_path):
    root = tmp_path / "static"
    root.mkdir()
    (tmp_path / "secret.txt").write_text("secret")
    (root / "link.txt").symlink_to(tmp_path / "secret.txt")

    assert resolve_static_path(str(root), "link.txt") is None


def test_static_lookup_finds_real_files(tmp_path):
    root = tmp_path / "static"
    (root / "assets").mkdir(parents=True)
    (root / "favicon.svg").write_text("icon")
    (root / "assets" / "app.js").write_text("js")

    assert resolve_static_path(str(root), "favicon.svg") == str((root / "favicon.svg").resolve())
    assert resolve_static_path(str(root), "assets/app.js") == str(
        (root / "assets" / "app.js").resolve()
    )


def test_joining_does_not_change_the_power_other_players_see():
    game_id = _new_game("ENGLAND")

    joined = client.post(
        f"/api/games/{game_id}/join",
        json={"power": "RUSSIA", "user_id": "friend", "email": "friend@test.com"},
    )

    assert joined.status_code == 200
    assert joined.json()["state"]["active_power"] == "RUSSIA"
    assert GAMES[game_id].active_power == Power.ENGLAND
    assert client.get(f"/api/game?game_id={game_id}").json()["state"]["active_power"] == "ENGLAND"


def test_reentering_a_saved_sandbox_still_switches_its_power():
    game_id = _new_game("ENGLAND")
    saved = client.post(
        f"/api/games/save-sandbox?game_id={game_id}",
        json={"name": "Study", "user_id": "host", "email": "host@test.com"},
    ).json()["game_id"]

    client.post(
        f"/api/games/{saved}/join",
        json={"power": "TURKEY", "user_id": "host", "email": "host@test.com"},
    )

    assert GAMES[saved].active_power == Power.TURKEY


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


def _enter_sandbox(game_id, power="FRANCE"):
    res = client.post(f"/api/sandbox/enter?game_id={game_id}", json={"power": power})
    assert res.status_code == 200
    return res.json()


def _exit_sandbox(sandbox_id, power="FRANCE"):
    res = client.post(f"/api/sandbox/exit?game_id={sandbox_id}", json={"power": power})
    assert res.status_code == 200
    return res.json()


def test_opening_a_sandbox_leaves_an_opponents_finalized_orders_alone():
    game_id = _seated_game()
    _germany_moves_to_silesia(game_id)
    client.post(f"/api/finalize?game_id={game_id}", json={"power": "GERMANY", "force": True})

    sandbox = _enter_sandbox(game_id)
    _exit_sandbox(sandbox["game_id"])

    assert GAMES[game_id].finalized_powers == [Power.GERMANY]
    assert GAMES[game_id].orders["GER_A_BER"].order_type == OrderType.MOVE
    assert GAMES[game_id].orders["GER_A_BER"].target == "SIL"


def test_sandbox_runs_on_a_private_copy_that_hides_opponents_orders():
    game_id = _seated_game()
    _germany_moves_to_silesia(game_id)
    real_game = GAMES[game_id]

    sandbox = _enter_sandbox(game_id)

    assert sandbox["game_id"] != game_id
    assert GAMES[game_id] is real_game
    assert sandbox["orders"]["GER_A_BER"]["order_type"] == "HOLD"
    assert sandbox["orders"]["GER_A_BER"]["target"] is None
    # Nor does it reveal an order through any preview of the copy.
    assert sandbox["last_resolution"]["resolutions"]["GER_A_BER"]["order_type"] == "HOLD"


def test_hypothetical_orders_never_reach_the_real_match():
    game_id = _seated_game()
    real_germany_order = GAMES[game_id].orders["GER_A_BER"].model_copy()
    sandbox_id = _enter_sandbox(game_id)["game_id"]

    _germany_moves_to_silesia(sandbox_id)
    res = client.post(f"/api/sandbox/ai-orders?game_id={sandbox_id}", json={"include_active": True})
    assert res.status_code == 200
    assert GAMES[game_id].orders["GER_A_BER"] == real_germany_order

    _exit_sandbox(sandbox_id)
    assert GAMES[game_id].orders["GER_A_BER"] == real_germany_order
    assert sandbox_id not in GAMES


def test_stepping_turns_in_a_sandbox_leaves_the_real_match_on_its_turn():
    game_id = _seated_game()
    sandbox_id = _enter_sandbox(game_id)["game_id"]

    assert client.post(f"/api/sandbox/ai-step?game_id={sandbox_id}").status_code == 200

    assert GAMES[sandbox_id].season == "Fall"
    assert GAMES[game_id].season == "Spring"


def test_own_sandbox_orders_carry_over_to_the_real_match():
    game_id = _seated_game()
    sandbox_id = _enter_sandbox(game_id)["game_id"]
    client.post(f"/api/order?game_id={sandbox_id}", json={"order": _order_payload(target="BUR")})

    state = _exit_sandbox(sandbox_id)

    assert state["game_id"] == game_id
    assert state["orders"]["FRA_A_PAR"]["target"] == "BUR"
    assert GAMES[game_id].orders["FRA_A_PAR"].target == "BUR"


def test_changing_own_orders_in_a_sandbox_drops_finalization_like_a_real_edit():
    game_id = _seated_game()
    client.post(f"/api/finalize?game_id={game_id}", json={"power": "FRANCE", "force": True})
    sandbox_id = _enter_sandbox(game_id)["game_id"]
    client.post(f"/api/order?game_id={sandbox_id}", json={"order": _order_payload(target="BUR")})

    _exit_sandbox(sandbox_id)

    assert GAMES[game_id].finalized_powers == []


def test_browsing_a_sandbox_without_changes_keeps_own_finalization():
    game_id = _seated_game()
    client.post(f"/api/finalize?game_id={game_id}", json={"power": "FRANCE", "force": True})

    _exit_sandbox(_enter_sandbox(game_id)["game_id"])

    assert GAMES[game_id].finalized_powers == [Power.FRANCE]


def test_own_sandbox_orders_are_dropped_if_the_match_moved_on():
    game_id = _seated_game()
    sandbox_id = _enter_sandbox(game_id)["game_id"]
    client.post(f"/api/order?game_id={sandbox_id}", json={"order": _order_payload(target="BUR")})

    for power in ("FRANCE", "GERMANY"):
        client.post(f"/api/finalize?game_id={game_id}", json={"power": power, "force": True})
    assert GAMES[game_id].season == "Fall"

    state = _exit_sandbox(sandbox_id)

    assert state["season"] == "Fall"
    assert state["orders"]["FRA_A_PAR"]["order_type"] == "HOLD"


def test_sandbox_orders_do_not_return_after_the_player_left_the_seat():
    game_id = _seated_game()
    sandbox_id = _enter_sandbox(game_id, "GERMANY")["game_id"]
    _germany_moves_to_silesia(sandbox_id)
    client.post(
        f"/api/games/{game_id}/surrender",
        json={"power": "GERMANY", "user_id": "bob", "leave": True},
    )

    _exit_sandbox(sandbox_id, "GERMANY")

    assert GAMES[game_id].orders["GER_A_BER"].order_type == OrderType.HOLD


def test_one_player_keeps_one_sandbox_per_match():
    game_id = _seated_game()
    first = _enter_sandbox(game_id)["game_id"]
    second = _enter_sandbox(game_id)["game_id"]

    assert first not in GAMES
    assert second in GAMES


def test_each_player_has_their_own_sandbox():
    game_id = _seated_game()
    host_sandbox = _enter_sandbox(game_id, "FRANCE")["game_id"]
    bob_sandbox = _enter_sandbox(game_id, "GERMANY")["game_id"]
    _germany_moves_to_silesia(bob_sandbox)

    assert host_sandbox != bob_sandbox
    assert GAMES[host_sandbox].orders["GER_A_BER"].order_type == OrderType.HOLD


def test_deleting_a_match_removes_its_sandboxes():
    game_id = _seated_game()
    sandbox_id = _enter_sandbox(game_id)["game_id"]

    assert client.delete(f"/api/games/{game_id}", headers=_auth_headers()).status_code == 200

    assert sandbox_id not in GAMES
    assert (
        client.post(f"/api/sandbox/exit?game_id={sandbox_id}", json={"power": "FRANCE"}).status_code
        == 404
    )


@pytest.mark.parametrize(
    "path",
    [
        "/api/sandbox/exit",
        "/api/sandbox/clear-foreign",
        "/api/sandbox/ai-orders",
        "/api/sandbox/ai-step",
    ],
)
def test_sandbox_writes_are_refused_on_a_live_match(path):
    game_id = _seated_game()
    _germany_moves_to_silesia(game_id)
    orders_before = {k: v.model_copy() for k, v in GAMES[game_id].orders.items()}

    res = client.post(f"{path}?game_id={game_id}", json={"power": "FRANCE"})

    assert res.status_code == 409
    assert GAMES[game_id].orders == orders_before
    assert GAMES[game_id].season == "Spring"


def test_saved_sandbox_keeps_its_own_board():
    save = client.post(
        "/api/games/save-sandbox",
        json={"name": "Study", "user_id": "host", "email": "host@test.com"},
    )
    game_id = save.json()["game_id"]

    assert _enter_sandbox(game_id)["game_id"] == game_id
    assert _exit_sandbox(game_id)["game_id"] == game_id


def test_shared_default_board_cannot_be_deleted():
    res = client.delete("/api/games/proto_1901")

    assert res.status_code == 403
    assert "proto_1901" in GAMES
    assert client.get("/api/game?game_id=proto_1901").status_code == 200


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


def _claim(game_id, power, user_id):
    res = client.post(
        f"/api/games/{game_id}/join",
        json={"power": power, "user_id": user_id, "email": f"{user_id}@test.com"},
    )
    assert res.status_code == 200


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


def test_scenario_reset_on_a_live_match_needs_the_host():
    game_id = _seated_game()
    client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers())
    reset = {"scenario_id": "standard_1901"}

    nobody = client.post(f"/api/scenario?game_id={game_id}", json=reset)
    bob = client.post(
        f"/api/scenario?game_id={game_id}", json=reset, headers=_auth_headers("bob", "bob@test.com")
    )

    assert nobody.status_code == 401
    assert bob.status_code == 403
    assert GAMES[game_id].season == "Fall"

    host = client.post(f"/api/scenario?game_id={game_id}", json=reset, headers=_auth_headers())
    assert host.status_code == 200
    assert GAMES[game_id].season == "Spring"


def test_scenario_reset_stays_open_on_solo_and_saved_boards():
    assert client.post("/api/scenario", json={"scenario_id": "standard_1901"}).status_code == 200
    saved = client.post(
        "/api/games/save-sandbox",
        json={"name": "Study", "user_id": "host", "email": "host@test.com"},
    ).json()["game_id"]

    res = client.post(f"/api/scenario?game_id={saved}", json={"scenario_id": "standard_1901"})

    assert res.status_code == 200


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


def _solo_game_at(season, phase):
    """A saved sandbox: one player, so ai-step is allowed and its active power matters."""
    game_id = client.post(
        "/api/games/save-sandbox",
        json={"name": "Study", "user_id": "host", "email": "host@test.com"},
    ).json()["game_id"]
    _set_turn(game_id, season, phase)
    return game_id


def test_ai_step_plans_builds_for_a_player_who_chose_nothing():
    game_id = _solo_game_at("Winter", "Adjustments")
    GAMES[game_id].active_power = Power.FRANCE
    _remove_unit(game_id, "FRA_A_PAR")
    client.get(f"/api/game?game_id={game_id}")

    state = client.post(f"/api/sandbox/ai-step?game_id={game_id}").json()

    assert sum(u["power"] == "FRANCE" for u in state["units"]) == 3


def test_ai_step_keeps_a_build_decision_the_player_made():
    game_id = _solo_game_at("Winter", "Adjustments")
    GAMES[game_id].active_power = Power.FRANCE
    _remove_unit(game_id, "FRA_A_PAR")
    client.get(f"/api/game?game_id={game_id}")
    waive = {
        "unit_id": "BUILD_FRANCE_PAR",
        "power": "FRANCE",
        "unit_type": "A",
        "origin": "PAR",
        "order_type": "WAIVE",
        "is_explicit": True,
    }
    client.post(f"/api/order?game_id={game_id}", json={"order": waive})

    state = client.post(f"/api/sandbox/ai-step?game_id={game_id}").json()

    assert sum(u["power"] == "FRANCE" for u in state["units"]) == 2


def test_rollback_hands_every_player_their_orders_back():
    game_id = _seated_game()
    _germany_moves_to_silesia(game_id)
    _finalize(game_id, "FRANCE")
    _finalize(game_id, "GERMANY")
    assert GAMES[game_id].season == "Fall"

    state = client.post(f"/api/admin/rollback?game_id={game_id}", headers=_auth_headers()).json()

    assert state["season"] == "Spring"
    assert state["finalized_powers"] == []
    assert state["orders"]["GER_A_BER"]["target"] == "SIL"
    # The turn does not resolve again until the players say so.
    assert GAMES[game_id].season == "Spring"


def test_rollback_recomputes_what_a_snapshot_leaves_out():
    game_id = _seated_game()
    client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers())
    snapshot = GAME_HISTORY[game_id][-1]
    assert snapshot.last_resolution is None

    state = client.post(f"/api/admin/rollback?game_id={game_id}", headers=_auth_headers()).json()

    assert state["last_resolution"] is not None


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


def test_api_test_seed_scenarios_and_security(monkeypatch):
    # 1. Production environment (no ENVIRONMENT or ENABLE_TEST_SEED_ENDPOINT) -> 403 Forbidden
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("ALLOW_INSECURE_DEV_AUTH", raising=False)
    monkeypatch.delenv("ENABLE_TEST_SEED_ENDPOINT", raising=False)
    res_prod = client.post(
        "/api/test/seed",
        json={"scenario_id": "standard_1901", "game_id": "test_seed_game"},
    )
    assert res_prod.status_code == 403

    # 2. Enable via ENVIRONMENT=test
    monkeypatch.setenv("ENVIRONMENT", "test")

    # Test seeding standard 1901
    res = client.post(
        "/api/test/seed",
        json={"scenario_id": "standard_1901", "game_id": "test_seed_game"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["season"] == "Spring"
    assert data["phase"] == "Movement"
    assert data["year"] == 1901
    assert data["active_power"] == "FRANCE"

    # Test seeding spring retreats demo (defaults to GERMANY, legal DATC retreats include MUN, GAS, PIC)
    res_ret = client.post(
        "/api/test/seed",
        json={"scenario_id": "spring_retreats_demo", "game_id": "test_seed_game"},
    )
    assert res_ret.status_code == 200
    ret_data = res_ret.json()
    assert ret_data["season"] == "Spring"
    assert ret_data["phase"] == "Retreats"
    assert ret_data["active_power"] == "GERMANY"
    assert ret_data["retreats"] is not None
    assert set(ret_data["retreats"]["GERMANY"]["A BUR"]) == {"RUH", "BEL", "MUN", "PIC", "GAS"}
    assert any(u.get("is_dislodged") for u in ret_data["units"])

    # Verify active_power does not leak when re-seeding standard_1901 without active_power
    res_reseed = client.post(
        "/api/test/seed",
        json={"scenario_id": "standard_1901", "game_id": "test_seed_game"},
    )
    assert res_reseed.status_code == 200
    assert res_reseed.json()["active_power"] == "FRANCE"

    # Verify explicit active_power override is respected even on spring_retreats_demo
    res_override = client.post(
        "/api/test/seed",
        json={
            "scenario_id": "spring_retreats_demo",
            "game_id": "test_seed_game",
            "active_power": "FRANCE",
        },
    )
    assert res_override.status_code == 200
    assert res_override.json()["active_power"] == "FRANCE"

    # Test seeding winter adjustments demo
    res_adj = client.post(
        "/api/test/seed",
        json={"scenario_id": "winter_adjustments_demo", "game_id": "test_seed_game"},
    )
    assert res_adj.status_code == 200
    adj_data = res_adj.json()
    assert adj_data["season"] == "Winter"
    assert adj_data["phase"] == "Adjustments"
    assert adj_data["active_power"] == "FRANCE"
    assert adj_data["builds"] is not None
    assert adj_data["builds"]["FRANCE"]["count"] == 2

    # Test unknown scenario
    res_bad = client.post(
        "/api/test/seed",
        json={"scenario_id": "nonexistent_scenario", "game_id": "test_seed_game"},
    )
    assert res_bad.status_code == 400

    # Verify Russia (+1 bicoastal STP build) and Austria (-1 deficit disband) in winter_adjustments_demo
    assert adj_data["builds"]["RUSSIA"]["count"] == 1
    assert "STP" in adj_data["builds"]["RUSSIA"]["homes"]
    assert adj_data["builds"]["AUSTRIA"]["count"] == -1

    # Test refusing to overwrite a multiplayer match
    mp_gid = _seated_game()
    res_mp = client.post(
        "/api/test/seed",
        json={"scenario_id": "standard_1901", "game_id": mp_gid},
    )
    assert res_mp.status_code == 403

    # Test refusing to overwrite an unloaded multiplayer match loaded from persistence
    saved_state = GAMES[mp_gid]
    saved_summary = GAME_SUMMARIES[mp_gid]
    evict_game(mp_gid)
    monkeypatch.setattr("storage.supabase.is_persistence_enabled", lambda: True)

    async def _fake_load(gid: str):
        if gid == mp_gid:
            return (saved_state, saved_summary, [], None)
        return None

    monkeypatch.setattr("storage.supabase.load_game_from_db", _fake_load)
    res_unloaded_mp = client.post(
        "/api/test/seed",
        json={"scenario_id": "standard_1901", "game_id": mp_gid},
    )
    assert res_unloaded_mp.status_code == 403


def test_gzip_compression_and_static_caching(tmp_path, monkeypatch):
    """
    Verify GZipMiddleware compresses large JSON responses to conserve Cloud Run egress,
    and static asset handlers set immutable Cache-Control headers.
    """
    # 1. GZip compression on large responses (> 1000 bytes)
    res_gzip = client.get("/api/game?game_id=proto_1901", headers={"Accept-Encoding": "gzip"})
    assert res_gzip.status_code == 200
    assert res_gzip.headers.get("content-encoding") == "gzip"

    res_raw = client.get("/api/game?game_id=proto_1901", headers={"Accept-Encoding": "identity"})
    assert res_raw.status_code == 200
    assert res_raw.headers.get("content-encoding") != "gzip"

    # 2. Cached static files
    from fastapi import FastAPI
    from main import CachedStaticFiles

    assets_dir = tmp_path / "assets"
    assets_dir.mkdir()
    asset_file = assets_dir / "bundle-test.js"
    asset_file.write_text("console.log('test');")

    static_app = FastAPI()
    static_app.mount("/assets", CachedStaticFiles(directory=str(assets_dir)), name="assets")
    static_client = TestClient(static_app)
    res_asset = static_client.get("/assets/bundle-test.js")
    assert res_asset.status_code == 200
    assert "public" in res_asset.headers.get("cache-control", "")
    assert "immutable" in res_asset.headers.get("cache-control", "")


# ==============================================================================
# Turn history (issue #123): past turns with every nation's orders and outcome
# ==============================================================================


def _bounce_in_burgundy(game_id):
    """France and Germany both move into Burgundy, so both bounce."""
    _order = {
        "unit_id": "GER_A_MUN",
        "power": "GERMANY",
        "unit_type": "A",
        "origin": "MUN",
        "order_type": "MOVE",
        "target": "BUR",
        "is_explicit": True,
    }
    assert client.post(f"/api/order?game_id={game_id}", json={"order": _order}).status_code == 200
    assert (
        client.post(f"/api/order?game_id={game_id}", json={"order": _order_payload()}).status_code
        == 200
    )


def test_a_new_game_has_no_turn_history():
    game_id = _new_game()
    res = client.get(f"/api/history?game_id={game_id}")
    assert res.status_code == 200
    assert res.json() == []
    assert client.get(f"/api/history/0?game_id={game_id}").status_code == 404


def test_turn_history_shows_every_nations_orders_and_what_happened():
    game_id = _seated_game()
    _bounce_in_burgundy(game_id)
    _finalize(game_id, "FRANCE")
    _finalize(game_id, "GERMANY")
    assert GAMES[game_id].season == "Fall"

    entries = client.get(f"/api/history?game_id={game_id}").json()
    assert entries == [{"index": 0, "season": "Spring", "year": 1901, "phase": "Movement"}]

    turn = client.get(f"/api/history/0?game_id={game_id}").json()
    assert turn["season"] == "Spring"
    assert turn["orders"]["FRA_A_PAR"]["target"] == "BUR"
    assert turn["orders"]["GER_A_MUN"]["target"] == "BUR"
    # The board is the one the turn began with.
    assert next(u for u in turn["units"] if u["id"] == "FRA_A_PAR")["province"] == "PAR"
    for unit_id in ("FRA_A_PAR", "GER_A_MUN"):
        res = turn["resolution"]["resolutions"][unit_id]
        assert res["succeeded"] is False
        assert res["bounced"] is True
    # Only what a past turn needs leaves the server.
    assert "timer" not in turn
    assert "turn_history" not in turn
    assert "finalized_powers" not in turn


def test_turn_history_follows_a_rollback():
    game_id = _seated_game()
    client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers())
    assert len(client.get(f"/api/history?game_id={game_id}").json()) == 1

    client.post(f"/api/admin/rollback?game_id={game_id}", headers=_auth_headers())

    assert client.get(f"/api/history?game_id={game_id}").json() == []


def test_turn_history_of_an_unknown_game_is_not_found():
    assert client.get("/api/history?game_id=ghost_game_9999").status_code == 404
