from pathlib import Path
from typing import Any

from fastapi import HTTPException

try:
    from backend.domain.models import (
        GameState,
        Order,
        OrderType,
        Power,
        ProvinceInfo,
        Unit,
        UnitType,
    )
    from backend.engine.adjudicator import (
        adjudicate_turn,
        compute_current_builds,
        create_diplomacy_game,
    )
    from backend.engine.topology import PROVINCES
    from backend.engine.validator import validate_orders
except ModuleNotFoundError:
    from domain.models import (
        GameState,
        Order,
        OrderType,
        Power,
        ProvinceInfo,
        Unit,
        UnitType,
    )
    from engine.adjudicator import (
        adjudicate_turn,
        compute_current_builds,
        create_diplomacy_game,
    )
    from engine.topology import PROVINCES
    from engine.validator import validate_orders


def validate_order_references(order: Order) -> None:
    """Refuse orders naming provinces or coasts that do not exist."""
    named_provinces = [order.target, order.aux_unit_origin]
    if order.unit_id.startswith("BUILD_"):
        named_provinces.append(order.origin)
    for code in named_provinces:
        if code and code not in PROVINCES:
            raise HTTPException(status_code=400, detail=f"Unknown province '{code}'.")

    # Builds carry their coast on the unit being built, not on a target.
    if order.target_coast and order.order_type != OrderType.BUILD:
        target_coasts = PROVINCES[order.target].coasts if order.target else []
        if order.target_coast not in target_coasts:
            raise HTTPException(
                status_code=400,
                detail=f"'{order.target}' has no coast '{order.target_coast}'.",
            )


def fleet_coast(unit_type: UnitType, province: ProvinceInfo, requested: str | None) -> str | None:
    """Return the coast a unit stands on. Only a fleet on a split-coast province has one."""
    if unit_type != UnitType.FLEET or not province.coasts:
        return None
    return requested if requested in province.coasts else province.coasts[0]


def resolve_static_path(static_root: str, requested: str) -> str | None:
    """Return the file `requested` names inside static_root, or None if it is missing or outside it."""
    root = Path(static_root).resolve()
    try:
        candidate = (root / requested).resolve()
        if candidate.is_relative_to(root) and candidate.is_file():
            return str(candidate)
    except (OSError, ValueError):
        pass
    return None


def default_build_slot(power: Power, home: str) -> Order:
    """A home center with no decision yet. Nothing is built unless the player orders it."""
    return Order(
        unit_id=f"BUILD_{power.value}_{home}",
        power=power,
        unit_type=UnitType.ARMY,
        origin=home,
        origin_coast=None,
        order_type=OrderType.WAIVE,
        is_explicit=False,
    )


def create_default_orders(
    units: list[Unit],
    phase: str = "Movement",
    builds: dict[str, Any] | None = None,
) -> dict[str, Order]:
    """Return what every unit does if nobody orders it."""
    orders: dict[str, Order] = {}
    if phase == "Retreats":
        for u in units:
            orders[u.id] = Order(
                unit_id=u.id,
                power=u.power,
                unit_type=u.unit_type,
                origin=u.province,
                origin_coast=u.coast,
                order_type=OrderType.DISBAND if u.is_dislodged else OrderType.HOLD,
                is_explicit=not u.is_dislodged,
            )
        return orders

    if phase == "Adjustments":
        for u in units:
            p_count = (builds or {}).get(u.power.value, {}).get("count", 0)
            orders[u.id] = Order(
                unit_id=u.id,
                power=u.power,
                unit_type=u.unit_type,
                origin=u.province,
                origin_coast=u.coast,
                order_type=OrderType.HOLD,
                is_explicit=(p_count >= 0),
            )
        if builds:
            for p_name, b_info in builds.items():
                if b_info.get("count", 0) > 0:
                    for h in b_info.get("homes", []):
                        slot = default_build_slot(Power(p_name), h)
                        orders[slot.unit_id] = slot
        return orders

    # Default Movement phase
    for u in units:
        orders[u.id] = Order(
            unit_id=u.id,
            power=u.power,
            unit_type=u.unit_type,
            origin=u.province,
            origin_coast=u.coast,
            order_type=OrderType.HOLD,
            is_explicit=False,
        )
    return orders


def refresh_diagnostics_and_simulation(game: GameState) -> None:
    """Re-run real-time tactical validation and non-destructive turn simulation."""
    if game.winner:
        game.builds = None
        game.retreats = None
        game.issues = []
        return

    if game.phase == "Adjustments":
        game.builds = compute_current_builds(game.units, game.ownership, game.year)
        game.retreats = None
        for p_name, b_info in game.builds.items():
            if b_info.get("count", 0) > 0:
                for h in b_info.get("homes", []):
                    slot = default_build_slot(Power(p_name), h)
                    game.orders.setdefault(slot.unit_id, slot)
    elif game.phase == "Retreats":
        game.builds = None
        if not game.retreats:
            r_game = create_diplomacy_game(
                game.units, game.ownership, game.season, game.year, "Retreats"
            )
            game.retreats = r_game.get_state().get("retreats", {})
    else:
        game.builds = None
        game.retreats = None

    game.issues = validate_orders(
        game.units,
        game.orders,
        include_unassigned_warnings=False,
        phase=game.phase,
        builds=game.builds,
        retreats=game.retreats,
    )
    game.last_resolution = adjudicate_turn(
        game.units,
        game.orders,
        game.ownership,
        game.season,
        game.year,
        game.phase,
        retreats=game.retreats,
    )


def put_into_civil_disorder(game: GameState, power: Power) -> None:
    """Put a power into civil disorder."""
    for u in game.units:
        if u.power == power:
            game.orders[u.id] = Order(
                unit_id=u.id,
                power=power,
                unit_type=u.unit_type,
                origin=u.province,
                origin_coast=u.coast,
                order_type=OrderType.DISBAND if u.is_dislodged else OrderType.HOLD,
                is_explicit=False,
            )
    if game.phase == "Adjustments":
        for o in list(game.orders.values()):
            if o.power == power and o.order_type == OrderType.BUILD:
                o.order_type = OrderType.WAIVE
                o.is_explicit = False


def reset_foreign_orders(game: GameState, power: Power) -> None:
    """Reset all foreign orders to default holds/disbands/waives."""
    defaults = create_default_orders(game.units, game.phase, game.builds)
    for u_id, default_order in defaults.items():
        if default_order.power != power:
            game.orders[u_id] = default_order


def get_required_finalizing_powers(game: GameState, summary: Any | None = None) -> list[Power]:
    """Determine which powers must finalize before auto-adjudication occurs in multiplayer."""
    if summary is None:
        try:
            from backend.storage.store import GAME_SUMMARIES
        except ModuleNotFoundError:
            from storage.store import GAME_SUMMARIES
        summary = GAME_SUMMARIES.get(game.game_id)

    if not summary or getattr(summary, "is_sandbox", False):
        return []

    claimed_powers: list[Power] = []
    for part in summary.participants.values():
        if not part.surrendered and part.power not in game.surrendered_powers:
            claimed_powers.append(part.power)

    if not claimed_powers:
        return []

    if game.phase == "Movement":
        powers_with_units = {u.power for u in game.units}
        return [p for p in claimed_powers if p in powers_with_units]

    elif game.phase == "Retreats":
        dislodged_powers = {u.power for u in game.units if u.is_dislodged}
        if game.retreats:
            for p_str, r_opts in game.retreats.items():
                if r_opts:
                    try:
                        dislodged_powers.add(Power(p_str))
                    except ValueError:
                        pass
        return [p for p in claimed_powers if p in dislodged_powers]

    elif game.phase == "Adjustments":
        adj_powers: set[Power] = set()
        if game.builds:
            for p_str, b_dict in game.builds.items():
                count = b_dict.get("count", 0) if isinstance(b_dict, dict) else 0
                if count < 0 or (count > 0 and b_dict.get("homes")):
                    try:
                        adj_powers.add(Power(p_str))
                    except ValueError:
                        pass
        return [p for p in claimed_powers if p in adj_powers]

    return claimed_powers


def everyone_is_ready(game: GameState) -> bool:
    """True when a live multiplayer match has nobody left to wait for."""
    try:
        from backend.storage.store import GAME_SUMMARIES
    except ModuleNotFoundError:
        from storage.store import GAME_SUMMARIES
    summary = GAME_SUMMARIES.get(game.game_id)
    if not summary or summary.is_sandbox or summary.status != "active" or game.winner:
        return False
    required = get_required_finalizing_powers(game, summary)
    if required:
        return all(p in game.finalized_powers for p in required)
    return game.phase != "Movement"


def build_slot_power(slot_id: str) -> Power | None:
    """The power a build slot (`BUILD_<POWER>_<PROVINCE>`) belongs to, whatever an order claims."""
    parts = slot_id.split("_")
    if len(parts) < 3 or parts[0] != "BUILD":
        return None
    try:
        return Power(parts[1])
    except ValueError:
        return None


def reject_stale_turn(game: GameState, turn: str | None) -> None:
    """Refuse a request made for a turn that has since resolved."""
    current = f"{game.season} {game.year} {game.phase}"
    if turn and turn != current:
        raise HTTPException(
            status_code=409, detail=f"Too late: the game has moved on to {current}."
        )
