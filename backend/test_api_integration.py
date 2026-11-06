import pytest
from fastapi.testclient import TestClient
from main import GAMES, app, resolve_static_path
from map_data import PROVINCES
from models import Order, OrderType, Power, Unit, UnitType

client = TestClient(app)


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
        json={"name": "Regression", "creator_power": power, "user_id": "host", "email": "host@test.com"},
    )
    assert res.status_code == 200
    return res.json()["game_id"]


def _auth_headers(user_id="host", email="host@test.com"):
    import jwt
    token = jwt.encode({"sub": user_id, "email": email}, "test-secret-at-least-32-chars-long", algorithm="HS256")
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
    payload = _order_payload(unit_id="BUILD_FRANCE_ZZZ", origin="ZZZ", order_type="BUILD", target=None)

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
    illegal_move = client.post(f"/api/order?game_id={game_id}", json={"order": _order_payload(target="MOS")})

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
    assert client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).status_code == 200


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

    bad_scenario = client.post(f"/api/scenario?game_id={game_id}", json={"scenario_id": "not-a-scenario"})
    bad_game = client.post("/api/scenario?game_id=junk_game", json={"scenario_id": "standard_1901"})

    assert bad_scenario.status_code == 400
    assert bad_game.status_code == 404
    assert len(GAMES) == games_before


def _put_game_one_center_from_a_solo(game_id):
    game = GAMES[game_id]
    centers = sorted(p.id for p in PROVINCES.values() if p.is_supply_center and p.id not in ("TUN", "PAR"))[:16]
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
    assert client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).status_code == 409
    assert client.post(f"/api/sandbox/ai-step?game_id={game_id}").status_code == 409


def test_game_ends_only_after_the_retreat_of_the_deciding_turn():
    game_id = _new_game()
    _put_game_one_center_from_a_solo(game_id)
    game = GAMES[game_id]
    # The 18th center is defended, so taking it dislodges a unit that still has to retreat.
    game.units.append(Unit(id="TUR_A_TUN", power=Power.TURKEY, unit_type=UnitType.ARMY, province="TUN"))
    game.units.append(Unit(id="FRA_F_WES", power=Power.FRANCE, unit_type=UnitType.FLEET, province="WES"))
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
    assert client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).status_code == 409


def test_previewing_a_winning_turn_does_not_end_the_game():
    game_id = _new_game()
    _put_game_one_center_from_a_solo(game_id)

    state = client.get(f"/api/game?game_id={game_id}").json()["state"]

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
    assert client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).json()["winner"] == "FRANCE"


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
    assert resolve_static_path(str(root), "assets/app.js") == str((root / "assets" / "app.js").resolve())


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
        json={"name": "Consensus Test", "creator_power": "ENGLAND", "user_id": "host_george", "email": "king@uk.gov"},
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
    res = client.post(
        f"/api/sandbox/ai-orders?game_id={sandbox_id}", json={"include_active": True}
    )
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
    assert client.post(
        f"/api/sandbox/exit?game_id={sandbox_id}", json={"power": "FRANCE"}
    ).status_code == 404


@pytest.mark.parametrize(
    "path",
    ["/api/sandbox/exit", "/api/sandbox/clear-foreign", "/api/sandbox/ai-orders", "/api/sandbox/ai-step"],
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
