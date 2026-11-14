"""Resolve one phase with the DATC-compliant `diplomacy` engine."""

from collections import defaultdict
from typing import Any

import diplomacy
from domain.board import Power, Unit
from domain.orders import Order, SimulationResult
from engine.adjudicator.adjustments import build_adjustment_orders, resolve_adjustments
from engine.adjudicator.context import ResolutionContext
from engine.adjudicator.movement import build_movement_orders, resolve_movement
from engine.adjudicator.retreats import build_retreat_orders, resolve_retreats
from engine.adjudicator.territory import claim_occupied_territory, supply_center_owners
from engine.adjudicator.translator import parse_diplomacy_phase, to_diplomacy_phase_code
from engine.topology.graph import split_province_code
from engine.topology.provinces import PROVINCES


def create_diplomacy_game(
    units: list[Unit],
    ownership: dict[str, Power],
    season: str,
    year: int,
    phase: str,
    retreats: dict[str, Any] | None = None,
) -> diplomacy.Game:
    game = diplomacy.Game()
    game.clear_units()
    game.clear_centers()

    phase_code = to_diplomacy_phase_code(season, year, phase)
    game.set_current_phase(phase_code)

    # Set supply centers first so adjustment calculations have accurate ownership. Claimed land
    # that is not a supply center only colours the map, so the engine never counts it.
    centers_by_pwr: dict[str, list[str]] = {}
    for prov, pwr in supply_center_owners(ownership).items():
        p_name = pwr.value if hasattr(pwr, "value") else str(pwr)
        centers_by_pwr.setdefault(p_name, []).append(prov)

    for p_name, c_list in centers_by_pwr.items():
        game.set_centers(p_name, c_list)

    # Set units (regular units first, then dislodged units prefixed with '*' during Retreats phase)
    units_by_pwr: dict[str, list[str]] = {}
    for u in units:
        if u.is_dislodged and not phase_code.endswith("R"):
            continue
        p_name = u.power.value if hasattr(u.power, "value") else str(u.power)
        ut_val = u.unit_type.value if hasattr(u.unit_type, "value") else str(u.unit_type)
        loc = f"{u.province}/{u.coast}" if u.coast else u.province
        prefix = "*" if (u.is_dislodged and phase_code.endswith("R")) else ""
        u_str = f"{prefix}{ut_val} {loc}"
        units_by_pwr.setdefault(p_name, []).append(u_str)

    for p_name, u_list in units_by_pwr.items():
        game.set_units(p_name, u_list)

    # If in Retreats phase and explicit DATC retreat options were recorded from the Movement phase, restore them
    if phase_code.endswith("R") and retreats:
        for p_name, r_dict in retreats.items():
            if isinstance(r_dict, dict):
                pwr_obj = game.get_power(p_name)
                if pwr_obj:
                    for u_key, r_locs in r_dict.items():
                        if u_key in pwr_obj.retreats and isinstance(r_locs, list):
                            pwr_obj.retreats[u_key] = [str(x).upper() for x in r_locs]

    return game


def compute_current_builds(
    units: list[Unit],
    ownership: dict[str, Power],
    year: int = 1901,
) -> dict[str, Any]:
    """Compute the exact DATC build/disband counts and unoccupied home centers for a Winter Adjustments phase."""
    game = create_diplomacy_game(units, ownership, "Winter", year, "Adjustments")
    return game.get_state().get("builds", {})


def adjudicate_turn(
    units: list[Unit],
    orders: dict[str, Order],
    ownership: dict[str, Power],
    season: str = "Spring",
    year: int = 1901,
    phase: str = "Movement",
    retreats: dict[str, Any] | None = None,
) -> SimulationResult:
    """
    Resolve a Diplomacy phase using the official DATC-compliant `diplomacy` engine.
    - Accurately determines bounces, cuts, dislodgements, circular movement, and convoy paradoxes.
    - Honors official supply center ownership timing: Spring movements do not capture SCs;
      Fall movements (and Fall retreats) update ownership before the Winter adjustment phase.
    - Supports Retreats (RETREAT / DISBAND) and Winter Adjustments (BUILD / DISBAND / WAIVE).
    """
    game = create_diplomacy_game(units, ownership, season, year, phase, retreats=retreats)
    phase_code = to_diplomacy_phase_code(season, year, phase)

    units_by_prov = {u.province: u for u in units if not u.is_dislodged}
    unit_by_id = {u.id: u for u in units}

    # Format orders for diplomacy engine based on phase type
    power_orders: dict[str, list[str]] = {}
    if phase_code.endswith("M"):
        power_orders = build_movement_orders(units, orders, units_by_prov)
    elif phase_code.endswith("R"):
        power_orders = build_retreat_orders(units, orders, units_by_prov)
    elif phase_code.endswith("A"):
        power_orders = build_adjustment_orders(game, units, orders, units_by_prov, unit_by_id)

    # Submit orders to game
    for p_name, ord_list in power_orders.items():
        game.set_orders(p_name, ord_list)

    # The engine silently drops orders it finds illegal and the unit simply holds, with no
    # result code to show for it. Record what it kept, so that a dropped order is never
    # applied or reported as a success.
    kept_orders: set[tuple[str, str, str]] = set()
    for p_name in power_orders:
        for kept in game.get_orders(p_name):
            parts = kept.split()
            if len(parts) >= 2:
                kept_orders.add((p_name, parts[0], split_province_code(parts[1])[0]))

    # Process adjudication
    game.process()

    results_for_phase = game.result_history.get(phase_code, {})
    engine_units_by_pwr = game.get_units()

    # Parse surviving regular and dislodged units from the engine after process()
    engine_regular_by_pwr: dict[str, list[tuple[str, str, str | None]]] = defaultdict(list)
    engine_dislodged_by_pwr: dict[str, list[tuple[str, str, str | None]]] = defaultdict(list)
    for p_name, u_strs in engine_units_by_pwr.items():
        for u_str in u_strs:
            is_dis = u_str.startswith("*")
            clean_str = u_str[1:] if is_dis else u_str
            parts = clean_str.split()
            if len(parts) < 2:
                continue
            ut_str = parts[0]
            base_prov, prov_coast = split_province_code(parts[1])
            if is_dis:
                engine_dislodged_by_pwr[p_name].append((ut_str, base_prov, prov_coast))
            else:
                engine_regular_by_pwr[p_name].append((ut_str, base_prov, prov_coast))

    ctx = ResolutionContext(
        units=units,
        orders=orders,
        results_for_phase=results_for_phase,
        engine_regular_by_pwr=engine_regular_by_pwr,
        engine_dislodged_by_pwr=engine_dislodged_by_pwr,
        kept_orders=kept_orders,
    )
    if phase_code.endswith("M"):
        resolve_movement(ctx)
    elif phase_code.endswith("R"):
        resolve_retreats(ctx)
    elif phase_code.endswith("A"):
        resolve_adjustments(ctx)

    # Next phase info from diplomacy game. A finished game has no next phase (its phase is the
    # bare word "COMPLETED"), so the clock stays on the phase that decided it.
    winner: Power | None = None
    if game.is_game_done:
        next_season, next_year, next_phase = season, year, phase
        if len(game.outcome) > 1:
            winner = Power(game.outcome[1])
    else:
        next_season, next_year, next_phase = parse_diplomacy_phase(game.phase)

    # Supply center ownership from diplomacy engine (preserving any non-SC land territory ownership)
    new_ownership: dict[str, Power] = {
        prov: pwr
        for prov, pwr in ownership.items()
        if prov in PROVINCES and not PROVINCES[prov].is_supply_center
    }
    engine_centers = game.get_centers()
    for p_name, c_list in engine_centers.items():
        pwr = Power(p_name)
        for c in c_list:
            new_ownership[c] = pwr
    # Land that is not a supply center goes to whoever stands in it after movement or retreats.
    if phase_code.endswith(("M", "R")):
        claim_occupied_territory(new_ownership, ctx.new_units)

    # Extract builds and retreats status for the NEXT phase
    game_state_data = game.get_state()
    builds_data = None if game.is_game_done else game_state_data.get("builds")
    retreats_data = None if game.is_game_done else game_state_data.get("retreats")

    return SimulationResult(
        resolutions=ctx.resolutions,
        summary=ctx.summary,
        new_units=ctx.new_units,
        new_ownership=new_ownership,
        next_season=next_season,
        next_year=next_year,
        next_phase=next_phase,
        builds=builds_data,
        retreats=retreats_data,
        winner=winner,
    )
