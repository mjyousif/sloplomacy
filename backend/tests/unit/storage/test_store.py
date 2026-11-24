"""Unit tests for shared store helpers: resolve_game_with_summary, delete_game_everywhere, is_private_sandbox."""

import asyncio
from unittest.mock import AsyncMock

import pytest
from domain.board import Power
from domain.game_state import MultiplayerGameSummary
from fastapi import HTTPException
from scenarios.presets import build_scenario
from storage import store, supabase
from storage.store import (
    GAME_SUMMARIES,
    GAMES,
    PRIVATE_SANDBOXES,
    delete_game_everywhere,
    is_private_sandbox,
    resolve_game_with_summary,
)


def test_is_private_sandbox_recognizes_prefix_and_registry(monkeypatch):
    monkeypatch.setitem(PRIVATE_SANDBOXES, "custom_copy", ("mp_1", Power.FRANCE))
    assert is_private_sandbox("sbx_12345678") is True
    assert is_private_sandbox("custom_copy") is True
    assert is_private_sandbox("mp_123456") is False
    assert is_private_sandbox(None) is False
    assert is_private_sandbox("") is False


def test_resolve_game_with_summary_returns_pair_or_404(monkeypatch):
    gid = "mp_store_helper"
    game = build_scenario("standard_1901", Power.FRANCE, gid)
    summary = MultiplayerGameSummary(
        game_id=gid,
        name="Helper Test",
        created_at="2026-11-13T00:00:00Z",
    )
    monkeypatch.setitem(GAMES, gid, game)
    monkeypatch.setitem(GAME_SUMMARIES, gid, summary)

    resolved_game, resolved_summary = asyncio.run(resolve_game_with_summary(gid))
    assert resolved_game is game
    assert resolved_summary is summary

    monkeypatch.delitem(GAME_SUMMARIES, gid)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(resolve_game_with_summary(gid))
    assert exc.value.status_code == 404


def test_delete_game_everywhere_evicts_memory_and_deletes_db(monkeypatch):
    gid = "mp_delete_everywhere"
    monkeypatch.setitem(GAMES, gid, build_scenario("standard_1901", Power.FRANCE, gid))
    monkeypatch.setitem(
        GAME_SUMMARIES,
        gid,
        MultiplayerGameSummary(game_id=gid, name="Del", created_at="2026-11-13T00:00:00Z"),
    )
    delete_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(supabase, "is_persistence_enabled", lambda: True)
    monkeypatch.setattr(supabase, "delete_game_from_db", delete_mock)

    asyncio.run(delete_game_everywhere(gid))

    assert gid not in store.GAMES
    assert gid not in store.GAME_SUMMARIES
    delete_mock.assert_awaited_once_with(gid)
