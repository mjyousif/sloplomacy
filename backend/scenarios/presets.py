from datetime import datetime, timezone

from domain.board import Power, ProvinceType, Unit, UnitType
from domain.game_state import GameParticipant, GameState, MultiplayerGameSummary
from domain.orders import Order, OrderType
from engine.adjudicator.resolver import adjudicate_turn
from engine.order_utils import (
    create_default_orders,
    refresh_diagnostics_and_simulation,
)
from engine.topology.provinces import PROVINCES, get_initial_1901_units, get_initial_ownership

SCENARIO_IDS = {
    "standard_1901",
    "tactical_blunders_demo",
    "spring_retreats_demo",
    "winter_adjustments_demo",
    "one_turn_from_win",
}
FIRST_YEAR = 1901
PHASES_BY_SEASON = {
    "Spring": {"Movement", "Retreats"},
    "Fall": {"Movement", "Retreats"},
    "Winter": {"Adjustments"},
}


def build_scenario(
    scenario_id: str,
    active_power: Power | None = None,
    game_id: str = "proto_1901",
) -> GameState:
    units = get_initial_1901_units()
    ownership = get_initial_ownership()
    orders = create_default_orders(units)

    season = "Spring"
    year = 1901
    phase = "Movement"
    turn_hist = ["Game initialized — Spring 1901 Diplomatic & Movement Phase."]
    retreats_data = None
    builds_data = None
    default_power = Power.FRANCE

    if scenario_id == "tactical_blunders_demo":
        orders["FRA_A_PAR"] = Order(
            unit_id="FRA_A_PAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PAR",
            order_type=OrderType.MOVE,
            target="BUR",
            is_explicit=True,
        )
        orders["FRA_A_MAR"] = Order(
            unit_id="FRA_A_MAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="MAR",
            order_type=OrderType.MOVE,
            target="BUR",
            is_explicit=True,
        )
        orders["FRA_F_BRE"] = Order(
            unit_id="FRA_F_BRE",
            power=Power.FRANCE,
            unit_type=UnitType.FLEET,
            origin="BRE",
            order_type=OrderType.MOVE,
            target="MAO",
            is_explicit=True,
        )
        orders["ENG_F_LON"] = Order(
            unit_id="ENG_F_LON",
            power=Power.ENGLAND,
            unit_type=UnitType.FLEET,
            origin="LON",
            order_type=OrderType.MOVE,
            target="NTH",
            is_explicit=True,
        )
        orders["ENG_F_EDI"] = Order(
            unit_id="ENG_F_EDI",
            power=Power.ENGLAND,
            unit_type=UnitType.FLEET,
            origin="EDI",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="LON",
            target="NTH",
            is_explicit=True,
        )
        orders["ENG_A_LVP"] = Order(
            unit_id="ENG_A_LVP",
            power=Power.ENGLAND,
            unit_type=UnitType.ARMY,
            origin="LVP",
            order_type=OrderType.MOVE,
            target="YOR",
            is_explicit=True,
        )

    elif scenario_id == "spring_retreats_demo":
        season = "Spring"
        year = 1901
        phase = "Retreats"
        turn_hist = [
            "Game initialized with Spring 1901 Retreats demo.",
            "Spring 1901: German Army in Burgundy was dislodged by French advance from Marseilles.",
        ]
        units = [u for u in units if u.id != "GER_A_MUN"]
        dislodged_ger = Unit(
            id="GER_A_MUN",
            power=Power.GERMANY,
            unit_type=UnitType.ARMY,
            province="BUR",
            is_dislodged=True,
        )
        units.append(dislodged_ger)
        for u in units:
            if u.id == "FRA_A_MAR":
                u.province = "BUR"
        orders = create_default_orders(units, phase)
        retreats_data = {"GERMANY": {"A BUR": ["RUH", "BEL", "MUN", "PIC", "GAS"]}}
        default_power = Power.GERMANY

    elif scenario_id == "winter_adjustments_demo":
        season = "Winter"
        year = 1901
        phase = "Adjustments"
        turn_hist = [
            "Game initialized with Winter 1901 Adjustments demo.",
            "Winter 1901: France holds 5 Supply Centers with 3 units (+2 builds pending).",
        ]
        ownership = get_initial_ownership()
        ownership["SPA"] = Power.FRANCE
        ownership["POR"] = Power.FRANCE
        ownership["RUM"] = Power.RUSSIA
        ownership["TRI"] = Power.ITALY
        for u in units:
            if u.id == "FRA_A_PAR":
                u.province = "BUR"
            elif u.id == "FRA_A_MAR":
                u.province = "SPA"
            elif u.id == "FRA_F_BRE":
                u.province = "MAO"
            elif u.id == "RUS_F_STP":
                u.province = "BOT"
                u.coast = None
            elif u.id == "AUS_F_TRI":
                u.province = "ALB"
        orders = create_default_orders(units, phase)
        default_power = Power.FRANCE

    elif scenario_id == "one_turn_from_win":
        season = "Fall"
        year = 1904
        phase = "Movement"
        turn_hist = [
            "Fall 1904: France controls 17 Supply Centers — move Fleet ION to Tunis for 18 and solo victory.",
            "Winter 1901: France, England, and Germany expanded following Italian retreat losses.",
            "Fall 1901: Allied English and German supports broke the deadlock in Belgium and Venice.",
            "Spring 1901: Great Powers mobilized across Europe.",
        ]
        ownership = get_initial_ownership()
        france_scs = (
            "PAR",
            "BRE",
            "MAR",
            "SPA",
            "POR",
            "BEL",
            "HOL",
            "LON",
            "LVP",
            "EDI",
            "MUN",
            "BER",
            "KIE",
            "ROM",
            "NAP",
            "VEN",
            "TRI",
        )
        for sc in france_scs:
            ownership[sc] = Power.FRANCE
        ownership.pop("TUN", None)
        for sc in ("SMY", "CON", "ANK", "BUL", "GRE", "SER"):
            ownership[sc] = Power.TURKEY
        for sc in ("MOS", "WAR", "SEV", "STP", "RUM", "SWE"):
            ownership[sc] = Power.RUSSIA
        ownership["NWY"] = Power.ENGLAND
        ownership["DEN"] = Power.GERMANY
        ownership["VIE"] = Power.AUSTRIA
        ownership["BUD"] = Power.AUSTRIA

        units = [
            Unit(id="FRA_F_ION", power=Power.FRANCE, unit_type=UnitType.FLEET, province="ION"),
            Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PAR"),
            Unit(id="FRA_A_MUN", power=Power.FRANCE, unit_type=UnitType.ARMY, province="MUN"),
            Unit(id="FRA_A_ROM", power=Power.FRANCE, unit_type=UnitType.ARMY, province="ROM"),
            Unit(id="FRA_F_MAO", power=Power.FRANCE, unit_type=UnitType.FLEET, province="MAO"),
            Unit(id="TUR_A_SMY", power=Power.TURKEY, unit_type=UnitType.ARMY, province="SMY"),
            Unit(id="RUS_A_MOS", power=Power.RUSSIA, unit_type=UnitType.ARMY, province="MOS"),
        ]
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
        orders["FRA_F_ION"] = Order(
            unit_id="FRA_F_ION",
            power=Power.FRANCE,
            unit_type=UnitType.FLEET,
            origin="ION",
            order_type=OrderType.MOVE,
            target="TUN",
            is_explicit=True,
        )
        default_power = Power.FRANCE

    resolved_power = active_power if active_power is not None else default_power

    game = GameState(
        game_id=game_id,
        season=season,
        year=year,
        phase=phase,
        scenario_id=scenario_id,
        active_power=resolved_power,
        units=units,
        orders=orders,
        ownership=ownership,
        finalized_powers=[],
        issues=[],
        preview=None,
        turn_history=turn_hist,
        retreats=retreats_data,
        builds=builds_data,
    )
    refresh_diagnostics_and_simulation(game)
    return game


def build_scenario_history(scenario_id: str, game_id: str = "proto_1901") -> list[GameState]:
    """Return pre-resolved history snapshots for scenarios that simulate mid/late campaigns."""
    if scenario_id != "one_turn_from_win":
        return []

    u0 = get_initial_1901_units()
    o0 = get_initial_ownership()
    ord0 = create_default_orders(u0, "Movement")
    moves0 = {
        "FRA_A_PAR": "BUR",
        "FRA_A_MAR": "PIE",
        "FRA_F_BRE": "MAO",
        "ENG_F_LON": "NTH",
        "ENG_F_EDI": "NWG",
        "ENG_A_LVP": "EDI",
        "GER_A_BER": "SIL",
        "GER_A_MUN": "TYR",
        "GER_F_KIE": "HOL",
        "ITA_A_ROM": "APU",
        "ITA_F_NAP": "ION",
        "AUS_A_BUD": "SER",
        "AUS_A_VIE": "GAL",
        "AUS_F_TRI": "ALB",
        "RUS_A_WAR": "GAL",
        "RUS_A_MOS": "UKR",
        "RUS_F_SEV": "RUM",
        "RUS_F_STP": "BOT",
        "TUR_A_CON": "BUL",
        "TUR_A_SMY": "CON",
        "TUR_F_ANK": "BLA",
    }
    for uid, tgt in moves0.items():
        unit = next(x for x in u0 if x.id == uid)
        ord0[uid] = Order(
            unit_id=uid,
            power=unit.power,
            unit_type=unit.unit_type,
            origin=unit.province,
            origin_coast=unit.coast,
            order_type=OrderType.MOVE,
            target=tgt,
            is_explicit=True,
        )
    snap0 = GameState(
        game_id=game_id,
        season="Spring",
        year=1901,
        phase="Movement",
        scenario_id=scenario_id,
        units=u0,
        orders=ord0,
        ownership=o0,
    )
    res0 = adjudicate_turn(snap0.units, snap0.orders, snap0.ownership, "Spring", 1901, "Movement")

    u1 = res0.new_units
    o1 = res0.new_ownership
    ord1 = create_default_orders(u1, "Movement")
    fall_orders = [
        ("FRA_A_PAR", OrderType.MOVE, "BEL", None, False),
        ("ENG_F_LON", OrderType.SUPPORT, "BEL", "BUR", False),
        ("FRA_A_MAR", OrderType.MOVE, "VEN", None, False),
        ("GER_A_MUN", OrderType.SUPPORT, "VEN", "PIE", False),
        ("ENG_F_EDI", OrderType.CONVOY, "NWY", "EDI", False),
        ("ENG_A_LVP", OrderType.MOVE, "NWY", None, True),
        ("GER_A_BER", OrderType.SUPPORT, "GAL", "VIE", False),
        ("AUS_A_VIE", OrderType.MOVE, "GAL", None, False),
        ("RUS_A_WAR", OrderType.MOVE, "SIL", None, False),
        ("RUS_A_MOS", OrderType.MOVE, "GAL", None, False),
        ("TUR_F_ANK", OrderType.SUPPORT, "RUM", "RUM", False),
        ("AUS_F_TRI", OrderType.MOVE, "GRE", None, False),
    ]
    for uid, otype, tgt, aux, via in fall_orders:
        unit = next(x for x in u1 if x.id == uid)
        ord1[uid] = Order(
            unit_id=uid,
            power=unit.power,
            unit_type=unit.unit_type,
            origin=unit.province,
            origin_coast=unit.coast,
            order_type=otype,
            target=tgt,
            aux_unit_origin=aux,
            via_convoy=via,
            is_explicit=True,
        )
    snap1 = GameState(
        game_id=game_id,
        season="Fall",
        year=1901,
        phase="Movement",
        scenario_id=scenario_id,
        units=u1,
        orders=ord1,
        ownership=o1,
    )
    res1 = adjudicate_turn(snap1.units, snap1.orders, snap1.ownership, "Fall", 1901, "Movement")

    u2 = res1.new_units
    o2 = res1.new_ownership
    ord2 = create_default_orders(u2, "Retreats")
    ord2["ITA_A_VEN"] = Order(
        unit_id="ITA_A_VEN",
        power=Power.ITALY,
        unit_type=UnitType.ARMY,
        origin="VEN",
        order_type=OrderType.DISBAND,
        is_explicit=True,
    )
    snap2 = GameState(
        game_id=game_id,
        season="Fall",
        year=1901,
        phase="Retreats",
        scenario_id=scenario_id,
        units=u2,
        orders=ord2,
        ownership=o2,
        retreats=res1.retreats,
    )
    res2 = adjudicate_turn(
        snap2.units,
        snap2.orders,
        snap2.ownership,
        "Fall",
        1901,
        "Retreats",
        retreats=snap2.retreats,
    )

    u3 = res2.new_units
    o3 = res2.new_ownership
    ord3 = create_default_orders(u3, "Adjustments", builds=res2.builds)
    ord3["BUILD_FRANCE_PAR"] = Order(
        unit_id="BUILD_FRANCE_PAR",
        power=Power.FRANCE,
        unit_type=UnitType.ARMY,
        origin="PAR",
        order_type=OrderType.BUILD,
        is_explicit=True,
    )
    ord3["BUILD_FRANCE_MAR"] = Order(
        unit_id="BUILD_FRANCE_MAR",
        power=Power.FRANCE,
        unit_type=UnitType.FLEET,
        origin="MAR",
        order_type=OrderType.BUILD,
        is_explicit=True,
    )
    ord3["BUILD_ENGLAND_LON"] = Order(
        unit_id="BUILD_ENGLAND_LON",
        power=Power.ENGLAND,
        unit_type=UnitType.FLEET,
        origin="LON",
        order_type=OrderType.BUILD,
        is_explicit=True,
    )
    snap3 = GameState(
        game_id=game_id,
        season="Winter",
        year=1901,
        phase="Adjustments",
        scenario_id=scenario_id,
        units=u3,
        orders=ord3,
        ownership=o3,
        builds=res2.builds,
    )

    return [snap0, snap1, snap2, snap3]


def build_all_pieces_units() -> list[Unit]:
    """Build 75 units (36 fleets, 39 armies) across all 75 passable provinces."""
    passable = [prov for prov in PROVINCES.values() if prov.type != ProvinceType.IMPASSABLE]
    seas = [p for p in passable if p.type == ProvinceType.SEA]
    coasts = [p for p in passable if p.type == ProvinceType.COAST]
    lands = [p for p in passable if p.type == ProvinceType.LAND]

    fleet_provs = seas + coasts[:17]
    army_provs = coasts[17:] + lands
    powers = list(Power)

    units: list[Unit] = []
    idx = 0
    for prov in fleet_provs:
        power = powers[idx % len(powers)]
        coast = prov.coasts[0] if prov.coasts else None
        units.append(
            Unit(
                id=f"{power.value[:3]}_F_{prov.id}",
                power=power,
                unit_type=UnitType.FLEET,
                province=prov.id,
                coast=coast,
            )
        )
        idx += 1

    for prov in army_provs:
        power = powers[idx % len(powers)]
        units.append(
            Unit(
                id=f"{power.value[:3]}_A_{prov.id}",
                power=power,
                unit_type=UnitType.ARMY,
                province=prov.id,
                coast=None,
            )
        )
        idx += 1

    return units


async def seed_dev_games() -> None:
    """Ensure local dev starts with both 'one_turn_from_win' and 'all_pieces' in RAM/DB."""
    from storage.store import (
        GAME_HISTORY,
        GAME_SUMMARIES,
        GAMES,
        HISTORY_UNSAVED,
        SANDBOX_CHECKPOINTS,
        UNSAVED_GAMES,
        persist_game,
    )

    now_iso = datetime.now(timezone.utc).isoformat()

    if "dev_one_turn_win" not in GAME_SUMMARIES and "dev_one_turn_win" not in GAMES:
        gid = "dev_one_turn_win"
        state = build_scenario("one_turn_from_win", Power.FRANCE, gid)
        state.finalized_powers = [Power.TURKEY]
        GAMES[gid] = state
        SANDBOX_CHECKPOINTS[gid] = None
        GAME_HISTORY[gid] = build_scenario_history("one_turn_from_win", gid)
        GAME_SUMMARIES[gid] = MultiplayerGameSummary(
            game_id=gid,
            name="Final Push to 18 SCs (1 Turn from Victory)",
            status="waiting",
            season=state.season,
            year=state.year,
            phase=state.phase,
            created_by="sultan@diplomacy.local",
            creator_id="bot_sultan",
            created_at=now_iso,
            participants={
                "TURKEY": GameParticipant(
                    user_id="bot_sultan",
                    email="sultan@diplomacy.local",
                    display_name="Sultan Mehmed",
                    power=Power.TURKEY,
                    joined_at=now_iso,
                )
            },
            finalized_powers=list(state.finalized_powers),
            is_sandbox=False,
        )
        UNSAVED_GAMES.add(gid)
        HISTORY_UNSAVED.add(gid)
        await persist_game(gid)

    if "dev_all_pieces" not in GAME_SUMMARIES and "dev_all_pieces" not in GAMES:
        gid = "dev_all_pieces"
        state = build_scenario("standard_1901", Power.FRANCE, gid)
        units = build_all_pieces_units()
        state.units = units
        state.orders = create_default_orders(units, state.phase)
        state.scenario_id = "all_pieces"
        refresh_diagnostics_and_simulation(state)
        GAMES[gid] = state
        SANDBOX_CHECKPOINTS[gid] = None
        GAME_HISTORY[gid] = []
        GAME_SUMMARIES[gid] = MultiplayerGameSummary(
            game_id=gid,
            name="All 75 Units Stress Board",
            status="waiting",
            season=state.season,
            year=state.year,
            phase=state.phase,
            created_by="cartographer@diplomacy.local",
            creator_id="bot_cartographer",
            created_at=now_iso,
            participants={
                "AUSTRIA": GameParticipant(
                    user_id="bot_cartographer",
                    email="cartographer@diplomacy.local",
                    display_name="Chief Cartographer",
                    power=Power.AUSTRIA,
                    joined_at=now_iso,
                )
            },
            finalized_powers=[],
            is_sandbox=False,
        )
        UNSAVED_GAMES.add(gid)
        HISTORY_UNSAVED.add(gid)
        await persist_game(gid)


def seed_initial_multiplayer_lobbies() -> None:
    from storage.store import (
        GAME_HISTORY,
        GAME_SUMMARIES,
        GAMES,
        SANDBOX_CHECKPOINTS,
    )

    now_iso = datetime.now(timezone.utc).isoformat()

    g1_id = "mp_concert_104"
    g1_state = build_scenario("standard_1901", Power.FRANCE, g1_id)
    g1_state.orders["GER_A_BER"] = Order(
        unit_id="GER_A_BER",
        power=Power.GERMANY,
        unit_type=UnitType.ARMY,
        origin="BER",
        order_type=OrderType.MOVE,
        target="KIE",
        is_explicit=True,
    )
    g1_state.orders["GER_F_KIE"] = Order(
        unit_id="GER_F_KIE",
        power=Power.GERMANY,
        unit_type=UnitType.FLEET,
        origin="KIE",
        order_type=OrderType.MOVE,
        target="DEN",
        is_explicit=True,
    )
    g1_state.orders["GER_A_MUN"] = Order(
        unit_id="GER_A_MUN",
        power=Power.GERMANY,
        unit_type=UnitType.ARMY,
        origin="MUN",
        order_type=OrderType.MOVE,
        target="RUH",
        is_explicit=True,
    )
    g1_state.finalized_powers = []
    refresh_diagnostics_and_simulation(g1_state)
    GAMES[g1_id] = g1_state
    SANDBOX_CHECKPOINTS[g1_id] = None
    GAME_HISTORY[g1_id] = []
    GAME_SUMMARIES[g1_id] = MultiplayerGameSummary(
        game_id=g1_id,
        name="Concert of Europe — Match #104",
        status="active",
        season=g1_state.season,
        year=g1_state.year,
        phase=g1_state.phase,
        created_by="bismarck@diplomacy.eu",
        creator_id="bot_bismarck",
        created_at=now_iso,
        participants={
            "GERMANY": GameParticipant(
                user_id="bot_bismarck",
                email="bismarck@diplomacy.eu",
                display_name="Otto von B.",
                power=Power.GERMANY,
                joined_at=now_iso,
            ),
            "RUSSIA": GameParticipant(
                user_id="bot_romanov",
                email="tsar@diplomacy.eu",
                display_name="Tsar Nicholas",
                power=Power.RUSSIA,
                joined_at=now_iso,
            ),
        },
        finalized_powers=g1_state.finalized_powers,
        is_sandbox=False,
    )

    g2_id = "mp_med_crisis"
    g2_state = build_scenario("standard_1901", Power.ENGLAND, g2_id)
    GAMES[g2_id] = g2_state
    SANDBOX_CHECKPOINTS[g2_id] = None
    GAME_HISTORY[g2_id] = []
    GAME_SUMMARIES[g2_id] = MultiplayerGameSummary(
        game_id=g2_id,
        name="Mediterranean Crisis 1901",
        status="waiting",
        season=g2_state.season,
        year=g2_state.year,
        phase=g2_state.phase,
        created_by="cavour@diplomacy.it",
        creator_id="bot_cavour",
        created_at=now_iso,
        participants={
            "ITALY": GameParticipant(
                user_id="bot_cavour",
                email="cavour@diplomacy.it",
                display_name="Count Cavour",
                power=Power.ITALY,
                joined_at=now_iso,
            ),
        },
        finalized_powers=[],
        is_sandbox=False,
    )
