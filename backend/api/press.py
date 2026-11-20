"""FastAPI router for press: the public box and private threads of a match, signed or anonymous."""

import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone

from domain.board import Power
from domain.game_state import GameState
from domain.orders import Order, OrderType
from domain.press import (
    MAX_PRESS_BODY_LENGTH,
    PressFeed,
    PressMessage,
    PressMessageView,
    PressPostRequest,
)
from engine.order_utils import normalize_unit_order, validate_order_references
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from security.auth import AuthUser, get_current_user
from security.passcode import client_address
from security.press import feed_for, press_revealed, spectator_feed, view_of
from security.secrecy import require_view_access, viewer_power_for
from storage.press import add_press, next_press_seq, persist_press, press_of
from storage.store import (
    GAME_SUMMARIES,
    PRIVATE_SANDBOXES,
    is_multiplayer_match,
    resolve_game,
)
from storage.supabase import SupabaseUnavailable
from ws.connection_manager import manager

router = APIRouter(tags=["Press"])

# A seat may send this many messages within the window before it is asked to slow down.
RATE_LIMIT_MESSAGES = 8
RATE_LIMIT_WINDOW_SECONDS = 10.0
_recent_posts: dict[tuple[str, Power], deque[float]] = defaultdict(deque)

# What a suggestion may hold: the orders of a Movement phase.
SUGGESTABLE_ORDER_TYPES = {OrderType.HOLD, OrderType.MOVE, OrderType.SUPPORT, OrderType.CONVOY}


async def _press_match(game_id: str | None) -> GameState:
    """The multiplayer match whose press is asked for. A sandbox has none."""
    if game_id and (game_id.startswith("sbx_") or game_id in PRIVATE_SANDBOXES):
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
    """The orders a suggestion will carry, checked and rebuilt from the units they are for.

    A suggestion is a message in a private thread (signed) or a one-to-one backchannel
    (anonymous), made in a Movement phase, with at most one order for each unit. Signed threads
    allow units of the sender and the recipients; anonymous backchannels allow only units of the
    recipient so the sender is never revealed. Nothing here reads or writes the game's own
    orders: the message holds only what the sender attached. Like `POST /api/order`, it checks
    that the provinces exist, not that the moves are legal.
    """
    if not req.orders:
        return []
    if not recipients or (req.anonymous and len(recipients) != 1):
        raise HTTPException(
            status_code=422,
            detail="Moves can only be suggested in a signed private message or a one-to-one backchannel.",
        )
    if game.phase != "Movement":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Moves can only be suggested during a Movement phase.",
        )
    members = set(recipients) if req.anonymous else {seat, *recipients}
    units = {u.id: u for u in game.units}
    orders: dict[str, Order] = {}
    for order in req.orders:
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
        if order.order_type not in SUGGESTABLE_ORDER_TYPES:
            raise HTTPException(
                status_code=422,
                detail=f"A {order.order_type.value} order cannot be suggested.",
            )
        if order.unit_id in orders:
            raise HTTPException(
                status_code=422, detail=f"{order.unit_id} has more than one suggested order."
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
    passcode: str | None = Query(default=None),
    x_passcode: str | None = Header(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await _press_match(game_id)
    gid = game.game_id
    seat = viewer_power_for(gid, current_user, power)
    _refuse_unheld(power, seat)
    revealed = press_revealed(game)
    if seat is None:
        require_view_access(
            gid, current_user, passcode or x_passcode, client=client_address(request)
        )
        messages = await _loaded_press(gid)
        return PressFeed(
            power=None, revealed=revealed, messages=spectator_feed(messages, revealed, after)
        )
    messages = await _loaded_press(gid)
    return PressFeed(
        power=seat, revealed=revealed, messages=feed_for(messages, seat, revealed, after)
    )


@router.post(
    "/api/press",
    response_model=PressMessageView,
    summary="Send Press",
    description=(
        "Post to the public box (no recipients) or to a private thread (recipients). With "
        "`anonymous` the author is hidden (one-to-one anonymous messages go to the recipient's "
        "backchannel). The sender is the caller's own seat. A "
        "signed private message may carry `orders`: moves suggested for the units of the "
        "sender and the recipients, which change nobody's real orders."
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
    if press_revealed(game) and (recipients or req.anonymous):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The game is over: all press is public now, so only signed public messages can be sent.",
        )

    _check_rate(gid, seat)
    await _loaded_press(gid)
    # Checked after the last await, so the orders are for the turn the message is stamped with.
    orders = _suggested_orders(game, seat, recipients, req)
    # No await between reading the next number and adding the message, so no two share one.
    message = PressMessage(
        id=uuid.uuid4().hex,
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

    revealed = press_revealed(game)
    await manager.broadcast_press(gid, message, revealed)
    await persist_press(gid)
    return view_of(message, seat, revealed)
