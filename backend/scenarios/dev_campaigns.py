"""Realistic multi-year dev campaign scenarios and local database seeders."""

from datetime import datetime, timezone

from domain.board import Power, ProvinceType, Unit, UnitType
from domain.game_state import GameParticipant, GameState, MultiplayerGameSummary
from domain.orders import Order, OrderType
from engine.adjudicator.resolver import adjudicate_turn
from engine.order_utils import create_default_orders, refresh_diagnostics_and_simulation
from engine.topology.provinces import PROVINCES, get_initial_1901_units, get_initial_ownership

OrderSpec = tuple[str, OrderType, str | None, str | None, bool]
BuildSpec = dict[Power, list[tuple[UnitType, str]]]

_CAMPAIGN_TURNS: list[tuple[list[OrderSpec], BuildSpec | None]] = [
    # 1901 Spring & Fall
    (
        [
            ("PAR", OrderType.MOVE, "BUR", None, False),
            ("MAR", OrderType.MOVE, "SPA", None, False),
            ("BRE", OrderType.MOVE, "MAO", None, False),
            ("LON", OrderType.MOVE, "NTH", None, False),
            ("EDI", OrderType.MOVE, "NWG", None, False),
            ("LVP", OrderType.MOVE, "YOR", None, False),
            ("BER", OrderType.MOVE, "KIE", None, False),
            ("KIE", OrderType.MOVE, "DEN", None, False),
            ("MUN", OrderType.MOVE, "RUH", None, False),
            ("ROM", OrderType.MOVE, "VEN", None, False),
            ("VEN", OrderType.MOVE, "TYR", None, False),
            ("NAP", OrderType.MOVE, "ION", None, False),
            ("VIE", OrderType.MOVE, "GAL", None, False),
            ("BUD", OrderType.MOVE, "SER", None, False),
            ("TRI", OrderType.MOVE, "ALB", None, False),
            ("WAR", OrderType.MOVE, "GAL", None, False),
            ("MOS", OrderType.MOVE, "UKR", None, False),
            ("SEV", OrderType.MOVE, "RUM", None, False),
            ("STP", OrderType.MOVE, "BOT", None, False),
            ("CON", OrderType.MOVE, "BUL", None, False),
            ("SMY", OrderType.MOVE, "CON", None, False),
            ("ANK", OrderType.MOVE, "BLA", None, False),
        ],
        None,
    ),
    (
        [
            ("BUR", OrderType.MOVE, "BEL", None, False),
            ("MAO", OrderType.MOVE, "POR", None, False),
            ("SPA", OrderType.HOLD, None, None, False),
            ("NTH", OrderType.CONVOY, "NWY", "YOR", False),
            ("YOR", OrderType.MOVE, "NWY", None, True),
            ("NWG", OrderType.MOVE, "BAR", None, False),
            ("DEN", OrderType.MOVE, "SWE", None, False),
            ("KIE", OrderType.MOVE, "HOL", None, False),
            ("RUH", OrderType.MOVE, "MUN", None, False),
            ("ION", OrderType.MOVE, "TUN", None, False),
            ("TYR", OrderType.MOVE, "TRI", None, False),
            ("VEN", OrderType.HOLD, None, None, False),
            ("ALB", OrderType.MOVE, "GRE", None, False),
            ("SER", OrderType.HOLD, None, None, False),
            ("VIE", OrderType.MOVE, "GAL", None, False),
            ("RUM", OrderType.HOLD, None, None, False),
            ("BOT", OrderType.MOVE, "SWE", None, False),
            ("WAR", OrderType.MOVE, "GAL", None, False),
            ("UKR", OrderType.SUPPORT, "RUM", "RUM", False),
            ("BUL", OrderType.HOLD, None, None, False),
            ("BLA", OrderType.MOVE, "SEV", None, False),
        ],
        {
            Power.FRANCE: [(UnitType.ARMY, "PAR"), (UnitType.FLEET, "BRE"), (UnitType.ARMY, "MAR")],
            Power.ENGLAND: [(UnitType.FLEET, "LON")],
            Power.GERMANY: [(UnitType.ARMY, "BER"), (UnitType.FLEET, "KIE")],
            Power.ITALY: [(UnitType.FLEET, "NAP")],
            Power.AUSTRIA: [(UnitType.ARMY, "BUD")],
            Power.RUSSIA: [(UnitType.ARMY, "MOS")],
            Power.TURKEY: [(UnitType.FLEET, "ANK")],
        },
    ),
    # 1902 Spring & Fall: France takes LON, HOL, MUN
    (
        [
            ("BRE", OrderType.MOVE, "ENG", None, False),
            ("PAR", OrderType.MOVE, "PIC", None, False),
            ("POR", OrderType.MOVE, "MAO", None, False),
            ("BEL", OrderType.MOVE, "RUH", None, False),
            ("MAR", OrderType.MOVE, "BUR", None, False),
            ("SPA", OrderType.MOVE, "MAR", None, False),
            ("LON", OrderType.MOVE, "NTH", None, False),
            ("NTH", OrderType.MOVE, "NWG", None, False),
            ("HOL", OrderType.MOVE, "KIE", None, False),
            ("MUN", OrderType.MOVE, "SIL", None, False),
            ("BER", OrderType.MOVE, "PRU", None, False),
            ("TUN", OrderType.MOVE, "TYS", None, False),
            ("TRI", OrderType.MOVE, "BUD", None, False),
            ("GRE", OrderType.HOLD, None, None, False),
            ("SER", OrderType.MOVE, "BUD", None, False),
            ("CON", OrderType.MOVE, "BUL", None, False),
        ],
        None,
    ),
    (
        [
            ("ENG", OrderType.CONVOY, "LON", "PIC", False),
            ("PIC", OrderType.MOVE, "LON", None, True),
            ("MAO", OrderType.MOVE, "IRI", None, False),
            ("RUH", OrderType.MOVE, "HOL", None, False),
            ("BUR", OrderType.MOVE, "MUN", None, False),
            ("MAR", OrderType.MOVE, "PIE", None, False),
            ("KIE", OrderType.MOVE, "DEN", None, False),
            ("DEN", OrderType.MOVE, "SWE", None, False),
            ("TYS", OrderType.MOVE, "LYO", None, False),
        ],
        {
            Power.FRANCE: [(UnitType.ARMY, "PAR"), (UnitType.FLEET, "BRE"), (UnitType.ARMY, "MAR")],
            Power.TURKEY: [(UnitType.ARMY, "SMY")],
        },
    ),
    # 1903 Spring & Fall: France takes LVP, EDI, KIE, BER
    (
        [
            ("IRI", OrderType.MOVE, "LVP", None, False),
            ("LON", OrderType.MOVE, "YOR", None, False),
            ("ENG", OrderType.MOVE, "NTH", None, False),
            ("HOL", OrderType.MOVE, "KIE", None, False),
            ("MUN", OrderType.MOVE, "BER", None, False),
            ("PIE", OrderType.MOVE, "VEN", None, False),
            ("BRE", OrderType.MOVE, "ENG", None, False),
            ("PAR", OrderType.MOVE, "BUR", None, False),
            ("MAR", OrderType.MOVE, "PIE", None, False),
            ("DEN", OrderType.MOVE, "BAL", None, False),
        ],
        None,
    ),
    (
        [
            ("YOR", OrderType.MOVE, "EDI", None, False),
            ("NTH", OrderType.MOVE, "NWY", None, False),
            ("ENG", OrderType.MOVE, "NTH", None, False),
            ("KIE", OrderType.MOVE, "DEN", None, False),
            ("BER", OrderType.HOLD, None, None, False),
            ("BUR", OrderType.MOVE, "MUN", None, False),
            ("PIE", OrderType.MOVE, "TYR", None, False),
            ("VEN", OrderType.MOVE, "TRI", None, False),
        ],
        {
            Power.FRANCE: [(UnitType.FLEET, "BRE"), (UnitType.ARMY, "PAR"), (UnitType.ARMY, "MAR")],
        },
    ),
    # 1904 Spring & Fall: France takes HOL, KIE, NWY
    (
        [
            ("ENG", OrderType.MOVE, "NTH", None, False),
            ("BRE", OrderType.MOVE, "MAO", None, False),
            ("RUH", OrderType.MOVE, "HOL", None, False),
            ("MUN", OrderType.MOVE, "KIE", None, False),
            ("TYR", OrderType.MOVE, "VIE", None, False),
            ("MAR", OrderType.MOVE, "PIE", None, False),
            ("PAR", OrderType.MOVE, "MAR", None, False),
            ("EDI", OrderType.MOVE, "CLY", None, False),
        ],
        None,
    ),
    (
        [
            ("NTH", OrderType.MOVE, "NWY", None, False),
            ("MAO", OrderType.MOVE, "WES", None, False),
            ("HOL", OrderType.HOLD, None, None, False),
            ("KIE", OrderType.HOLD, None, None, False),
            ("VIE", OrderType.HOLD, None, None, False),
            ("PIE", OrderType.MOVE, "TUS", None, False),
            ("MAR", OrderType.MOVE, "LYO", None, False),
        ],
        {
            Power.FRANCE: [(UnitType.ARMY, "PAR"), (UnitType.FLEET, "BRE"), (UnitType.ARMY, "MAR")],
        },
    ),
    # 1905 Spring & Fall: France takes VEN, TUN, ROM (17 SCs)
    (
        [
            ("WES", OrderType.MOVE, "TYS", None, False),
            ("MAR", OrderType.MOVE, "PIE", None, False),
            ("TUS", OrderType.MOVE, "ROM", None, False),
            ("PAR", OrderType.MOVE, "BUR", None, False),
            ("BRE", OrderType.MOVE, "MAO", None, False),
        ],
        None,
    ),
    (
        [
            ("TYS", OrderType.MOVE, "TUN", None, False),
            ("PIE", OrderType.MOVE, "VEN", None, False),
            ("TYR", OrderType.SUPPORT, "VEN", "PIE", False),
            ("ROM", OrderType.HOLD, None, None, False),
            ("MAO", OrderType.MOVE, "WES", None, False),
        ],
        {
            Power.FRANCE: [(UnitType.ARMY, "PAR"), (UnitType.FLEET, "MAR")],
        },
    ),
    # 1906 Spring: France positions F TYS; Italy sorties F NAP -> ION
    (
        [
            ("WES", OrderType.MOVE, "TYS", None, False),
            ("NAP", OrderType.MOVE, "ION", None, False),
        ],
        None,
    ),
]


def _apply_order_specs(
    units: list[Unit],
    phase: str,
    order_specs: list[OrderSpec],
    build_specs: BuildSpec | None,
) -> dict[str, Order]:
    orders = create_default_orders(units, phase)
    if phase == "Adjustments" and build_specs:
        for power, locs in build_specs.items():
            for idx, (unit_type, prov) in enumerate(locs):
                oid = f"{power.value[:3]}_BUILD_{prov}_{idx}"
                orders[oid] = Order(
                    unit_id=oid,
                    power=power,
                    unit_type=unit_type,
                    origin=prov,
                    order_type=OrderType.BUILD,
                    target=prov,
                    is_explicit=True,
                )
        return orders

    by_prov = {u.province: u for u in units}
    for prov, otype, target, aux, via in order_specs:
        unit = by_prov.get(prov)
        if unit is None:
            continue
        orders[unit.id] = Order(
            unit_id=unit.id,
            power=unit.power,
            unit_type=unit.unit_type,
            origin=unit.province,
            origin_coast=unit.coast,
            order_type=otype,
            target=target,
            aux_unit_origin=aux,
            via_convoy=via,
            is_explicit=True,
        )
    return orders


def _simulate_one_turn_from_win_campaign(game_id: str) -> tuple[list[GameState], GameState]:
    """Replay a deterministic 1901-1906 campaign ending in Fall 1906 with France at 17 SCs."""
    history: list[GameState] = []
    units = get_initial_1901_units()
    ownership = get_initial_ownership()
    season, year, phase = "Spring", 1901, "Movement"

    def advance(order_specs: list[OrderSpec], build_specs: BuildSpec | None = None) -> None:
        nonlocal units, ownership, season, year, phase
        orders = _apply_order_specs(units, phase, order_specs, build_specs)
        snap = GameState(
            game_id=game_id,
            season=season,
            year=year,
            phase=phase,
            scenario_id="one_turn_from_win",
            units=units,
            orders=orders,
            ownership=ownership,
        )
        res = adjudicate_turn(units, orders, ownership, season, year, phase)
        history.append(snap)
        units = res.new_units
        ownership = res.new_ownership
        season = res.next_season
        year = res.next_year
        phase = res.next_phase

    for move_specs, build_specs in _CAMPAIGN_TURNS:
        advance(move_specs)
        if phase == "Retreats":
            advance([])
        if phase == "Adjustments" and build_specs is not None:
            advance([], build_specs)

    orders = {
        u.id: Order(
            unit_id=u.id,
            power=u.power,
            unit_type=u.unit_type,
            origin=u.province,
            origin_coast=u.coast,
            order_type=OrderType.HOLD,
            is_explicit=u.power == Power.FRANCE,
        )
        for u in units
    }
    tys_fleet = next(u for u in units if u.province == "TYS" and u.power == Power.FRANCE)
    orders[tys_fleet.id] = Order(
        unit_id=tys_fleet.id,
        power=Power.FRANCE,
        unit_type=tys_fleet.unit_type,
        origin="TYS",
        order_type=OrderType.MOVE,
        target="NAP",
        is_explicit=True,
    )

    turn_hist = [
        "Fall 1906: France controls 17 Supply Centers — move Fleet TYS to Naples for 18 and solo victory.",
        "Spring 1906: French fleet sailed into Tyrrhenian Sea while Italy sortied from Naples.",
        "Winter 1905: France reached 17 Supply Centers after capturing Venice, Rome, and Tunis.",
        "1902-1904: French armies and fleets swept through Britain, the Low Countries, and Germany.",
        "Spring 1901: Great Powers mobilized across Europe.",
    ]

    final_state = GameState(
        game_id=game_id,
        season=season,
        year=year,
        phase=phase,
        scenario_id="one_turn_from_win",
        active_power=Power.FRANCE,
        units=units,
        orders=orders,
        ownership=ownership,
        finalized_powers=[],
        issues=[],
        preview=None,
        turn_history=turn_hist,
    )
    return history, final_state


def build_one_turn_from_win_scenario(
    active_power: Power | None = None,
    game_id: str = "proto_1901",
) -> GameState:
    """Build the Fall 1906 live GameState where France is one move from 18 SCs."""
    _, game = _simulate_one_turn_from_win_campaign(game_id)
    if active_power is not None:
        game.active_power = active_power
    refresh_diagnostics_and_simulation(game)
    return game


def build_one_turn_from_win_history(game_id: str = "proto_1901") -> list[GameState]:
    """Return the continuous 1901-1906 resolved history snapshots for one_turn_from_win."""
    history, _ = _simulate_one_turn_from_win_campaign(game_id)
    return history


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
    from scenarios.presets import build_scenario
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
        state = build_one_turn_from_win_scenario(Power.FRANCE, gid)
        state.finalized_powers = [Power.TURKEY]
        GAMES[gid] = state
        SANDBOX_CHECKPOINTS[gid] = None
        GAME_HISTORY[gid] = build_one_turn_from_win_history(gid)
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
