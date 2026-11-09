from datetime import datetime, timezone

from domain.board import Power, Unit, UnitType
from domain.game_state import GameParticipant, GameState, MultiplayerGameSummary
from domain.orders import Order, OrderType
from engine.order_utils import (
    create_default_orders,
    refresh_diagnostics_and_simulation,
)
from engine.topology.provinces import get_initial_1901_units, get_initial_ownership

SCENARIO_IDS = {
    "standard_1901",
    "tactical_blunders_demo",
    "spring_retreats_demo",
    "winter_adjustments_demo",
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
        last_resolution=None,
        turn_history=turn_hist,
        retreats=retreats_data,
        builds=builds_data,
    )
    refresh_diagnostics_and_simulation(game)
    return game


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
