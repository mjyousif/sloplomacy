"""The press column: reading it, writing it, and capping how much a game keeps."""

import asyncio
import os
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from domain.board import Power
from domain.press import PressMessage
from storage import press as press_storage
from storage.press import add_press, load_press_from_db, next_press_seq, save_press_to_db
from storage.store import GAME_PRESS
from storage.supabase import SupabaseUnavailable

ENV = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}


def message(seq: int) -> PressMessage:
    return PressMessage(
        id=f"m{seq}",
        seq=seq,
        sender=Power.FRANCE,
        body=f"message {seq}",
        sent_at="2026-11-13T00:00:00+00:00",
        season="Spring",
        year=1901,
        phase="Movement",
    )


def client_answering(method: str, response: httpx.Response) -> AsyncMock:
    client = AsyncMock(spec=httpx.AsyncClient)
    getattr(client, method).return_value = response
    return client


def run(coro):
    with patch.dict(os.environ, ENV):
        return asyncio.run(coro)


def test_load_reads_the_press_column_and_skips_broken_messages():
    row = {"press": [message(1).model_dump(mode="json"), {"body": "no sender"}]}
    client = client_answering("get", httpx.Response(200, json=[row]))
    loaded = run(load_press_from_db("room_1", client=client))
    assert [m.seq for m in loaded] == [1]
    assert "select=press" in client.get.call_args.args[0]
    assert "room_code=eq.room_1" in client.get.call_args.args[0]


def test_load_answers_empty_for_a_game_with_no_row_or_no_column():
    assert (
        run(load_press_from_db("x", client=client_answering("get", httpx.Response(200, json=[]))))
        == []
    )
    missing_column = httpx.Response(400, json={"code": "42703"})
    assert run(load_press_from_db("x", client=client_answering("get", missing_column))) == []


def test_a_failed_read_raises_rather_than_answering_empty():
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


def test_save_writes_only_the_press_column():
    client = client_answering("patch", httpx.Response(200, json=[{"room_code": "room_1"}]))
    assert run(save_press_to_db("room_1", [message(1)], client=client)) is True
    assert list(client.patch.call_args.kwargs["json"]) == ["press"]


def test_save_reports_failure_when_no_row_was_updated_or_supabase_refuses():
    no_row = client_answering("patch", httpx.Response(200, json=[]))
    assert run(save_press_to_db("room_1", [message(1)], client=no_row)) is False
    refused = client_answering("patch", httpx.Response(500, text="boom"))
    assert run(save_press_to_db("room_1", [message(1)], client=refused)) is False


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
