"""FastAPI router for real-time WebSocket communication (game turns and multiplayer lobby)."""

import asyncio
import hmac

from api.turns import tick_timer
from domain.board import Power
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from fastapi.security import HTTPAuthorizationCredentials
from security.auth import AuthUser, get_current_user
from security.secrecy import (
    caller_owns_saved_sandbox,
    sanitize_game_state_for_viewer,
    sanitize_summary_for_viewer,
    viewer_power_for,
)
from storage import supabase
from storage.lobby import public_summaries
from storage.store import (
    GAME_PASSCODES,
    GAME_SUMMARIES,
    GAMES,
    cache_loaded_game,
    is_multiplayer_match,
    sync_summary,
)
from storage.supabase import SupabaseUnavailable
from ws.connection_manager import manager

router = APIRouter()

SOCKET_AUTH_TIMEOUT_SECONDS = 10.0


async def receive_socket_identity(websocket: WebSocket) -> AuthUser | None:
    """
    Read who is on an accepted game socket.

    Browsers cannot put an Authorization header on a WebSocket, and a token in the URL would end
    up in request logs, so the client sends `{"type": "auth", "token": ...}` as its first message
    (it asks for this with `?handshake=1`). A missing, late or invalid token means signed out.
    """
    try:
        data = await asyncio.wait_for(websocket.receive_json(), timeout=SOCKET_AUTH_TIMEOUT_SECONDS)
    except (asyncio.TimeoutError, ValueError, KeyError, WebSocketDisconnect):
        return None
    if not isinstance(data, dict) or data.get("type") != "auth" or not data.get("token"):
        return None
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=str(data["token"]))
    try:
        return await run_in_threadpool(get_current_user, credentials)
    except HTTPException:
        return None


@router.websocket("/ws/games/{game_id}")
async def ws_game_endpoint(
    websocket: WebSocket,
    game_id: str,
    power: str | None = Query(default=None),
    passcode: str | None = Query(default=None),
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
        await websocket.close(code=4004)
        return

    await websocket.accept()
    current_user = await receive_socket_identity(websocket) if handshake else None

    requested: Power | None = None
    if power:
        try:
            requested = Power(power.upper())
        except ValueError:
            pass
    power_enum = viewer_power_for(game_id, current_user, requested)

    summary = GAME_SUMMARIES.get(game_id)
    if summary and summary.is_sandbox and not caller_owns_saved_sandbox(summary, current_user):
        await websocket.close(code=4403)
        return
    if summary and summary.has_passcode and is_multiplayer_match(game_id):
        expected_pw = GAME_PASSCODES.get(game_id, "")
        provided_pw = (passcode or "").strip()
        if power_enum is None and (
            not expected_pw or not hmac.compare_digest(provided_pw, expected_pw)
        ):
            await websocket.close(code=4403)
            return

    manager.register_game(game_id, websocket, power=power_enum)
    sync_summary(game_id)
    game = GAMES[game_id]
    try:
        await tick_timer(game)
        summary = GAME_SUMMARIES.get(game_id)
        sanitized = sanitize_game_state_for_viewer(game, power_enum)
        await websocket.send_json(
            {
                "type": "game_update",
                "game_id": game_id,
                "state": sanitized.model_dump(mode="json"),
                "summary": sanitize_summary_for_viewer(summary).model_dump(mode="json")
                if summary
                else None,
            }
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
                        await tick_timer(g)
                        g_sanitized = sanitize_game_state_for_viewer(g, power_enum)
                        await websocket.send_json(
                            {
                                "type": "game_update",
                                "game_id": game_id,
                                "state": g_sanitized.model_dump(mode="json"),
                                "summary": sanitize_summary_for_viewer(s).model_dump(mode="json")
                                if s
                                else None,
                            }
                        )
    except WebSocketDisconnect:
        manager.disconnect_game(game_id, websocket)
    except Exception:
        manager.disconnect_game(game_id, websocket)


@router.websocket("/ws/lobby")
async def ws_lobby_endpoint(websocket: WebSocket):
    await manager.connect_lobby(websocket)
    try:
        for gid in list(GAME_SUMMARIES.keys()):
            sync_summary(gid)
        await websocket.send_json(
            {
                "type": "lobby_update",
                "games": [
                    sanitize_summary_for_viewer(s).model_dump(mode="json")
                    for s in public_summaries()
                ],
            }
        )
        while True:
            data = await websocket.receive_json()
            if isinstance(data, dict):
                msg_type = data.get("type")
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg_type == "refresh":
                    for gid in list(GAME_SUMMARIES.keys()):
                        sync_summary(gid)
                    await websocket.send_json(
                        {
                            "type": "lobby_update",
                            "games": [
                                sanitize_summary_for_viewer(s).model_dump(mode="json")
                                for s in public_summaries()
                            ],
                        }
                    )
    except WebSocketDisconnect:
        manager.disconnect_lobby(websocket)
    except Exception:
        manager.disconnect_lobby(websocket)
