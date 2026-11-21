"""Unit tests for centralized UUID-based profile resolution (`storage.profiles`)."""

import asyncio
from unittest.mock import AsyncMock, patch

from domain.board import Power
from domain.game_state import AdminActionLogEntry, GameParticipant, MultiplayerGameSummary
from storage import profiles
from storage.profiles import (
    DEFAULT_DISPLAY_NAME,
    PROFILE_NAMES,
    UNKNOWN_HOST_NAME,
    ensure_profile_loaded,
    resolve_actor_name,
    resolve_display_name,
    resolve_host_name,
    resolve_participant_name,
    sanitize_public_name,
)


def test_sanitize_public_name_rejects_empty_and_emails():
    assert sanitize_public_name(None) is None
    assert sanitize_public_name("   ") is None
    assert sanitize_public_name("alice@example.com") is None
    assert sanitize_public_name("foo @ bar") is None
    assert sanitize_public_name("11111111-1111-1111-1111-111111111111") is None
    assert sanitize_public_name("  Otto   von  Bismarck ") == "Otto von Bismarck"


def test_resolve_display_name_for_uuid_uses_profile_names_only():
    uid = "11111111-1111-1111-1111-111111111111"
    PROFILE_NAMES.pop(uid, None)
    try:
        # Inline fallback is ignored for registered UUIDs; missing profile -> Envoy.
        assert resolve_display_name(uid, fallback="ClientFallback") == DEFAULT_DISPLAY_NAME

        PROFILE_NAMES[uid] = "alice@example.com"
        assert resolve_display_name(uid, fallback="ClientFallback") == DEFAULT_DISPLAY_NAME

        PROFILE_NAMES[uid] = "Talleyrand"
        assert resolve_display_name(uid, fallback="ClientFallback") == "Talleyrand"
    finally:
        PROFILE_NAMES.pop(uid, None)


def test_resolve_display_name_for_guest_uses_non_email_fallback():
    guest_id = "guest_123"
    PROFILE_NAMES.pop(guest_id, None)
    assert resolve_display_name(guest_id, fallback="GuestEnvoy") == "GuestEnvoy"
    assert resolve_display_name(guest_id, fallback="guest@example.com") == DEFAULT_DISPLAY_NAME
    assert resolve_display_name(guest_id) == DEFAULT_DISPLAY_NAME


def test_resolve_participant_name():
    uid = "22222222-2222-2222-2222-222222222222"
    PROFILE_NAMES[uid] = "Cavour"
    try:
        assert resolve_participant_name(None) == DEFAULT_DISPLAY_NAME
        part = GameParticipant(
            user_id=uid,
            display_name="OldName",
            power=Power.ITALY,
            joined_at="2026-01-01T00:00:00Z",
        )
        assert resolve_participant_name(part) == "Cavour"
    finally:
        PROFILE_NAMES.pop(uid, None)


def test_resolve_host_name_for_uuid_non_uuid_and_legacy():
    uid = "33333333-3333-3333-3333-333333333333"
    PROFILE_NAMES.pop(uid, None)
    try:
        summary_uuid = MultiplayerGameSummary(
            game_id="g1",
            name="Test",
            creator_id=uid,
            created_by="secret@example.com",
            created_at="2026-01-01T00:00:00Z",
        )
        assert resolve_host_name(summary_uuid) == DEFAULT_DISPLAY_NAME
        PROFILE_NAMES[uid] = "Metternich"
        assert resolve_host_name(summary_uuid) == "Metternich"

        summary_bot = MultiplayerGameSummary(
            game_id="g2",
            name="Bot Match",
            creator_id="bot_bismarck",
            created_at="2026-01-01T00:00:00Z",
            participants={
                "GERMANY": GameParticipant(
                    user_id="bot_bismarck",
                    display_name="Otto von B.",
                    power=Power.GERMANY,
                    joined_at="2026-01-01T00:00:00Z",
                )
            },
        )
        assert resolve_host_name(summary_bot) == "Otto von B."

        summary_no_creator = MultiplayerGameSummary(
            game_id="g3",
            name="No Creator",
            creator_id=None,
            created_by="legacy@example.com",
            created_at="2026-01-01T00:00:00Z",
        )
        assert resolve_host_name(summary_no_creator) == UNKNOWN_HOST_NAME
    finally:
        PROFILE_NAMES.pop(uid, None)


def test_resolve_actor_name_resolves_uuid_and_scrubs_legacy_emails():
    uid = "44444444-4444-4444-4444-444444444444"
    PROFILE_NAMES.pop(uid, None)
    try:
        uuid_entry = AdminActionLogEntry(
            id="e1",
            timestamp="2026-01-01T00:00:00Z",
            actor_id=uid,
            actor="stale@example.com",
            season="Spring",
            year=1901,
            phase="Movement",
        )
        assert resolve_actor_name(uuid_entry) == DEFAULT_DISPLAY_NAME
        PROFILE_NAMES[uid] = "Richelieu"
        assert resolve_actor_name(uuid_entry) == "Richelieu"

        legacy_email_entry = AdminActionLogEntry(
            id="e2",
            timestamp="2026-01-01T00:00:00Z",
            actor="alice.secret@example.com",
            season="Spring",
            year=1901,
            phase="Movement",
        )
        assert resolve_actor_name(legacy_email_entry) == DEFAULT_DISPLAY_NAME

        legacy_uuid_actor_entry = AdminActionLogEntry(
            id="e3",
            timestamp="2026-01-01T00:00:00Z",
            actor_id=None,
            actor="11111111-1111-1111-1111-111111111111",
            season="Spring",
            year=1901,
            phase="Movement",
        )
        assert resolve_actor_name(legacy_uuid_actor_entry) == DEFAULT_DISPLAY_NAME
    finally:
        PROFILE_NAMES.pop(uid, None)


def test_ensure_profile_loaded_fetches_once_for_valid_uuid():
    uid = "55555555-5555-5555-5555-555555555555"
    PROFILE_NAMES.pop(uid, None)
    load_mock = AsyncMock(return_value="Disraeli")

    async def run():
        with (
            patch.object(profiles.supabase, "is_persistence_enabled", return_value=True),
            patch.object(profiles.supabase, "load_profile_name_from_db", load_mock),
        ):
            await ensure_profile_loaded(uid)
            await ensure_profile_loaded(uid)
            await ensure_profile_loaded("non-uuid-guest")

    try:
        asyncio.run(run())
        assert PROFILE_NAMES[uid] == "Disraeli"
        assert load_mock.await_count == 1
    finally:
        PROFILE_NAMES.pop(uid, None)
