"""FastAPI router for real-time WebSocket communication (game turns and multiplayer lobby)."""

import asyncio
import logging

from domain.board import Power
from engine import turn_service
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from fastapi.security import HTTPAuthorizationCredentials
from security.auth import AuthUser, get_current_user
from security.passcode import PasscodeRateLimited, check_passcode, client_address
from security.secrecy import (
    caller_holds_seat,
    caller_owns_saved_sandbox,
    viewer_ack_ids,
    viewer_power_for,
)
from storage import supabase
from storage.store import (
    GAME_SUMMARIES,
    GAMES,
    PRIVATE_SANDBOXES,
    cache_loaded_game,
    is_multiplayer_match,
    sync_summary,
)
from storage.supabase import SupabaseUnavailable
from ws.connection_manager import (
    build_game_update_payload,
    build_lobby_update_payload,
    manager,
)

logger = logging.getLogger("diplomacy.ws")

router = APIRouter()

SOCKET_AUTH_TIMEOUT_SECONDS = 10.0
# Close codes the client must not reconnect after: no such game, not allowed, too many wrong
# passcodes. Keep in sync with `useDiplomacyWebSocket`.
CLOSE_NOT_FOUND = 4004
CLOSE_FORBIDDEN = 4403
CLOSE_TOO_MANY_PASSCODES = 4429


async def receive_socket_identity(websocket: WebSocket) -> tuple[AuthUser | None, str | None]:
    """
    Read who is on an accepted game socket, and the passcode they offer.

    Browsers cannot put an Authorization header on a WebSocket, and a token or passcode in the URL
    would end up in request logs, so the client sends `{"type": "auth", "token": ..., "passcode":
    ...}` as its first message (it asks for this with `?handshake=1`). Either may be absent. A
    missing, late or invalid token means signed out, and no first message means no passcode.
    """
    try:
        data = await asyncio.wait_for(websocket.receive_json(), timeout=SOCKET_AUTH_TIMEOUT_SECONDS)
    except (asyncio.TimeoutError, ValueError, KeyError, WebSocketDisconnect):
        return None, None
    if not isinstance(data, dict) or data.get("type") != "auth":
        return None, None
    passcode = data.get("passcode")
    passcode = passcode if isinstance(passcode, str) else None
    if not data.get("token"):
        return None, passcode
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=str(data["token"]))
    try:
        return await run_in_threadpool(get_current_user, credentials), passcode
    except HTTPException:
        return None, passcode


@router.websocket("/ws/games/{game_id}")
async def ws_game_endpoint(
    websocket: WebSocket,
    game_id: str,
    power: str | None = Query(default=None),
    handshake: bool = Query(default=False),
):
    if game_id not in GAMES and supabase.is_persistence_enabled():
        try:
            loaded = await supabase.load_game_from_db(game_id)
        except SupabaseUnavailable:
            await websocket.close(code=1013)
            return
        if loaded is not None:
            cache_loaded_game(game_id, loaded)

    if game_id not in GAMES:
        await websocket.close(code=CLOSE_NOT_FOUND)
        return

    await websocket.accept()
    current_user, passcode = await receive_socket_identity(websocket) if handshake else (None, None)

    requested: Power | None = None
    if power:
        try:
            requested = Power(power.upper())
        except ValueError:
            pass
    power_enum = viewer_power_for(game_id, current_user, requested)

    if game_id in PRIVATE_SANDBOXES:
        match_id, seat_power = PRIVATE_SANDBOXES[game_id]
        if not caller_holds_seat(GAME_SUMMARIES.get(match_id), seat_power, current_user):
            await websocket.close(code=CLOSE_FORBIDDEN)
            return

    summary = GAME_SUMMARIES.get(game_id)
    if summary and summary.is_sandbox and not caller_owns_saved_sandbox(summary, current_user):
        await websocket.close(code=CLOSE_FORBIDDEN)
        return
    if summary and summary.has_passcode and is_multiplayer_match(game_id) and power_enum is None:
        try:
            allowed = check_passcode(game_id, passcode, client_address(websocket))
        except PasscodeRateLimited:
            await websocket.close(code=CLOSE_TOO_MANY_PASSCODES)
            return
        if not allowed:
            await websocket.close(code=CLOSE_FORBIDDEN)
            return

    viewer_ids = viewer_ack_ids(current_user)
    manager.register_game(game_id, websocket, power=power_enum, viewer_ids=viewer_ids)
    sync_summary(game_id)
    game = GAMES[game_id]
    try:
        await turn_service.tick_timer(game)
        summary = GAME_SUMMARIES.get(game_id)
        await websocket.send_json(
            build_game_update_payload(game_id, game, summary, power_enum, viewer_ids)
        )
        while True:
            data = await websocket.receive_json()
            if isinstance(data, dict):
                msg_type = data.get("type")
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg_type == "refresh":
                    g = GAMES.get(game_id)
                    s = GAME_SUMMARIES.get(game_id)
                    if g:
                        await turn_service.tick_timer(g)
                        await websocket.send_json(
                            build_game_update_payload(game_id, g, s, power_enum, viewer_ids)
                        )
    except WebSocketDisconnect:
        manager.disconnect_game(game_id, websocket)
    except Exception:
        # A socket that closed is routine (above). Anything else is a bug the client would only
        # see as updates that stop, so it is logged with its traceback.
        logger.exception("Game socket for '%s' failed unexpectedly.", game_id)
        manager.disconnect_game(game_id, websocket)


@router.websocket("/ws/lobby")
async def ws_lobby_endpoint(websocket: WebSocket):
    await manager.connect_lobby(websocket)
    try:
        await websocket.send_json(build_lobby_update_payload())
        while True:
            data = await websocket.receive_json()
            if isinstance(data, dict):
                msg_type = data.get("type")
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg_type == "refresh":
                    await websocket.send_json(build_lobby_update_payload())
    except WebSocketDisconnect:
        manager.disconnect_lobby(websocket)
    except Exception:
        logger.exception("Lobby socket failed unexpectedly.")
        manager.disconnect_lobby(websocket)
