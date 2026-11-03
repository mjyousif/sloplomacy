from map_data import PROVINCES, get_initial_1901_units, get_initial_ownership, split_province_code
from models import IssueCode, Order, OrderType, Power, UnitType
from validator import validate_orders
from adjudicator import adjudicate_turn


def test_map_symmetry_and_75_provinces():
    # 75 playable provinces + 1 impassable Switzerland = 76 entries
    assert len(PROVINCES) == 76
    supply_centers = [p for p in PROVINCES.values() if p.is_supply_center]
    assert len(supply_centers) == 34

    # Check army adjacency symmetry
    for pid, pinfo in PROVINCES.items():
        for neighbor in pinfo.army_adj:
            assert neighbor in PROVINCES, f"{pid} references unknown army neighbor {neighbor}"
            assert pid in PROVINCES[neighbor].army_adj, f"Army adjacency {pid} <-> {neighbor} is not symmetric!"

    # Check fleet adjacency symmetry
    for pid, pinfo in PROVINCES.items():
        for coast, neighbors in pinfo.fleet_adj.items():
            full_self = f"{pid}/{coast}" if coast else pid
            for n_entry in neighbors:
                n_base, n_coast = split_province_code(n_entry)
                assert n_base in PROVINCES, f"{full_self} references unknown fleet neighbor {n_entry}"
                n_fleet_list = PROVINCES[n_base].fleet_adj.get(n_coast or "", [])
                assert full_self in n_fleet_list, f"Fleet adjacency {full_self} <-> {n_entry} is not symmetric!"


def test_self_bounce_and_unmatched_support_validation():
    units = get_initial_1901_units()
    orders = {
        u.id: Order(
            unit_id=u.id,
            power=u.power,
            unit_type=u.unit_type,
            origin=u.province,
            origin_coast=u.coast,
            order_type=OrderType.HOLD,
            is_explicit=True,
        )
        for u in units
    }

    # France orders A PAR -> BUR and A MAR -> BUR (Self-Bounce!)
    orders["FRA_A_PAR"].order_type = OrderType.MOVE
    orders["FRA_A_PAR"].target = "BUR"
    orders["FRA_A_MAR"].order_type = OrderType.MOVE
    orders["FRA_A_MAR"].target = "BUR"

    # England orders F EDI to support F LON -> NTH, while F LON is holding (Unmatched Support!)
    orders["ENG_F_EDI"].order_type = OrderType.SUPPORT
    orders["ENG_F_EDI"].aux_unit_origin = "LON"
    orders["ENG_F_EDI"].target = "NTH"

    issues = validate_orders(units, orders)
    codes = {i.code for i in issues}
    assert IssueCode.SELF_BOUNCE in codes
    assert IssueCode.UNMATCHED_SUPPORT in codes


def test_adjudicator_self_bounce_and_supported_advance():
    units = get_initial_1901_units()
    ownership = get_initial_ownership()
    orders = {
        u.id: Order(
            unit_id=u.id,
            power=u.power,
            unit_type=u.unit_type,
            origin=u.province,
            origin_coast=u.coast,
            order_type=OrderType.HOLD,
            is_explicit=True,
        )
        for u in units
    }

    # France self-bounces in BUR
    orders["FRA_A_PAR"].order_type = OrderType.MOVE
    orders["FRA_A_PAR"].target = "BUR"
    orders["FRA_A_MAR"].order_type = OrderType.MOVE
    orders["FRA_A_MAR"].target = "BUR"

    # Germany supports A MUN -> BUR? Wait: if France bounces in BUR (strength 1 vs 1), and Germany moves A MUN -> BUR (str 1), all three bounce!
    res = adjudicate_turn(units, orders, ownership)
    assert res.resolutions["FRA_A_PAR"].bounced is True
    assert res.resolutions["FRA_A_MAR"].bounced is True

    # Now if France supports A PAR -> BUR with A MAR, while Germany moves A MUN -> BUR (str 1):
    orders["FRA_A_MAR"].order_type = OrderType.SUPPORT
    orders["FRA_A_MAR"].aux_unit_origin = "PAR"
    orders["FRA_A_MAR"].target = "BUR"
    orders["GER_A_MUN"].order_type = OrderType.MOVE
    orders["GER_A_MUN"].target = "BUR"

    res2 = adjudicate_turn(units, orders, ownership)
    assert res2.resolutions["FRA_A_PAR"].succeeded is True
    assert res2.resolutions["FRA_A_PAR"].attack_strength == 2
    assert res2.resolutions["GER_A_MUN"].bounced is True


def test_fastapi_endpoints_and_finalize_sanity_check():
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)

    # Load tactical blunders demo scenario
    r = client.post("/api/scenario", json={"scenario_id": "tactical_blunders_demo", "active_power": "FRANCE"})
    assert r.status_code == 200
    state = r.json()
    assert state["active_power"] == "FRANCE"
    assert any(i["code"] == "SELF_BOUNCE" for i in state["issues"])

    # Attempt to finalize France without force -> should require confirmation ("Are You Sure?")
    fin_res = client.post("/api/finalize", json={"power": "FRANCE", "force": False})
    assert fin_res.status_code == 200
    fin_data = fin_res.json()
    assert fin_data["finalized"] is False
    assert fin_data["requires_confirmation"] is True
    assert len(fin_data["issues"]) >= 1

    # Force finalize ("Yes, I'm Sure")
    fin_force = client.post("/api/finalize", json={"power": "FRANCE", "force": True})
    assert fin_force.status_code == 200
    assert fin_force.json()["finalized"] is True
    assert "FRANCE" in fin_force.json()["state"]["finalized_powers"]

    # Simulate pre-moves
    sim_res = client.post("/api/simulate")
    assert sim_res.status_code == 200
    assert sim_res.json()["resolutions"]["FRA_A_PAR"]["bounced"] is True

    # Reset back to standard 1901
    client.post("/api/scenario", json={"scenario_id": "standard_1901", "active_power": "RUSSIA"})

    # Test Sandbox Enter/Exit isolation: Russia enters sandbox, plots German & Austrian moves, then exits
    client.post("/api/sandbox/enter", json={"power": "RUSSIA"})
    client.post(
        "/api/order",
        json={
            "order": {
                "unit_id": "RUS_A_MOS",
                "power": "RUSSIA",
                "unit_type": "A",
                "origin": "MOS",
                "order_type": "MOVE",
                "target": "UKR",
                "is_explicit": True,
            }
        },
    )
    client.post(
        "/api/order",
        json={
            "order": {
                "unit_id": "GER_A_BER",
                "power": "GERMANY",
                "unit_type": "A",
                "origin": "BER",
                "order_type": "MOVE",
                "target": "PRU",
                "is_explicit": True,
            }
        },
    )
    exit_res = client.post("/api/sandbox/exit", json={"power": "RUSSIA"})
    assert exit_res.status_code == 200
    after_exit = exit_res.json()
    # Russia's own move persists, while Germany's hypothetical move is wiped back to default HOLD
    assert after_exit["orders"]["RUS_A_MOS"]["order_type"] == "MOVE"
    assert after_exit["orders"]["RUS_A_MOS"]["target"] == "UKR"
    assert after_exit["orders"]["GER_A_BER"]["order_type"] == "HOLD"
    assert after_exit["orders"]["GER_A_BER"]["is_explicit"] is False

    # Reset back to standard 1901 as France
    client.post("/api/scenario", json={"scenario_id": "standard_1901", "active_power": "FRANCE"})


def test_spring_vs_fall_sc_ownership_and_winter_builds():
    units = get_initial_1901_units()
    ownership = get_initial_ownership()
    orders = {
        u.id: Order(
            unit_id=u.id,
            power=u.power,
            unit_type=u.unit_type,
            origin=u.province,
            origin_coast=u.coast,
            order_type=OrderType.HOLD,
            is_explicit=True,
        )
        for u in units
    }

    # France: A MAR -> SPA, A PAR -> BUR, F BRE -> MAO in Spring 1901
    orders["FRA_A_MAR"].order_type = OrderType.MOVE
    orders["FRA_A_MAR"].target = "SPA"
    orders["FRA_A_PAR"].order_type = OrderType.MOVE
    orders["FRA_A_PAR"].target = "BUR"
    orders["FRA_F_BRE"].order_type = OrderType.MOVE
    orders["FRA_F_BRE"].target = "MAO"

    # Spring resolution: A MAR occupies SPA, but SPA must NOT be owned yet!
    res_spring = adjudicate_turn(units, orders, ownership, "Spring", 1901, "Movement")
    assert "SPA" not in res_spring.new_ownership, "Supply centers should not be captured in Spring!"
    assert res_spring.next_season == "Fall"
    assert res_spring.next_year == 1901
    assert res_spring.next_phase == "Movement"

    # Fall resolution: France moves into POR and BEL
    fall_units = res_spring.new_units
    fall_orders = {
        u.id: Order(
            unit_id=u.id,
            power=u.power,
            unit_type=u.unit_type,
            origin=u.province,
            origin_coast=u.coast,
            order_type=OrderType.HOLD,
            is_explicit=True,
        )
        for u in fall_units
    }
    fall_orders["FRA_A_PAR"].order_type = OrderType.MOVE
    fall_orders["FRA_A_PAR"].target = "BEL"
    fall_orders["FRA_F_BRE"].order_type = OrderType.MOVE
    fall_orders["FRA_F_BRE"].target = "POR"

    res_fall = adjudicate_turn(fall_units, fall_orders, res_spring.new_ownership, "Fall", 1901, "Movement")
    # In Fall, ownership updates!
    assert res_fall.new_ownership.get("SPA") == Power.FRANCE
    assert res_fall.new_ownership.get("BEL") == Power.FRANCE
    assert res_fall.new_ownership.get("POR") == Power.FRANCE
    assert res_fall.next_season == "Winter"
    assert res_fall.next_phase == "Adjustments"
    assert res_fall.builds is not None
    assert res_fall.builds["FRANCE"]["count"] == 3
    assert set(res_fall.builds["FRANCE"]["homes"]) == {"BRE", "MAR", "PAR"}

    # Winter adjustments: France orders builds in PAR, BRE, MAR
    winter_units = res_fall.new_units
    winter_orders = {}
    for h in res_fall.builds["FRANCE"]["homes"]:
        b_id = f"BUILD_FRANCE_{h}"
        winter_orders[b_id] = Order(
            unit_id=b_id,
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin=h,
            order_type=OrderType.BUILD,
            is_explicit=True,
        )

    res_winter = adjudicate_turn(winter_units, winter_orders, res_fall.new_ownership, "Winter", 1901, "Adjustments")
    assert res_winter.next_season == "Spring"
    assert res_winter.next_year == 1902
    assert res_winter.next_phase == "Movement"
    fra_1902_units = [u for u in res_winter.new_units if u.power == Power.FRANCE]
    assert len(fra_1902_units) == 6


def test_multiplayer_lobby_create_join_and_save_sandbox():
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)

    # 1. List seeded multiplayer lobbies
    list_res = client.get("/api/games")
    assert list_res.status_code == 200
    games = list_res.json()
    assert len(games) >= 2

    # 2. Create a new multiplayer match as ENGLAND
    create_res = client.post(
        "/api/games",
        json={
            "name": "Autumn Clashes 1901",
            "creator_power": "ENGLAND",
            "user_id": "user_churchill",
            "email": "winston@uk.gov",
            "display_name": "Churchill",
        },
    )
    assert create_res.status_code == 200
    created_game = create_res.json()
    gid = created_game["game_id"]
    assert created_game["name"] == "Autumn Clashes 1901"
    assert "ENGLAND" in created_game["participants"]
    assert created_game["participants"]["ENGLAND"]["user_id"] == "user_churchill"

    # 3. Another user attempts to claim ENGLAND -> should fail with 409 Conflict
    conflict_res = client.post(
        f"/api/games/{gid}/join",
        json={
            "power": "ENGLAND",
            "user_id": "user_clemenceau",
            "email": "georges@fr.gov",
            "display_name": "Clemenceau",
        },
    )
    assert conflict_res.status_code == 409

    # 4. Second user claims FRANCE -> succeeds and transitions match status to active
    join_res = client.post(
        f"/api/games/{gid}/join",
        json={
            "power": "FRANCE",
            "user_id": "user_clemenceau",
            "email": "georges@fr.gov",
            "display_name": "Clemenceau",
        },
    )
    assert join_res.status_code == 200
    joined_payload = join_res.json()
    assert joined_payload["summary"]["status"] == "active"
    assert "FRANCE" in joined_payload["summary"]["participants"]
    assert joined_payload["state"]["active_power"] == "FRANCE"

    # 5. Issue order in that specific multiplayer game
    order_res = client.post(
        f"/api/order?game_id={gid}",
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
    assert order_res.json()["orders"]["FRA_A_PAR"]["target"] == "BUR"

    # 6. Save sandbox game to account
    save_res = client.post(
        "/api/games/save-sandbox",
        json={
            "name": "My French Opening Study",
            "user_id": "user_clemenceau",
            "email": "georges@fr.gov",
            "display_name": "Clemenceau",
        },
    )
    assert save_res.status_code == 200
    saved_summary = save_res.json()
    assert saved_summary["is_sandbox"] is True
    assert saved_summary["name"] == "My French Opening Study"




