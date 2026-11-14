"""Helpers for admin action audit logging, history consolidation, and diff generation."""

import copy
import uuid
from datetime import datetime, timezone

from domain.board import Power, Unit
from domain.game_state import AdminActionLogEntry, GameState
from domain.orders import Order, OrderType, SimulationResult
from security.auth import AuthUser
from storage.store import (
    GAME_HISTORY,
    GAME_SUMMARIES,
    HISTORY_UNSAVED,
    persist_game,
    sync_summary,
)
from ws.connection_manager import (
    broadcast_game_update,
    broadcast_lobby_update,
)


def resolve_admin_actor(
    game_id: str,
    current_user: AuthUser | None,
    req_user_id: str | None = None,
    req_email: str | None = None,
    x_user_id: str | None = None,
    x_user_email: str | None = None,
) -> tuple[str, str | None]:
    """Return (actor_display, actor_id) for an admin action, never an email address."""
    summary = GAME_SUMMARIES.get(game_id)
    user_id = (
        (current_user.user_id if current_user else None)
        or req_user_id
        or x_user_id
        or (summary.creator_id if summary else None)
    )
    raw_email = (
        (current_user.email if current_user else None)
        or req_email
        or x_user_email
        or (summary.created_by if summary else None)
    )
    actor_display = None
    if summary:
        for part in summary.participants.values():
            if (user_id and part.user_id == user_id) or (
                raw_email and part.email and part.email.lower() == raw_email.lower()
            ):
                if part.display_name:
                    actor_display = part.display_name.split("@", 1)[0]
                    break
    if not actor_display:
        actor_display = raw_email.split("@", 1)[0] if raw_email else "Commander"
    return actor_display, user_id


def compute_admin_orders(
    baseline_units: list[Unit],
    current_units: list[Unit],
    fallback_orders: dict[str, Order] | None = None,
) -> dict[str, Order]:
    """Compute orders representing created (BUILD), deleted (DISBAND), and moved (MOVE) units.

    Reuses the standard Diplomacy order representations so that map layers (BuildTokensLayer,
    UnitToken disband banners, OrderArrowsLayer) clearly indicate what the admin changed.
    """
    baseline_by_id = {u.id: u for u in baseline_units}
    current_by_id = {u.id: u for u in current_units}
    orders: dict[str, Order] = {}

    # 1. Units present in baseline but deleted in current state -> DISBAND
    for u in baseline_units:
        if u.id not in current_by_id:
            orders[u.id] = Order(
                unit_id=u.id,
                power=u.power,
                unit_type=u.unit_type,
                origin=u.province,
                origin_coast=u.coast,
                order_type=OrderType.DISBAND,
                is_explicit=True,
            )

    # 2. Units created in current state that were not in baseline -> BUILD
    for u in current_units:
        if u.id not in baseline_by_id:
            build_id = f"BUILD_{u.power.value}_{u.province}"
            orders[build_id] = Order(
                unit_id=build_id,
                power=u.power,
                unit_type=u.unit_type,
                origin=u.province,
                origin_coast=u.coast,
                order_type=OrderType.BUILD,
                is_explicit=True,
            )

    # 3. Units present in both: check if moved or modified, otherwise retain hold/existing
    for u in current_units:
        if u.id in baseline_by_id:
            bu = baseline_by_id[u.id]
            if bu.power != u.power or bu.unit_type != u.unit_type:
                orders[bu.id] = Order(
                    unit_id=bu.id,
                    power=bu.power,
                    unit_type=bu.unit_type,
                    origin=bu.province,
                    origin_coast=bu.coast,
                    order_type=OrderType.DISBAND,
                    is_explicit=True,
                )
                build_id = f"BUILD_{u.power.value}_{u.province}"
                orders[build_id] = Order(
                    unit_id=build_id,
                    power=u.power,
                    unit_type=u.unit_type,
                    origin=u.province,
                    origin_coast=u.coast,
                    order_type=OrderType.BUILD,
                    is_explicit=True,
                )
            elif bu.province != u.province or bu.coast != u.coast:
                orders[u.id] = Order(
                    unit_id=u.id,
                    power=u.power,
                    unit_type=u.unit_type,
                    origin=bu.province,
                    origin_coast=bu.coast,
                    target=u.province,
                    target_coast=u.coast,
                    order_type=OrderType.MOVE,
                    is_explicit=True,
                )
            else:
                existing = fallback_orders.get(u.id) if fallback_orders else None
                orders[u.id] = existing or Order(
                    unit_id=u.id,
                    power=u.power,
                    unit_type=u.unit_type,
                    origin=u.province,
                    origin_coast=u.coast,
                    order_type=OrderType.HOLD,
                    is_explicit=False,
                )

    return orders


def compute_board_edit_summary(
    before_state: GameState,
    after_units: list[Unit],
    after_ownership: dict[str, Power],
    after_orders: dict[str, Order] | None = None,
) -> list[str]:
    """Generate human-readable [ADMIN OVERRIDE] summary lines for a batch board edit."""
    lines: list[str] = []
    before_by_id = {u.id: u for u in before_state.units}
    after_by_id = {u.id: u for u in after_units}

    for bu in before_state.units:
        if bu.id not in after_by_id:
            lines.append(
                f"[ADMIN OVERRIDE] Destroyed {bu.power.value} {bu.unit_type.value} in {bu.province}."
            )

    for u in after_units:
        if u.id not in before_by_id:
            lines.append(
                f"[ADMIN OVERRIDE] Spawned {u.power.value} {u.unit_type.value} at {u.province}."
            )
        else:
            bu = before_by_id[u.id]
            if bu.power != u.power or bu.unit_type != u.unit_type:
                lines.append(
                    f"[ADMIN OVERRIDE] Changed {bu.power.value} {bu.unit_type.value} in {bu.province} "
                    f"to {u.power.value} {u.unit_type.value} in {u.province}."
                )
            elif bu.province != u.province or bu.coast != u.coast:
                lines.append(
                    f"[ADMIN OVERRIDE] Relocated {u.power.value} {u.unit_type.value} from {bu.province} to {u.province}."
                )

    all_scs = sorted(set(before_state.ownership.keys()) | set(after_ownership.keys()))
    for prov in all_scs:
        prev_owner = before_state.ownership.get(prov)
        new_owner = after_ownership.get(prov)
        if prev_owner != new_owner:
            if new_owner is not None:
                lines.append(f"[ADMIN OVERRIDE] Set ownership of {prov} to {new_owner.value}.")
            else:
                lines.append(f"[ADMIN OVERRIDE] Reset ownership of {prov} to Neutral.")

    if after_orders:
        for uid, order in after_orders.items():
            if uid in before_by_id and uid in after_by_id:
                bu = before_by_id[uid]
                u = after_by_id[uid]
                if bu.province == u.province and bu.coast == u.coast:
                    prev_order = before_state.orders.get(uid)
                    if prev_order and (
                        prev_order.order_type != order.order_type
                        or prev_order.target != order.target
                        or prev_order.aux_unit_origin != order.aux_unit_origin
                    ):
                        lines.append(
                            f"[ADMIN OVERRIDE] Updated order for {u.power.value} {u.unit_type.value} in {u.province}."
                        )

    if not lines:
        lines.append("[ADMIN OVERRIDE] Applied board edit.")
    return lines


async def record_admin_history_and_log(
    game_id: str,
    before_state: GameState,
    after_state: GameState,
    summary_lines: list[str],
    actor: str,
    actor_id: str | None = None,
) -> None:
    """Record an admin action in the audit log and consolidate into GAME_HISTORY.

    - Increments after_state.state_revision.
    - Appends an AdminActionLogEntry with the actor already acknowledged.
    - Consolidates consecutive admin actions within the same turn window (season + year) into
      a single 'Admin' snapshot retaining pre-admin baseline units and ownership.
    - Computes BUILD/DISBAND/MOVE diff orders so the turn history viewer clearly displays
      created and deleted units using standard Adjustment/Movement UI elements.
    - Marks HISTORY_UNSAVED and persists to Supabase.
    - Broadcasts the update to all connected players.
    """
    after_state.state_revision = max(before_state.state_revision, after_state.state_revision) + 1

    # 1. Audit log entry
    entry_id = str(uuid.uuid4())
    ack_list: list[str] = []
    if actor_id:
        ack_list.append(actor_id)
    if actor and actor not in ack_list:
        ack_list.append(actor)

    summary = GAME_SUMMARIES.get(game_id)
    if summary:
        for p_key, part in summary.participants.items():
            if (actor_id and part.user_id == actor_id) or (
                actor and part.email and part.email.lower() == actor.lower()
            ):
                if p_key not in ack_list:
                    ack_list.append(p_key)

    entry = AdminActionLogEntry(
        id=entry_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        actor=actor,
        season=before_state.season,
        year=before_state.year,
        phase=before_state.phase,
        summary_lines=summary_lines,
        acknowledged_by=ack_list,
    )
    after_state.admin_log.append(entry)

    # 2. Consolidation in GAME_HISTORY
    history = GAME_HISTORY.setdefault(game_id, [])
    is_consecutive_admin = (
        bool(history)
        and history[-1].phase == "Admin"
        and history[-1].season == before_state.season
        and history[-1].year == before_state.year
    )

    if is_consecutive_admin:
        trailing = history[-1]
        if trailing.last_resolution:
            trailing.last_resolution.summary.extend(summary_lines)
            trailing.last_resolution.new_units = copy.deepcopy(after_state.units)
            trailing.last_resolution.new_ownership = copy.deepcopy(after_state.ownership)
            trailing.last_resolution.next_season = after_state.season
            trailing.last_resolution.next_year = after_state.year
            trailing.last_resolution.next_phase = after_state.phase
            trailing.last_resolution.builds = copy.deepcopy(after_state.builds)
            trailing.last_resolution.retreats = copy.deepcopy(after_state.retreats)
            trailing.last_resolution.winner = after_state.winner
        # Recompute net orders between pre-admin baseline and new outcome
        trailing.orders = compute_admin_orders(trailing.units, after_state.units)
    else:
        admin_snap = before_state.model_copy(
            deep=True, update={"last_resolution": None, "issues": [], "timer": None}
        )
        admin_snap.phase = "Admin"
        admin_snap.orders = compute_admin_orders(before_state.units, after_state.units)
        admin_snap.last_resolution = SimulationResult(
            resolutions={},
            summary=list(summary_lines),
            new_units=copy.deepcopy(after_state.units),
            new_ownership=copy.deepcopy(after_state.ownership),
            next_season=after_state.season,
            next_year=after_state.year,
            next_phase=after_state.phase,
            builds=copy.deepcopy(after_state.builds),
            retreats=copy.deepcopy(after_state.retreats),
            winner=after_state.winner,
        )
        history.append(admin_snap)
        if len(history) > 30:
            history.pop(0)

    # 3. Persistence and broadcast
    HISTORY_UNSAVED.add(game_id)
    sync_summary(game_id)
    await persist_game(game_id)
    await broadcast_game_update(game_id, after_state)
    await broadcast_lobby_update()
