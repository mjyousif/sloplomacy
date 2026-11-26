"""Normalized press persistence: reading threads/messages, incremental saves, and cap."""

import asyncio
import os
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from domain.board import Power
from domain.press import PressMessage
from storage import press as press_storage
from storage.press import (
    add_press,
    clear_press_tracking,
    load_press_from_db,
    next_press_seq,
    save_press_to_db,
)
from storage.store import GAME_PRESS
from storage.supabase import GAME_DB_IDS, SupabaseUnavailable

ENV = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
DB_UUID = "dddddddd-dddd-dddd-dddd-dddddddddddd"


def message(
    seq: int,
    *,
    sender: Power = Power.FRANCE,
    recipients: list[Power] | None = None,
    anonymous: bool = False,
) -> PressMessage:
    return PressMessage(
        id=f"m{seq}",
        seq=seq,
        sender=sender,
        recipients=recipients or [],
        anonymous=anonymous,
        body=f"message {seq}",
        sent_at="2026-11-13T00:00:00+00:00",
        season="Spring",
        year=1901,
        phase="Movement",
    )


def _db_row(msg: PressMessage) -> dict:
    t_type = "public" if not msg.recipients else ("direct" if len(msg.recipients) == 1 else "group")
    members = (
        []
        if t_type == "public"
        else [
            {"power": p.value} for p in sorted({msg.sender, *msg.recipients}, key=lambda p: p.value)
        ]
    )
    return {
        "id": f"00000000-0000-0000-0000-00000000000{msg.seq}",
        "seq": msg.seq,
        "sender_power": msg.sender.value,
        "is_anonymous": msg.anonymous,
        "year": msg.year,
        "season": msg.season,
        "phase": msg.phase,
        "body": msg.body,
        "sent_at": msg.sent_at,
        "meta": {},
        "press_threads": {"thread_type": t_type, "press_thread_members": members},
    }


def client_answering(method: str, *responses: httpx.Response) -> AsyncMock:
    client = AsyncMock(spec=httpx.AsyncClient)
    if len(responses) == 1:
        getattr(client, method).return_value = responses[0]
    else:
        getattr(client, method).side_effect = list(responses)
    return client


def run(coro):
    with patch.dict(os.environ, ENV):
        return asyncio.run(coro)


def test_load_reads_normalized_press_and_skips_broken_messages():
    GAME_DB_IDS["room_1"] = DB_UUID
    clear_press_tracking("room_1")
    GAME_DB_IDS["room_1"] = DB_UUID
    try:
        rows = [
            _db_row(message(1)),
            _db_row(message(2, recipients=[Power.ENGLAND], anonymous=True)),
            {"body": "no sender"},
        ]
        client = client_answering("get", httpx.Response(200, json=rows))
        loaded = run(load_press_from_db("room_1", client=client))
        assert [m.seq for m in loaded] == [1, 2]
        assert loaded[1].recipients == [Power.ENGLAND]
        assert loaded[1].anonymous is True
        url = client.get.call_args.args[0]
        assert "/rest/v1/press_messages" in url
        assert f"game_id=eq.{DB_UUID}" in url
        assert "press_threads(thread_type,press_thread_members(power))" in url
    finally:
        GAME_DB_IDS.pop("room_1", None)
        clear_press_tracking("room_1")


def test_load_answers_empty_for_missing_game_or_no_messages():
    GAME_DB_IDS.pop("x", None)
    clear_press_tracking("x")
    try:
        missing_game = client_answering("get", httpx.Response(200, json=[]))
        assert run(load_press_from_db("x", client=missing_game)) == []

        GAME_DB_IDS["x"] = DB_UUID
        empty_msgs = client_answering("get", httpx.Response(200, json=[]))
        assert run(load_press_from_db("x", client=empty_msgs)) == []
    finally:
        GAME_DB_IDS.pop("x", None)
        clear_press_tracking("x")


def test_a_failed_read_raises_rather_than_answering_empty():
    GAME_DB_IDS["x"] = DB_UUID
    try:
        with pytest.raises(SupabaseUnavailable):
            run(
                load_press_from_db(
                    "x", client=client_answering("get", httpx.Response(503, text="down"))
                )
            )
        unreachable = AsyncMock(spec=httpx.AsyncClient)
        unreachable.get.side_effect = httpx.ConnectError("no route")
        with pytest.raises(SupabaseUnavailable):
            run(load_press_from_db("x", client=unreachable))
    finally:
        GAME_DB_IDS.pop("x", None)


def test_save_incrementally_persists_threads_members_and_new_messages():
    GAME_DB_IDS["room_1"] = DB_UUID
    clear_press_tracking("room_1")
    try:
        m1 = message(1, recipients=[Power.ENGLAND, Power.GERMANY], anonymous=True)
        m2 = message(2, recipients=[Power.ENGLAND, Power.GERMANY])
        thread_uuid = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
        client = client_answering(
            "post",
            httpx.Response(201, json=[{"id": thread_uuid, "thread_key": "ENGLAND_FRANCE_GERMANY"}]),
            httpx.Response(201),
            httpx.Response(201),
            httpx.Response(201),
        )
        assert run(save_press_to_db("room_1", [m1], client=client)) is True
        assert client.post.call_count == 3
        assert "/rest/v1/press_threads" in client.post.call_args_list[0].args[0]
        assert "/rest/v1/press_thread_members" in client.post.call_args_list[1].args[0]
        assert "/rest/v1/press_messages" in client.post.call_args_list[2].args[0]
        msg_row = client.post.call_args_list[2].kwargs["json"][0]
        assert msg_row["seq"] == 1
        assert msg_row["is_anonymous"] is True

        # Re-saving the same list is a no-op; appending m2 reuses the cached thread_id.
        assert run(save_press_to_db("room_1", [m1], client=client)) is True
        assert client.post.call_count == 3
        assert run(save_press_to_db("room_1", [m1, m2], client=client)) is True
        assert client.post.call_count == 4
        assert "/rest/v1/press_messages" in client.post.call_args_list[3].args[0]
        assert client.post.call_args_list[3].kwargs["json"][0]["seq"] == 2
    finally:
        GAME_DB_IDS.pop("room_1", None)
        clear_press_tracking("room_1")


def test_save_reports_failure_when_game_missing_or_supabase_refuses():
    GAME_DB_IDS.pop("room_1", None)
    clear_press_tracking("room_1")
    try:
        no_game = AsyncMock(spec=httpx.AsyncClient)
        no_game.get.return_value = httpx.Response(200, json=[])
        assert run(save_press_to_db("room_1", [message(1)], client=no_game)) is False

        GAME_DB_IDS["room_1"] = DB_UUID
        refused = client_answering("post", httpx.Response(500, text="boom"))
        assert run(save_press_to_db("room_1", [message(1)], client=refused)) is False
    finally:
        GAME_DB_IDS.pop("room_1", None)
        clear_press_tracking("room_1")


def test_the_oldest_messages_are_dropped_past_the_cap(monkeypatch):
    monkeypatch.setattr(press_storage, "MAX_PRESS_MESSAGES", 3)
    GAME_PRESS.pop("cap_test", None)
    try:
        for seq in range(1, 6):
            add_press("cap_test", message(seq))
        assert [m.seq for m in GAME_PRESS["cap_test"]] == [3, 4, 5]
        # Numbering never restarts, so a client's "after" keeps working.
        assert next_press_seq("cap_test") == 6
    finally:
        GAME_PRESS.pop("cap_test", None)
