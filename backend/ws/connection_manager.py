import asyncio
import logging
from collections import defaultdict

from domain.board import Power
from domain.game_state import GameState, MultiplayerGameSummary
from domain.press import PressMessage
from fastapi import WebSocket
from security.press import can_read, spectator_view, view_of
from security.secrecy import sanitize_game_state_for_viewer, sanitize_summary_for_viewer
from starlette.websockets import WebSocketDisconnect
from storage.lobby import public_summaries
from storage.store import GAME_SUMMARIES, GAMES, sync_summary

logger = logging.getLogger("diplomacy.ws")

# A client that takes longer than this to accept a message is treated as gone. Sends run
# concurrently, so one stalled socket delays nobody else past this.
SEND_TIMEOUT_SECONDS = 5.0


async def send_or_report(ws: WebSocket, payload: dict) -> bool:
    """Send `payload`, answering False when the socket is gone or too slow to keep.

    A socket that closed is routine and logged quietly. A timeout, or any other failure, is not,
    so it is logged: silence there would hide a bug as a client that never gets updates.
    """
    try:
        await asyncio.wait_for(ws.send_json(payload), timeout=SEND_TIMEOUT_SECONDS)
        return True
    except WebSocketDisconnect:
        logger.debug("Socket closed before a broadcast reached it.")
    except RuntimeError as ex:
        # Starlette raises this for a send on a socket that has already closed.
        logger.debug("Socket no longer accepts sends: %s", ex)
    except asyncio.TimeoutError:
        logger.warning(
            "Dropping a socket that did not accept a send within %ss.", SEND_TIMEOUT_SECONDS
        )
    except Exception:
        logger.warning("Dropping a socket after an unexpected send error.", exc_info=True)
    return False


async def send_to_all(sends: list[tuple[WebSocket, dict]]) -> list[WebSocket]:
    """Send every (socket, payload) at once and return the sockets that failed."""
    results = await asyncio.gather(*(send_or_report(ws, payload) for ws, payload in sends))
    return [ws for (ws, _), ok in zip(sends, results, strict=True) if not ok]


class ConnectionManager:
    """Manages active WebSocket connections for game rooms and lobby."""

    def __init__(self) -> None:
        self.game_connections: dict[str, dict[WebSocket, Power | None]] = defaultdict(dict)
        self.lobby_connections: set[WebSocket] = set()

    async def connect_game(
        self, game_id: str, websocket: WebSocket, power: Power | None = None
    ) -> None:
        await websocket.accept()
        self.game_connections[game_id][websocket] = power

    def register_game(self, game_id: str, websocket: WebSocket, power: Power | None = None) -> None:
        """Add a socket that has already been accepted."""
        self.game_connections[game_id][websocket] = power

    def disconnect_game(self, game_id: str, websocket: WebSocket) -> None:
        self.game_connections[game_id].pop(websocket, None)
        if not self.game_connections[game_id]:
            self.game_connections.pop(game_id, None)

    async def connect_lobby(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.lobby_connections.add(websocket)

    def disconnect_lobby(self, websocket: WebSocket) -> None:
        self.lobby_connections.discard(websocket)

    async def broadcast_game(
        self,
        game_id: str,
        state: GameState | None = None,
        summary: MultiplayerGameSummary | None = None,
    ) -> None:
        connections = self.game_connections.get(game_id)
        if not connections:
            return

        if state is None and game_id in GAMES:
            state = GAMES[game_id]
        if summary is None and game_id in GAME_SUMMARIES:
            summary = GAME_SUMMARIES[game_id]
        if state is None:
            return

        # Masking a state runs the adjudicator, so it is built once per viewing power (there are
        # at most eight, though many sockets may share one), not once per socket.
        summary_json = (
            sanitize_summary_for_viewer(summary).model_dump(mode="json") if summary else None
        )
        payload_by_power: dict[Power | None, dict] = {}
        sends: list[tuple[WebSocket, dict]] = []
        for ws, ws_power in list(connections.items()):
            if ws_power not in payload_by_power:
                payload_by_power[ws_power] = {
                    "type": "game_update",
                    "game_id": game_id,
                    "state": sanitize_game_state_for_viewer(state, ws_power).model_dump(
                        mode="json"
                    ),
                    "summary": summary_json,
                }
            sends.append((ws, payload_by_power[ws_power]))

        for ws in await send_to_all(sends):
            self.disconnect_game(game_id, ws)

    async def broadcast_press(self, game_id: str, message: PressMessage, revealed: bool) -> None:
        """Send a new press message to each seated player's socket that may read it, as that
        player may see it. A socket with no seat (a spectator) is sent public messages alone, as
        a spectator may see them, with `power` null."""
        connections = self.game_connections.get(game_id)
        if not connections:
            return

        sends: list[tuple[WebSocket, dict]] = []
        for ws, ws_power in list(connections.items()):
            if ws_power is None:
                if message.recipients:
                    continue
                view = spectator_view(message, revealed)
            elif can_read(message, ws_power, revealed):
                view = view_of(message, ws_power, revealed)
            else:
                continue
            payload = {
                "type": "press",
                "game_id": game_id,
                "power": ws_power.value if ws_power else None,
                "messages": [view.model_dump(mode="json")],
            }
            sends.append((ws, payload))

        for ws in await send_to_all(sends):
            self.disconnect_game(game_id, ws)

    async def broadcast_lobby(self) -> None:
        if not self.lobby_connections:
            return

        for gid in list(GAME_SUMMARIES.keys()):
            sync_summary(gid)

        payload = {
            "type": "lobby_update",
            # One payload goes to every socket, so it holds public matches only.
            "games": [
                sanitize_summary_for_viewer(s).model_dump(mode="json") for s in public_summaries()
            ],
        }
        sends = [(ws, payload) for ws in list(self.lobby_connections)]
        for ws in await send_to_all(sends):
            self.disconnect_lobby(ws)


manager = ConnectionManager()


async def broadcast_game_update(
    game_id: str,
    state: GameState | None = None,
    summary: MultiplayerGameSummary | None = None,
) -> None:
    sync_summary(game_id)
    await manager.broadcast_game(game_id, state=state, summary=summary)


async def broadcast_lobby_update() -> None:
    await manager.broadcast_lobby()
