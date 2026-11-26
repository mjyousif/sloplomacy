"""Normalized press (chat) persistence in `press_threads`, `press_thread_members`, and `press_messages`.

Press lives in `GAME_PRESS`, not in `GameState`, and is saved independently of `multiplayer_games`
so a press save never overwrites the live board and a turn save never clobbers chat messages.
"""

import logging
import time
import uuid
from typing import Any
from urllib.parse import quote

import httpx
from domain.board import Power
from domain.ids import DEFAULT_GAME_ID
from domain.orders import Order
from domain.press import PressMessage, number_messages
from storage import supabase
from storage.supabase import SupabaseUnavailable
from telemetry import record_supabase_query

logger = logging.getLogger("diplomacy.server")

# Retained only as a high-water cap on very large press feeds in RAM.
MAX_PRESS_MESSAGES = 2000

# Press (chat) per game, oldest first (re-exported by storage.store).
GAME_PRESS: dict[str, list[PressMessage]] = {}
PRESS_UNSAVED: set[str] = set()

_PRESS_SAVES_RUNNING: dict[str, bool] = {}
_PERSISTED_PRESS_SEQ: dict[str, int] = {}
_PERSISTED_THREAD_IDS: dict[str, dict[str, str]] = {}


def clear_press_tracking(game_id: str) -> None:
    """Clear in-memory press messages and incremental persistence watermarks for `game_id`."""
    GAME_PRESS.pop(game_id, None)
    PRESS_UNSAVED.discard(game_id)
    _PERSISTED_PRESS_SEQ.pop(game_id, None)
    _PERSISTED_THREAD_IDS.pop(game_id, None)


def _is_saved_game(game_id: str) -> bool:
    return (
        supabase.is_persistence_enabled()
        and game_id != DEFAULT_GAME_ID
        and not game_id.startswith("sbx_")
        and supabase.is_valid_room_code(game_id)
    )


def thread_identity(sender: Power, recipients: list[Power]) -> tuple[str, str, list[Power]]:
    """Return `(thread_key, thread_type, sorted_members)` for a press message."""
    distinct_recips = sorted({p for p in recipients if p != sender}, key=lambda p: p.value)
    if not distinct_recips:
        return ("public", "public", [])
    members = sorted({sender, *distinct_recips}, key=lambda p: p.value)
    thread_key = "_".join(p.value for p in members)
    thread_type = "direct" if len(members) <= 2 else "group"
    return (thread_key, thread_type, members)


def _message_from_db_row(row: dict[str, Any]) -> PressMessage:
    sender = Power(row["sender_power"])
    thread_info = row.get("press_threads") or {}
    thread_type = str(thread_info.get("thread_type") or "public")
    members_raw = thread_info.get("press_thread_members") or []
    if thread_type == "public":
        recipients: list[Power] = []
    else:
        recipients = sorted(
            {
                Power(m["power"])
                for m in members_raw
                if m.get("power") and Power(m["power"]) != sender
            },
            key=lambda p: p.value,
        )

    meta = row.get("meta") if isinstance(row.get("meta"), dict) else {}
    raw_orders = meta.get("orders") or []
    orders = [Order.model_validate(o) for o in raw_orders] if isinstance(raw_orders, list) else []
    raw_numbers = meta.get("numbers") or {}
    numbers = (
        {Power(k): int(v) for k, v in raw_numbers.items()} if isinstance(raw_numbers, dict) else {}
    )
    public_number = int(meta.get("public_number") or 0)

    return PressMessage(
        id=str(row["id"]),
        seq=int(row["seq"]),
        numbers=numbers,
        public_number=public_number,
        sender=sender,
        anonymous=bool(row.get("is_anonymous", False)),
        recipients=recipients,
        body=str(row.get("body") or ""),
        sent_at=str(row["sent_at"]),
        season=str(row["season"]),
        year=int(row["year"]),
        phase=str(row["phase"]),
        orders=orders,
    )


async def load_press_from_db(
    game_id: str, client: httpx.AsyncClient | None = None
) -> list[PressMessage]:
    """Load saved press for `game_id`, oldest first. Raise SupabaseUnavailable on read failure."""
    db_id = await supabase.resolve_game_db_id(game_id, client=client)
    if not db_id:
        return []

    url = (
        f"{supabase.get_supabase_url()}/rest/v1/press_messages"
        f"?game_id=eq.{quote(db_id, safe='')}"
        f"&select=id,seq,sender_power,is_anonymous,year,season,phase,body,sent_at,meta,"
        f"press_threads(thread_type,press_thread_members(power))"
        f"&order=seq.asc"
    )
    headers = supabase.get_headers()
    start_time = time.perf_counter()
    try:
        c = client or supabase.get_http_client()
        resp = await c.get(url, headers=headers, timeout=10.0)
    except Exception as ex:
        record_supabase_query("load_press", "error", 0, (time.perf_counter() - start_time) * 1000.0)
        raise SupabaseUnavailable(str(ex)) from ex

    elapsed_ms = (time.perf_counter() - start_time) * 1000.0
    if resp.status_code != 200:
        record_supabase_query("load_press", "error", resp.status_code, elapsed_ms)
        raise SupabaseUnavailable(f"HTTP {resp.status_code} {resp.text}")
    rows = resp.json()
    if not isinstance(rows, list):
        record_supabase_query("load_press", "error", resp.status_code, elapsed_ms)
        raise SupabaseUnavailable(f"Unexpected response: {rows!r}")

    messages: list[PressMessage] = []
    for raw in rows:
        try:
            messages.append(_message_from_db_row(raw))
        except Exception as ex:
            logger.debug("Skipping unparseable press message for %s: %s", game_id, ex)
    if messages:
        _PERSISTED_PRESS_SEQ[game_id] = max(m.seq for m in messages)
    record_supabase_query("load_press", "ok", resp.status_code, elapsed_ms)
    return messages


async def _ensure_thread_ids(
    game_id: str,
    db_id: str,
    unsaved: list[PressMessage],
    client: httpx.AsyncClient,
) -> dict[str, str] | None:
    """Upsert any new press threads and members, returning `thread_key -> thread_uuid`."""
    cached = _PERSISTED_THREAD_IDS.setdefault(game_id, {})
    needed: dict[str, tuple[str, list[Power], str]] = {}
    for msg in unsaved:
        t_key, t_type, members = thread_identity(msg.sender, msg.recipients)
        if t_key not in cached and t_key not in needed:
            needed[t_key] = (t_type, members, msg.sent_at)

    if not needed:
        return cached

    base = supabase.get_supabase_url()
    headers = {
        **supabase.get_headers(),
        "Prefer": "resolution=merge-duplicates,return=representation",
    }
    thread_rows = [
        {
            "game_id": db_id,
            "thread_key": t_key,
            "thread_type": t_type,
            "created_at": sent_at,
        }
        for t_key, (t_type, _members, sent_at) in needed.items()
    ]
    resp = await client.post(
        f"{base}/rest/v1/press_threads?on_conflict=game_id,thread_key&select=id,thread_key",
        headers=headers,
        json=thread_rows,
        timeout=10.0,
    )
    if resp.status_code not in (200, 201):
        logger.warning(
            "Supabase press_threads upsert failed for '%s': HTTP %d %s",
            game_id,
            resp.status_code,
            resp.text,
        )
        return None

    for tr in resp.json():
        if tr.get("thread_key") and tr.get("id"):
            cached[str(tr["thread_key"])] = str(tr["id"])

    member_rows = [
        {"thread_id": cached[t_key], "power": p.value, "joined_at": sent_at}
        for t_key, (_t_type, members, sent_at) in needed.items()
        if t_key in cached
        for p in members
    ]
    if member_rows:
        m_headers = {
            **supabase.get_headers(),
            "Prefer": "resolution=ignore-duplicates,return=minimal",
        }
        m_resp = await client.post(
            f"{base}/rest/v1/press_thread_members?on_conflict=thread_id,power",
            headers=m_headers,
            json=member_rows,
            timeout=10.0,
        )
        if m_resp.status_code not in (200, 201, 204):
            logger.warning(
                "Supabase press_thread_members upsert failed for '%s': HTTP %d %s",
                game_id,
                m_resp.status_code,
                m_resp.text,
            )
            return None

    return cached


def _canonical_uuid(raw_id: str) -> str:
    try:
        return str(uuid.UUID(raw_id))
    except (ValueError, AttributeError):
        return str(uuid.uuid5(uuid.NAMESPACE_OID, raw_id))


async def save_press_to_db(
    game_id: str, messages: list[PressMessage], client: httpx.AsyncClient | None = None
) -> bool:
    """Incrementally append unsaved press messages to `press_threads`/`press_messages`."""
    try:
        db_id = await supabase.resolve_game_db_id(game_id, client=client)
    except SupabaseUnavailable:
        return False
    if not db_id:
        return False

    persisted_seq = _PERSISTED_PRESS_SEQ.get(game_id, 0)
    unsaved = [m for m in messages if m.seq > persisted_seq]
    if not unsaved:
        return True

    c = client or supabase.get_http_client()
    start_time = time.perf_counter()
    try:
        thread_ids = await _ensure_thread_ids(game_id, db_id, unsaved, c)
        if thread_ids is None:
            record_supabase_query(
                "save_press", "error", 500, (time.perf_counter() - start_time) * 1000.0
            )
            return False

        msg_rows: list[dict[str, Any]] = []
        for m in unsaved:
            t_key, _, _ = thread_identity(m.sender, m.recipients)
            t_id = thread_ids.get(t_key)
            if not t_id:
                return False
            meta: dict[str, Any] = {}
            if m.orders:
                meta["orders"] = [o.model_dump(mode="json") for o in m.orders]
            if m.numbers:
                meta["numbers"] = {p.value: n for p, n in m.numbers.items()}
            if m.public_number > 0:
                meta["public_number"] = m.public_number
            msg_rows.append(
                {
                    "id": _canonical_uuid(m.id),
                    "game_id": db_id,
                    "thread_id": t_id,
                    "seq": int(m.seq),
                    "sender_power": m.sender.value,
                    "is_anonymous": bool(m.anonymous),
                    "year": int(m.year),
                    "season": m.season,
                    "phase": m.phase,
                    "body": m.body,
                    "sent_at": m.sent_at,
                    "meta": meta,
                }
            )

        headers = {**supabase.get_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"}
        url = f"{supabase.get_supabase_url()}/rest/v1/press_messages?on_conflict=id"
        resp = await c.post(url, headers=headers, json=msg_rows, timeout=10.0)
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        if resp.status_code not in (200, 201, 204):
            record_supabase_query("save_press", "error", resp.status_code, elapsed_ms)
            logger.warning(
                "Supabase press save failed for '%s': HTTP %d %s",
                game_id,
                resp.status_code,
                resp.text,
            )
            return False
        _PERSISTED_PRESS_SEQ[game_id] = max(persisted_seq, max(m.seq for m in unsaved))
        record_supabase_query("save_press", "ok", resp.status_code, elapsed_ms)
        return True
    except Exception as ex:
        record_supabase_query("save_press", "error", 0, (time.perf_counter() - start_time) * 1000.0)
        logger.warning("Supabase exception saving press for '%s': %s", game_id, ex)
        return False


async def press_of(game_id: str) -> list[PressMessage]:
    """The live list of a loaded game's press, read from Supabase the first time it is asked for."""
    if game_id not in GAME_PRESS:
        saved = await load_press_from_db(game_id) if _is_saved_game(game_id) else []
        saved.sort(key=lambda m: m.seq)
        number_messages(saved)
        GAME_PRESS.setdefault(game_id, saved)
        if saved and game_id not in _PERSISTED_PRESS_SEQ:
            _PERSISTED_PRESS_SEQ[game_id] = max(m.seq for m in saved)
    return GAME_PRESS[game_id]


def add_press(game_id: str, message: PressMessage) -> None:
    """Append to a game's press, numbered in each reader's feed."""
    messages = GAME_PRESS.setdefault(game_id, [])
    messages.append(message)
    number_messages(messages)
    if len(messages) > MAX_PRESS_MESSAGES:
        del messages[: len(messages) - MAX_PRESS_MESSAGES]


def next_press_seq(game_id: str) -> int:
    messages = GAME_PRESS.get(game_id) or []
    return messages[-1].seq + 1 if messages else 1


async def persist_press(game_id: str) -> None:
    """Save a game's press incrementally. A failed save is retried by the next one."""
    from storage.store import GAMES, PRIVATE_SANDBOXES, UNSAVED_GAMES, persist_game

    if not _is_saved_game(game_id) or game_id in PRIVATE_SANDBOXES or game_id not in GAMES:
        return
    PRESS_UNSAVED.add(game_id)
    if game_id in _PRESS_SAVES_RUNNING:
        _PRESS_SAVES_RUNNING[game_id] = True
        return

    saved = False
    try:
        repeat = True
        while repeat:
            _PRESS_SAVES_RUNNING[game_id] = False
            if game_id in UNSAVED_GAMES:
                # Ensure the parent multiplayer_games row exists before inserting press rows.
                await persist_game(game_id)
            messages = GAME_PRESS.get(game_id)
            if messages is None:
                return
            saved = await save_press_to_db(game_id, list(messages))
            repeat = _PRESS_SAVES_RUNNING[game_id]
    finally:
        _PRESS_SAVES_RUNNING.pop(game_id, None)
    if saved:
        PRESS_UNSAVED.discard(game_id)
