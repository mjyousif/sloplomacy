"""Helpers for the persistence tests: a fake Supabase table, players, and restarting the container."""

from domain.game_state import GameState, MultiplayerGameSummary
from domain.press import PressMessage
from fastapi.testclient import TestClient
from main import app
from storage.store import (
    GAME_HISTORY,
    GAME_PASSCODES,
    GAME_PRESS,
    GAME_SUMMARIES,
    GAMES,
)
from storage.supabase import (
    SupabaseUnavailable,
)

client = TestClient(app)


class FakeSupabase:
    """Stands in for Supabase behind storage.supabase, holding each game as a serialized row."""

    def __init__(self):
        self.rows = {}
        self.reads_fail = False
        self.writes_fail = False
        self.saved_history = []  # Whether each save carried the rollback history
        self.press = {}  # The press column, by game id

    def _require_reads(self):
        if self.reads_fail:
            raise SupabaseUnavailable("HTTP 503 upstream unavailable")

    async def save(self, game_id, state, summary=None, history=None, passcode=None, client=None):
        if self.writes_fail:
            return False
        self.saved_history.append(history is not None)
        kept_history = self.rows.get(game_id, {}).get("history", [])
        self.rows[game_id] = {
            "state": state.model_dump(mode="json"),
            "summary": summary.model_dump(mode="json") if summary else None,
            "history": kept_history
            if history is None
            else [h.model_dump(mode="json") for h in history],
            "passcode": passcode,
        }
        return True

    async def load(self, game_id, client=None):
        self._require_reads()
        row = self.rows.get(game_id)
        if row is None:
            return None
        return (
            GameState.model_validate(row["state"]),
            MultiplayerGameSummary.model_validate(row["summary"]),
            [GameState.model_validate(h) for h in row["history"]],
            row["passcode"],
        )

    async def load_all(self, client=None):
        self._require_reads()
        return {
            gid: MultiplayerGameSummary.model_validate(row["summary"])
            for gid, row in self.rows.items()
        }

    async def delete(self, game_id, client=None):
        self.rows.pop(game_id, None)
        self.press.pop(game_id, None)
        return True

    async def load_press(self, game_id, client=None):
        self._require_reads()
        return [PressMessage.model_validate(m) for m in self.press.get(game_id, [])]

    async def save_press(self, game_id, messages, client=None):
        # Like the real update, it changes nothing when the game has no row yet.
        if self.writes_fail or game_id not in self.rows:
            return False
        self.press[game_id] = [m.model_dump(mode="json") for m in messages]
        return True


HOST = {"user_id": "host", "email": "host@test.com", "display_name": "Host"}


BOB = {"user_id": "bob", "email": "bob@test.com", "display_name": "Bob"}


CAL = {"user_id": "cal", "email": "cal@test.com", "display_name": "Cal"}


ARMY_PARIS_TO_BURGUNDY = {
    "unit_id": "FRA_A_PAR",
    "power": "FRANCE",
    "unit_type": "A",
    "origin": "PAR",
    "order_type": "MOVE",
    "target": "BUR",
    "is_explicit": True,
}


def _create_game(power="FRANCE"):
    res = client.post("/api/games", json={"name": "Friends", "creator_power": power, **HOST})
    assert res.status_code == 200
    return res.json()["game_id"]


def _join(game_id, power, player):
    """Claim a seat the way the client does: it refreshes the lobby straight after joining."""
    res = client.post(f"/api/games/{game_id}/join", json={"power": power, **player})
    assert res.status_code == 200
    assert client.get("/api/games").status_code == 200


def _restart_container(game_id):
    """Wipe what a Cloud Run instance held in memory, as scaling to zero does."""
    GAMES.pop(game_id, None)
    GAME_SUMMARIES.pop(game_id, None)
    GAME_HISTORY.pop(game_id, None)
    GAME_PASSCODES.pop(game_id, None)
    GAME_PRESS.pop(game_id, None)


def _resolve_turn(game_id):
    for power in ("FRANCE", "GERMANY"):
        client.post(f"/api/finalize?game_id={game_id}", json={"power": power, "force": True})


def _rollback_headers():
    import os

    import jwt

    secret = os.getenv("SUPABASE_JWT_SECRET", "k" * 32)
    return {
        "Authorization": "Bearer "
        + jwt.encode(
            {"sub": HOST["user_id"], "email": HOST["email"], "aud": "authenticated"},
            secret,
            algorithm="HS256",
        )
    }
