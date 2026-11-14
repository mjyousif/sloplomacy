"""FastAPI router for press: the public box, private threads and anonymous notes of a match."""

import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone

from domain.board import Power
from domain.game_state import GameState
from domain.press import (
    MAX_PRESS_BODY_LENGTH,
    PressFeed,
    PressMessage,
    PressMessageView,
    PressPostRequest,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from security.auth import AuthUser, get_current_user
from security.press import feed_for, press_revealed, view_of
from security.secrecy import viewer_power_for
from storage.press import add_press, next_press_seq, persist_press, press_of
from storage.store import PRIVATE_SANDBOXES, is_multiplayer_match, resolve_game
from storage.supabase import SupabaseUnavailable
from ws.connection_manager import manager

router = APIRouter(tags=["Press"])

# A seat may send this many messages within the window before it is asked to slow down.
RATE_LIMIT_MESSAGES = 8
RATE_LIMIT_WINDOW_SECONDS = 10.0
_recent_posts: dict[tuple[str, Power], deque[float]] = defaultdict(deque)


async def _press_seat(
    game_id: str | None, requested: Power | None, current_user: AuthUser | None
) -> tuple[GameState, Power]:
    """The match and the seat the caller reads or writes press from. Press is for seated players
    of a multiplayer match: a sandbox has none, and a spectator or a host without a seat is
    refused, because the answer depends on which power is asking."""
    if game_id and (game_id.startswith("sbx_") or game_id in PRIVATE_SANDBOXES):
        raise HTTPException(status_code=404, detail="A private sandbox has no press.")
    game = await resolve_game(game_id)
    if not is_multiplayer_match(game.game_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Only multiplayer matches have press."
        )
    power = viewer_power_for(game.game_id, current_user, requested)
    if power is None or (requested is not None and power != requested):
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


@router.get(
    "/api/press",
    response_model=PressFeed,
    summary="Read Press",
    description=(
        "The press the caller's power may read, oldest first: all public messages, and the "
        "private messages it sent or received. Anonymous authors are hidden. Once the game is "
        "over every message and author is shown. `after` returns only newer messages."
    ),
)
async def read_press(
    game_id: str | None = Query(default=None),
    power: Power | None = Query(default=None),
    after: int = Query(default=0, ge=0),
    current_user: AuthUser | None = Depends(get_current_user),
):
    game, seat = await _press_seat(game_id, power, current_user)
    messages = await _loaded_press(game.game_id)
    revealed = press_revealed(game)
    return PressFeed(
        power=seat, revealed=revealed, messages=feed_for(messages, seat, revealed, after)
    )


@router.post(
    "/api/press",
    response_model=PressMessageView,
    summary="Send Press",
    description=(
        "Post to the public box (no recipients), to a private thread (recipients), or send an "
        "anonymous note (recipients and `anonymous`). The sender is the caller's own seat."
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
    if not body:
        raise HTTPException(status_code=422, detail="A message cannot be empty.")
    if len(body) > MAX_PRESS_BODY_LENGTH:
        raise HTTPException(
            status_code=422,
            detail=f"A message can be at most {MAX_PRESS_BODY_LENGTH} characters.",
        )
    recipients = sorted({p for p in req.recipients if p != seat}, key=lambda p: p.value)
    if req.recipients and not recipients:
        raise HTTPException(status_code=422, detail="You cannot send a message to yourself.")
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
    )
    add_press(gid, message)

    revealed = press_revealed(game)
    await manager.broadcast_press(gid, message, revealed)
    await persist_press(gid)
    return view_of(message, seat, revealed)
