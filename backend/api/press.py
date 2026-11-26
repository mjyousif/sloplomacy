"""FastAPI router for press: the public box and private threads of a match, signed or anonymous."""

import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone

from domain.board import Power, UnitType
from domain.game_state import GameState
from domain.orders import Order, OrderType
from domain.press import (
    MAX_PRESS_BODY_LENGTH,
    PressFeed,
    PressMessage,
    PressMessageView,
    PressPostRequest,
)
from engine.adjudicator.resolver import compute_current_builds
from engine.order_utils import (
    build_slot_power,
    build_slot_province,
    fleet_coast,
    normalize_unit_order,
    validate_order_references,
)
from engine.topology.provinces import PROVINCES
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from security.auth import AuthUser, get_current_user
from security.passcode import client_address
from security.press import feed_for, spectator_feed, view_of
from security.secrecy import require_view_access, viewer_power_for
from storage.press import add_press, next_press_seq, persist_press, press_of
from storage.store import (
    GAME_SUMMARIES,
    is_multiplayer_match,
    is_private_sandbox,
    resolve_game,
)
from storage.supabase import SupabaseUnavailable
from ws.connection_manager import manager

router = APIRouter(tags=["Press"])

# A seat may send this many messages within the window before it is asked to slow down.
RATE_LIMIT_MESSAGES = 8
RATE_LIMIT_WINDOW_SECONDS = 10.0
_recent_posts: dict[tuple[str, Power], deque[float]] = defaultdict(deque)

# What a suggestion may hold, by phase and target kind.
PHASE_UNIT_ORDER_TYPES: dict[str, set[OrderType]] = {
    "Movement": {OrderType.HOLD, OrderType.MOVE, OrderType.SUPPORT, OrderType.CONVOY},
    "Retreats": {OrderType.RETREAT, OrderType.DISBAND},
    "Adjustments": {OrderType.DISBAND},
}
BUILD_SLOT_ORDER_TYPES = {OrderType.BUILD, OrderType.WAIVE}
SUGGESTABLE_ORDER_TYPES = set().union(*PHASE_UNIT_ORDER_TYPES.values()) | BUILD_SLOT_ORDER_TYPES


async def _press_match(game_id: str | None) -> GameState:
    """The multiplayer match whose press is asked for. A sandbox has none."""
    if is_private_sandbox(game_id):
        raise HTTPException(status_code=404, detail="A private sandbox has no press.")
    game = await resolve_game(game_id)
    if not is_multiplayer_match(game.game_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Only multiplayer matches have press."
        )
    return game


def _refuse_unheld(requested: Power | None, seat: Power | None) -> None:
    """A `power` the caller names only picks among their own seats."""
    if requested is not None and seat != requested:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Press is for the players seated in this match.",
        )


async def _press_seat(
    game_id: str | None, requested: Power | None, current_user: AuthUser | None
) -> tuple[GameState, Power]:
    """The match and the seat the caller writes press from. Only seated players send press: a
    spectator or a host without a seat is refused."""
    game = await _press_match(game_id)
    power = viewer_power_for(game.game_id, current_user, requested)
    _refuse_unheld(requested, power)
    if power is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Press is for the players seated in this match.",
        )
    return game, power


async def _loaded_press(game_id: str) -> list[PressMessage]:
    try:
        return await press_of(game_id)
    except SupabaseUnavailable as ex:
        raise HTTPException(
            status_code=503, detail="Press is unavailable right now. Please try again shortly."
        ) from ex


def _check_rate(game_id: str, power: Power) -> None:
    now = time.monotonic()
    recent = _recent_posts[(game_id, power)]
    while recent and now - recent[0] > RATE_LIMIT_WINDOW_SECONDS:
        recent.popleft()
    if len(recent) >= RATE_LIMIT_MESSAGES:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You are sending messages too quickly. Wait a moment.",
        )
    recent.append(now)


def _suggested_orders(
    game: GameState, seat: Power, recipients: list[Power], req: PressPostRequest
) -> list[Order]:
    """The orders a suggestion will carry, checked and rebuilt from the units or build slots they
    are for.

    A suggestion may be attached to public press (signed or anonymous), a signed private thread,
    or a one-to-one anonymous backchannel, during any active phase (Movement, Retreats, or
    Adjustments), with at most one order per unit or build slot. Public press allows any power's
    units or build slots on the board so anonymous posts never leak sender identity; signed private
    threads allow the sender and recipients; anonymous backchannels allow only the recipient's
    units or build slots. Nothing here reads or writes the game's own orders: the message holds
    only what the sender attached. Like `POST /api/order`, it checks that provinces and coasts
    exist and belong to the current phase, not that the moves are legal.
    """
    if not req.orders:
        return []
    if req.anonymous and len(recipients) > 1:
        raise HTTPException(
            status_code=422,
            detail="Orders can only be suggested in public press, a signed private message, or a one-to-one backchannel.",
        )
    if game.winner is not None or game.phase not in PHASE_UNIT_ORDER_TYPES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Orders cannot be suggested in the current game state or phase.",
        )

    if not recipients:
        members = set(Power)
    elif req.anonymous:
        members = set(recipients)
    else:
        members = {seat, *recipients}

    builds = (
        game.builds
        if game.phase != "Adjustments" or game.builds is not None
        else compute_current_builds(game.units, game.ownership, game.year)
    )
    units = {u.id: u for u in game.units}
    orders: dict[str, Order] = {}
    for order in req.orders:
        if order.unit_id in orders:
            raise HTTPException(
                status_code=422, detail=f"{order.unit_id} has more than one suggested order."
            )
        if order.unit_id.startswith("BUILD_"):
            if game.phase != "Adjustments":
                raise HTTPException(
                    status_code=422,
                    detail="Build slots can only be suggested during Adjustments.",
                )
            slot_power = build_slot_power(order.unit_id)
            home = build_slot_province(order.unit_id)
            b_info = (builds or {}).get(slot_power.value, {}) if slot_power else {}
            valid_slot = (
                slot_power is not None
                and home is not None
                and home in PROVINCES
                and (
                    order.unit_id in game.orders
                    or (b_info.get("count", 0) > 0 and home in b_info.get("homes", []))
                )
            )
            if not valid_slot or slot_power is None or home is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"There is no build slot {order.unit_id} this phase.",
                )
            if slot_power not in members:
                detail = (
                    f"{order.unit_id} belongs to {slot_power.value}; anonymous backchannel "
                    "suggestions may only include the recipient's units."
                    if req.anonymous
                    else f"{order.unit_id} belongs to {slot_power.value}, who is not in this thread."
                )
                raise HTTPException(status_code=422, detail=detail)
            if order.order_type not in BUILD_SLOT_ORDER_TYPES:
                raise HTTPException(
                    status_code=422,
                    detail=f"A {order.order_type.value} order cannot be suggested for a build slot.",
                )
            if order.order_type == OrderType.BUILD:
                if order.unit_type == UnitType.FLEET:
                    if PROVINCES[home].type == "LAND":
                        raise HTTPException(
                            status_code=422,
                            detail=f"Cannot build a fleet in inland province '{home}'.",
                        )
                    if order.origin_coast and order.origin_coast not in PROVINCES[home].coasts:
                        raise HTTPException(
                            status_code=400,
                            detail=f"'{home}' has no coast '{order.origin_coast}'.",
                        )
                    origin_coast = fleet_coast(UnitType.FLEET, PROVINCES[home], order.origin_coast)
                else:
                    origin_coast = None
            else:
                origin_coast = None

            orders[order.unit_id] = Order(
                unit_id=order.unit_id,
                power=slot_power,
                unit_type=UnitType.ARMY if order.order_type == OrderType.WAIVE else order.unit_type,
                origin=home,
                origin_coast=origin_coast,
                order_type=order.order_type,
                via_convoy=False,
                is_explicit=True,
            )
            continue

        unit = units.get(order.unit_id)
        if unit is None:
            raise HTTPException(status_code=422, detail=f"There is no unit {order.unit_id}.")
        if unit.power not in members:
            detail = (
                f"{order.unit_id} belongs to {unit.power.value}; anonymous backchannel "
                "suggestions may only include the recipient's units."
                if req.anonymous
                else f"{order.unit_id} belongs to {unit.power.value}, who is not in this thread."
            )
            raise HTTPException(status_code=422, detail=detail)
        if order.order_type not in PHASE_UNIT_ORDER_TYPES[game.phase]:
            raise HTTPException(
                status_code=422,
                detail=f"A {order.order_type.value} order cannot be suggested during {game.phase}.",
            )
        if game.phase == "Retreats":
            if not unit.is_dislodged:
                raise HTTPException(
                    status_code=422,
                    detail=f"{order.unit_id} is not dislodged.",
                )
            if order.order_type == OrderType.RETREAT and not order.target:
                raise HTTPException(
                    status_code=422,
                    detail=f"A RETREAT order for {order.unit_id} needs a target province.",
                )
        validate_order_references(order)
        suggested = normalize_unit_order(order, unit)
        suggested.is_explicit = True
        orders[unit.id] = suggested
    return list(orders.values())


@router.get(
    "/api/press",
    response_model=PressFeed,
    summary="Read Press",
    description=(
        "The press the caller's power may read, oldest first: all public messages, and the "
        "private messages it sent or received. Anonymous authors are hidden. Once the game is "
        "over every message and author is shown. `after` returns only newer messages. A caller "
        "with no seat (a spectator) gets the public box alone, with `power` null; a private "
        "match then needs its passcode, as with `GET /api/game`."
    ),
)
async def read_press(
    request: Request,
    game_id: str | None = Query(default=None),
    power: Power | None = Query(default=None),
    after: int = Query(default=0, ge=0),
    x_passcode: str | None = Header(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await _press_match(game_id)
    gid = game.game_id
    seat = viewer_power_for(gid, current_user, power)
    _refuse_unheld(power, seat)
    if seat is None:
        require_view_access(gid, current_user, x_passcode, client=client_address(request))
        messages = await _loaded_press(gid)
        return PressFeed(power=None, messages=spectator_feed(messages, after))
    messages = await _loaded_press(gid)
    return PressFeed(power=seat, messages=feed_for(messages, seat, after))


@router.post(
    "/api/press",
    response_model=PressMessageView,
    summary="Send Press",
    description=(
        "Post to the public box (no recipients) or to a private thread (recipients). With "
        "`anonymous` the author is hidden (one-to-one anonymous messages go to the recipient's "
        "backchannel). The sender is the caller's own seat. Public press (signed or anonymous), "
        "signed private messages, and one-to-one backchannels may carry `orders` in any active "
        "phase (Movement, Retreats, or Adjustments), which change nobody's real orders."
    ),
)
async def send_press(
    req: PressPostRequest,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    game, seat = await _press_seat(game_id, req.power, current_user)
    gid = game.game_id

    body = req.body.strip()
    if not body and not req.orders:
        raise HTTPException(status_code=422, detail="A message cannot be empty.")
    if len(body) > MAX_PRESS_BODY_LENGTH:
        raise HTTPException(
            status_code=422,
            detail=f"A message can be at most {MAX_PRESS_BODY_LENGTH} characters.",
        )
    recipients = sorted({p for p in req.recipients if p != seat}, key=lambda p: p.value)
    if req.recipients and not recipients:
        raise HTTPException(status_code=422, detail="You cannot send a message to yourself.")
    summary = GAME_SUMMARIES.get(gid)
    seated = set(summary.participants) if summary else set()
    if empty := [p.value for p in recipients if p.value not in seated]:
        raise HTTPException(
            status_code=422,
            detail=f"Nobody holds {', '.join(empty)} yet, so nobody would read it.",
        )
    if seat in game.surrendered_powers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{seat.value} has surrendered and can no longer send press.",
        )

    _check_rate(gid, seat)
    await _loaded_press(gid)
    # Checked after the last await, so the orders are for the turn the message is stamped with.
    orders = _suggested_orders(game, seat, recipients, req)
    # No await between reading the next number and adding the message, so no two share one.
    message = PressMessage(
        id=str(uuid.uuid4()),
        seq=next_press_seq(gid),
        sender=seat,
        anonymous=req.anonymous,
        recipients=recipients,
        body=body,
        sent_at=datetime.now(timezone.utc).isoformat(),
        season=game.season,
        year=game.year,
        phase=game.phase,
        orders=orders,
    )
    add_press(gid, message)

    await manager.broadcast_press(gid, message)
    await persist_press(gid)
    return view_of(message, seat)
