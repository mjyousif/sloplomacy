"""Tests for account profile management (`PATCH /api/account/profile`) and profile hydration."""

import pytest
from domain.board import Power
from domain.game_state import GameParticipant, MultiplayerGameSummary
from main import app
from starlette.testclient import TestClient
from storage.store import GAME_SUMMARIES, PROFILE_NAMES, hydrate_summary_profiles

from .helpers import _auth_headers

client = TestClient(app)


@pytest.fixture
def clean_profiles():
    before_profiles = dict(PROFILE_NAMES)
    before_games = dict(GAME_SUMMARIES)
    PROFILE_NAMES.clear()
    GAME_SUMMARIES.clear()
    yield
    PROFILE_NAMES.clear()
    PROFILE_NAMES.update(before_profiles)
    GAME_SUMMARIES.clear()
    GAME_SUMMARIES.update(before_games)


def test_update_profile_requires_auth(clean_profiles):
    res = client.patch("/api/account/profile", json={"display_name": "Talleyrand"})
    assert res.status_code == 401


def test_update_profile_validates_length(clean_profiles):
    headers = _auth_headers(user_id="user_a", email="a@test.com")
    res_short = client.patch("/api/account/profile", headers=headers, json={"display_name": " A "})
    assert res_short.status_code == 422

    res_long = client.patch(
        "/api/account/profile", headers=headers, json={"display_name": "X" * 25}
    )
    assert res_long.status_code == 422


def test_update_profile_syncs_all_user_games_and_lobby(clean_profiles, monkeypatch):
    calls: list[tuple[str, str]] = []

    async def fake_upsert(user_id: str, display_name: str, client=None):
        calls.append((user_id, display_name))
        return True

    monkeypatch.setattr("storage.supabase.upsert_profile_display_name", fake_upsert)

    user_a = _auth_headers(user_id="user_a", email="a@test.com")
    user_b = _auth_headers(user_id="user_b", email="b@test.com")

    g1 = client.post(
        "/api/games",
        headers=user_a,
        json={"name": "Campaign One", "creator_power": "FRANCE", "display_name": "Envoy"},
    ).json()["game_id"]
    g2 = client.post(
        "/api/games",
        headers=user_b,
        json={"name": "Campaign Two", "creator_power": "GERMANY", "display_name": "Kaiser"},
    ).json()["game_id"]
    join_res = client.post(
        f"/api/games/{g2}/join",
        headers=user_a,
        json={"power": "ITALY", "display_name": "Envoy"},
    )
    assert join_res.status_code == 200

    res = client.patch(
        "/api/account/profile",
        headers=user_a,
        json={"display_name": "  Metternich  "},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["display_name"] == "Metternich"
    assert body["updated_games"] == 2
    assert PROFILE_NAMES["user_a"] == "Metternich"
    assert calls == [("user_a", "Metternich")]

    assert GAME_SUMMARIES[g1].participants["FRANCE"].display_name == "Metternich"
    assert GAME_SUMMARIES[g2].participants["ITALY"].display_name == "Metternich"
    assert GAME_SUMMARIES[g2].participants["GERMANY"].display_name == "Kaiser"

    browse = client.get("/api/games/browse").json()
    by_id = {row["game_id"]: row for row in browse["games"]}
    assert by_id[g1]["host_name"] == "Metternich"
    assert by_id[g2]["host_name"] == "Kaiser"


def test_hydrate_summary_profiles_resolves_registered_names(clean_profiles):
    PROFILE_NAMES["u1"] = "Cavour"
    summary = MultiplayerGameSummary(
        game_id="g_hydrate",
        name="Test",
        created_by="a@test.com",
        created_at="2026-01-01T00:00:00Z",
        participants={
            "ITALY": GameParticipant(
                user_id="u1",
                email="a@test.com",
                display_name="OldName",
                power=Power.ITALY,
                joined_at="2026-01-01T00:00:00Z",
            ),
            "AUSTRIA": GameParticipant(
                user_id="guest_1",
                email="g@test.com",
                display_name="GuestPlayer",
                power=Power.AUSTRIA,
                joined_at="2026-01-01T00:00:00Z",
            ),
        },
    )
    hydrate_summary_profiles(summary)
    assert summary.participants["ITALY"].display_name == "Cavour"
    assert summary.participants["AUSTRIA"].display_name == "GuestPlayer"


def test_serialize_summary_for_db_strips_uuid_display_name(clean_profiles):
    from storage.supabase import _serialize_summary_for_db, build_summary_from_row

    uid = "11111111-1111-1111-1111-111111111111"
    summary = MultiplayerGameSummary(
        game_id="g_norm",
        name="Norm Test",
        created_by="a@test.com",
        creator_id=uid,
        created_at="2026-01-01T00:00:00Z",
        participants={
            "FRANCE": GameParticipant(
                user_id=uid,
                email="a@test.com",
                display_name="Talleyrand",
                power=Power.FRANCE,
                joined_at="2026-01-01T00:00:00Z",
            ),
            "ITALY": GameParticipant(
                user_id="guest",
                email="g@test.com",
                display_name="GuestPlayer",
                power=Power.ITALY,
                joined_at="2026-01-01T00:00:00Z",
            ),
        },
    )

    serialized = _serialize_summary_for_db(summary)
    assert "created_by" not in serialized
    assert "display_name" not in serialized["participants"]["FRANCE"]
    assert serialized["participants"]["ITALY"]["display_name"] == "GuestPlayer"

    PROFILE_NAMES[uid] = "Talleyrand"
    reloaded = build_summary_from_row(
        {"room_code": "g_norm", "game_state": {"summary": serialized}}
    )
    hydrate_summary_profiles(reloaded)
    assert reloaded.participants["FRANCE"].display_name == "Talleyrand"
    assert reloaded.participants["ITALY"].display_name == "GuestPlayer"
