"""Helpers for the persistence tests: normalized FakeSupabase, players, and container restarts."""

import uuid
from datetime import datetime, timezone

from domain.game_state import GameState, MultiplayerGameSummary, TurnHistoryEntry
from domain.press import PressMessage
from fastapi.testclient import TestClient
from main import app
from storage.phases import deserialize_phase_row, serialize_phase_payload
from storage.press import thread_identity
from storage.store import evict_game
from storage.supabase import SupabaseUnavailable
from storage.supabase_codec import (
    LoadedGame,
    game_type_from_summary,
    serialize_participant_for_rpc,
    to_db_status,
)

client = TestClient(app)


class FakeSupabase:
    """In-memory stand-in matching the normalized Postgres tables and RPC semantics."""

    def __init__(self):
        self.rows: dict[str, dict] = {}
        self.participants: dict[str, list[dict]] = {}
        self.phases: dict[str, dict[int, dict]] = {}
        self.press_threads: dict[str, dict[str, dict]] = {}
        self.press: dict[str, list[dict]] = {}
        self.db_ids: dict[str, str] = {}
        self.reads_fail = False
        self.writes_fail = False
        self.saved_phase_batches: list[list[int]] = []
        self.deleted_phases_from: list[int] = []
        self.save_calls: list[dict] = []

    def _require_reads(self):
        if self.reads_fail:
            raise SupabaseUnavailable("HTTP 503 upstream unavailable")

    def active_participants(self, game_id: str) -> dict[str, dict]:
        return {
            r["power"]: r for r in self.participants.get(game_id, []) if r.get("left_at") is None
        }

    def _sync_participants(
        self,
        game_id: str,
        db_id: str,
        summary: MultiplayerGameSummary,
        state: GameState,
        phase_index: int,
    ) -> None:
        now_iso = datetime.now(timezone.utc).isoformat()
        rows = self.participants.setdefault(game_id, [])
        desired = summary.participants
        finalized = set(state.finalized_powers)
        surrendered = set(state.surrendered_powers)

        for r in rows:
            if r["left_at"] is None and r["power"] not in desired:
                r["left_at"] = now_iso
                r["left_phase_index"] = phase_index
                r["is_finalized"] = False
                if r["surrendered"] or r["power"] in surrendered:
                    r["surrendered"] = True
                    r["surrendered_at"] = r["surrendered_at"] or now_iso

        for power_key, part in desired.items():
            seat = serialize_participant_for_rpc(part, is_finalized=part.power in finalized)
            active = next(
                (r for r in rows if r["left_at"] is None and r["power"] == power_key),
                None,
            )
            if active is not None and (
                active.get("user_id") != seat["user_id"]
                or active.get("guest_id") != seat["guest_id"]
            ):
                active["left_at"] = now_iso
                active["left_phase_index"] = phase_index
                active = None

            is_surr = bool(seat["surrendered"] or part.power in surrendered)
            if active is None:
                rows.append(
                    {
                        "id": str(uuid.uuid4()),
                        "game_id": db_id,
                        "power": power_key,
                        "user_id": seat["user_id"],
                        "guest_id": seat["guest_id"],
                        "guest_display_name": seat["guest_display_name"],
                        "joined_at": seat["joined_at"],
                        "joined_phase_index": phase_index,
                        "left_at": None,
                        "left_phase_index": None,
                        "surrendered": is_surr,
                        "surrendered_at": seat["surrendered_at"] or (now_iso if is_surr else None),
                        "game_over_seen_at": seat["game_over_seen_at"],
                        "is_finalized": bool(seat["is_finalized"]),
                    }
                )
            else:
                active["surrendered"] = is_surr
                active["surrendered_at"] = seat["surrendered_at"] or active["surrendered_at"]
                active["game_over_seen_at"] = seat["game_over_seen_at"]
                active["is_finalized"] = bool(seat["is_finalized"])
                active["guest_display_name"] = seat["guest_display_name"]

    async def resolve_db_id(self, game_id: str, client=None):
        self._require_reads()
        return self.db_ids.get(game_id)

    async def save(
        self,
        game_id,
        state,
        summary=None,
        history=None,
        passcode=None,
        *,
        current_phase_index=None,
        sync_participants=True,
        client=None,
    ):
        del history
        if self.writes_fail:
            return False
        db_id = self.db_ids.setdefault(game_id, str(uuid.uuid4()))
        prev = self.rows.get(game_id, {})
        phase_idx = (
            max(0, int(current_phase_index))
            if current_phase_index is not None
            else int(prev.get("current_phase_index", 0))
        )
        gt = game_type_from_summary(summary) if summary else prev.get("game_type", "PUBLIC")
        self.save_calls.append(
            {
                "game_id": game_id,
                "current_phase_index": phase_idx,
                "sync_participants": sync_participants,
            }
        )
        self.rows[game_id] = {
            "id": db_id,
            "room_code": game_id,
            "name": (summary.name if summary else prev.get("name", game_id)),
            "game_type": gt,
            "status": to_db_status(summary.status if summary else "waiting"),
            "scenario_id": state.scenario_id,
            "phase": state.phase,
            "season": state.season,
            "year": state.year,
            "current_phase_index": phase_idx,
            "state_revision": state.state_revision,
            "game_state": state.model_dump(mode="json"),
            "passcode": passcode,
            "summary": summary.model_dump(mode="json") if summary else prev.get("summary"),
            "has_passcode": bool(passcode),
        }
        if sync_participants and summary is not None:
            self._sync_participants(game_id, db_id, summary, state, phase_idx)
        return True

    async def load(self, game_id, client=None):
        self._require_reads()
        row = self.rows.get(game_id)
        if row is None:
            return None
        state = GameState.model_validate(row["game_state"])
        summary = MultiplayerGameSummary.model_validate(row["summary"])
        legacy_raw = row.get("legacy_history")
        legacy_hist = (
            [GameState.model_validate(h) for h in legacy_raw]
            if isinstance(legacy_raw, list) and legacy_raw
            else None
        )
        phase_count = (
            len(legacy_hist) if legacy_hist is not None else int(row.get("current_phase_index", 0))
        )
        return LoadedGame(
            state=state,
            summary=summary,
            history=legacy_hist,
            passcode=row.get("passcode"),
            phase_count=phase_count,
            db_id=row["id"],
        )

    async def load_all(self, client=None):
        self._require_reads()
        return {
            gid: MultiplayerGameSummary.model_validate(row["summary"])
            for gid, row in self.rows.items()
        }

    async def delete(self, game_id, client=None):
        self.rows.pop(game_id, None)
        self.participants.pop(game_id, None)
        self.phases.pop(game_id, None)
        self.press_threads.pop(game_id, None)
        self.press.pop(game_id, None)
        self.db_ids.pop(game_id, None)
        return True

    async def load_phase_entries(self, game_id, *, db_id=None, client=None):
        del db_id
        self._require_reads()
        game_phases = self.phases.get(game_id, {})
        return [
            TurnHistoryEntry(
                index=idx,
                season=row["season"],
                year=row["year"],
                phase=row["phase"],
            )
            for idx, row in sorted(game_phases.items())
        ]

    async def load_phase(self, game_id, phase_index, *, db_id=None, client=None):
        del db_id
        self._require_reads()
        row = self.phases.get(game_id, {}).get(int(phase_index))
        if row is None:
            return None
        return deserialize_phase_row(row, game_id)

    async def load_all_phases(self, game_id, *, db_id=None, client=None):
        del db_id
        self._require_reads()
        game_phases = self.phases.get(game_id, {})
        return [deserialize_phase_row(row, game_id) for _idx, row in sorted(game_phases.items())]

    async def upsert_phases(self, game_id, phases_by_index, *, db_id=None, client=None):
        del db_id
        if self.writes_fail or game_id not in self.rows:
            return False
        bucket = self.phases.setdefault(game_id, {})
        batch: list[int] = []
        for idx, snap in sorted(phases_by_index.items()):
            bucket[int(idx)] = {
                "phase_index": int(idx),
                "year": int(snap.year),
                "season": snap.season,
                "phase": snap.phase,
                "state_revision": int(snap.state_revision),
                "payload": serialize_phase_payload(snap),
            }
            batch.append(int(idx))
        self.saved_phase_batches.append(batch)
        return True

    async def delete_phases(self, game_id, from_index, *, db_id=None, client=None):
        del db_id
        if self.writes_fail or game_id not in self.rows:
            return False
        bucket = self.phases.get(game_id, {})
        idx = max(0, int(from_index))
        for k in [k for k in bucket if k >= idx]:
            del bucket[k]
        self.deleted_phases_from.append(idx)
        return True

    async def load_press(self, game_id, client=None):
        self._require_reads()
        return [PressMessage.model_validate(m) for m in self.press.get(game_id, [])]

    async def save_press(self, game_id, messages, client=None):
        if self.writes_fail or game_id not in self.rows:
            return False
        threads = self.press_threads.setdefault(game_id, {})
        stored_seqs = {m["seq"] for m in self.press.get(game_id, [])}
        bucket = self.press.setdefault(game_id, [])
        for m in messages:
            if m.seq in stored_seqs:
                continue
            t_key, t_type, members = thread_identity(m.sender, m.recipients)
            if t_key not in threads:
                threads[t_key] = {
                    "id": str(uuid.uuid4()),
                    "thread_key": t_key,
                    "thread_type": t_type,
                    "members": [p.value for p in members],
                }
            row = m.model_dump(mode="json")
            row["thread_id"] = threads[t_key]["id"]
            row["thread_key"] = t_key
            bucket.append(row)
            stored_seqs.add(m.seq)
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
    evict_game(game_id)


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
