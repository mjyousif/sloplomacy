from collections import defaultdict

from domain.board import Power
from domain.game_state import GameState, MultiplayerGameSummary
from domain.requests import WebSocketGameUpdate, WebSocketLobbyUpdate
from fastapi import WebSocket
from security.secrecy import sanitize_game_state_for_viewer
from storage.lobby import public_summaries
from storage.store import GAME_SUMMARIES, GAMES, sync_summary


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

        dead: list[WebSocket] = []
        for ws, ws_power in list(connections.items()):
            ws_state = sanitize_game_state_for_viewer(state, ws_power)
            payload = WebSocketGameUpdate(
                game_id=game_id,
                state=ws_state,
                summary=summary,
            ).model_dump(mode="json")
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect_game(game_id, ws)

    async def broadcast_lobby(self) -> None:
        if not self.lobby_connections:
            return

        for gid in list(GAME_SUMMARIES.keys()):
            sync_summary(gid)

        # One payload goes to every socket, so it holds public matches only.
        payload = WebSocketLobbyUpdate(games=public_summaries()).model_dump(mode="json")
        dead: list[WebSocket] = []
        for ws in list(self.lobby_connections):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)

        for ws in dead:
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
