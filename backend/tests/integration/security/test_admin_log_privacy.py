"""The admin log never carries another viewer's email or user id, yet each viewer still sees
their own acknowledgement."""

import json

from fastapi.testclient import TestClient
from main import app
from storage.store import GAMES
from tests.integration.security.helpers import auth_headers, make_jwt, socket_state

client = TestClient(app)

ALICE = ("00000000-0000-0000-0000-00000000a101", "alice.secret@example.com")
BOB = ("00000000-0000-0000-0000-00000000a102", "bob.secret@example.com")
CAROL = ("00000000-0000-0000-0000-00000000a103", "carol.secret@example.com")


def _admin_edit(gid: str, province: str, owner: str):
    """The host hands `province` to `owner` through the board editor, which logs an entry."""
    alice = auth_headers(*ALICE)
    current = client.get(f"/api/game?game_id={gid}", headers=alice).json()["state"]
    return client.post(
        f"/api/admin/board-edit?game_id={gid}",
        json={
            "expected_revision": current["board_revision"],
            "expected_season": current["season"],
            "expected_year": current["year"],
            "expected_phase": current["phase"],
            "units": current["units"],
            "ownership": {**current["ownership"], province: owner},
        },
        headers=alice,
    )


def _match_with_admin_entry() -> tuple[str, str]:
    alice = auth_headers(*ALICE)
    gid = client.post(
        "/api/games",
        json={
            "name": "Admin Log Privacy",
            "creator_power": "FRANCE",
            "user_id": ALICE[0],
            "email": ALICE[1],
            "display_name": "GeneralAlice",
            "is_private": False,
        },
        headers=alice,
    ).json()["game_id"]
    joined = client.post(
        f"/api/games/{gid}/join",
        json={
            "power": "GERMANY",
            "user_id": BOB[0],
            "email": BOB[1],
            "display_name": "KaiserBob",
        },
        headers=auth_headers(*BOB),
    )
    assert joined.status_code == 200
    edit = _admin_edit(gid, "BEL", "FRANCE")
    assert edit.status_code == 200, edit.text
    return gid, edit.json()["admin_log"][0]["id"]


def _acknowledge(gid: str, entry_id: str, who: tuple[str, str], **extra) -> None:
    res = client.post(
        f"/api/admin/acknowledge?game_id={gid}",
        json={"entry_ids": [entry_id], "user_id": who[0], "email": who[1], **extra},
        headers=auth_headers(*who),
    )
    assert res.status_code == 200


def _identifiers() -> list[str]:
    return [i for who in (ALICE, BOB, CAROL) for i in who]


def test_no_viewer_sees_another_players_email_or_user_id_in_the_admin_log():
    gid, entry_id = _match_with_admin_entry()
    _acknowledge(gid, entry_id, BOB, power="GERMANY")
    _acknowledge(gid, entry_id, CAROL)  # a spectator holds no seat

    for viewer in (ALICE, BOB, CAROL, None):
        headers = auth_headers(*viewer) if viewer else {}
        body = client.get(f"/api/game?game_id={gid}", headers=headers)
        assert body.status_code == 200
        acked = body.json()["state"]["admin_log"][0]["acknowledged_by"]
        for ident in _identifiers():
            if viewer and ident == viewer[0]:
                assert ident in acked  # still sees their own acknowledgement
            elif not (viewer and ident in viewer):
                assert ident not in acked, f"{ident} leaked to {viewer}"
        assert not any("@" in token for token in acked if not viewer or token not in viewer)


def test_an_acknowledgement_response_and_the_socket_hide_others_too():
    gid, entry_id = _match_with_admin_entry()
    _acknowledge(gid, entry_id, BOB, power="GERMANY")

    # The seats' user ids are public in the summary; the admin log is what is checked here.
    res = client.get(f"/api/game?game_id={gid}", headers=auth_headers(*CAROL))
    log = json.dumps(res.json()["state"]["admin_log"])
    for ident in (*ALICE, *BOB):
        assert ident not in log

    carol_log = socket_state(f"/ws/games/{gid}?handshake=1", token=make_jwt(*CAROL))["admin_log"]
    for ident in (*ALICE, *BOB):
        assert ident not in json.dumps(carol_log)

    bob_payload = socket_state(f"/ws/games/{gid}?handshake=1", token=make_jwt(*BOB))
    acked = bob_payload["admin_log"][0]["acknowledged_by"]
    assert BOB[0] in acked and BOB[1] not in acked
    assert ALICE[0] not in acked and ALICE[1] not in acked
    assert bob_payload["admin_log"][0]["actor_id"] is None


def test_a_saved_game_that_already_holds_emails_is_scrubbed_when_sent():
    gid, entry_id = _match_with_admin_entry()
    GAMES[gid].admin_log[0].acknowledged_by.extend([ALICE[1], BOB[1], BOB[0], "GERMANY", "guest"])

    seen = client.get(f"/api/game?game_id={gid}", headers=auth_headers(*CAROL)).json()
    acked = seen["state"]["admin_log"][0]["acknowledged_by"]
    assert set(acked) <= {"GERMANY", "FRANCE", "guest"}
    assert "GERMANY" in acked


def test_the_acknowledgement_endpoint_does_not_echo_other_identities():
    gid, entry_id = _match_with_admin_entry()
    res = client.post(
        f"/api/admin/acknowledge?game_id={gid}",
        json={"entry_ids": [entry_id], "email": "spoofed@example.com"},
        headers=auth_headers(*CAROL),
    )
    assert res.status_code == 200
    assert "spoofed@example.com" not in res.text


def test_a_broadcast_to_a_connected_viewer_hides_others_too():
    gid, entry_id = _match_with_admin_entry()
    with client.websocket_connect(f"/ws/games/{gid}?handshake=1") as ws:
        ws.send_json({"type": "auth", "token": make_jwt(*CAROL)})
        assert ws.receive_json()["type"] == "game_update"
        # A board edit by the host broadcasts the board to every socket.
        assert _admin_edit(gid, "HOL", "FRANCE").status_code == 200
        _acknowledge(gid, entry_id, BOB, power="GERMANY")
        ws.send_json({"type": "refresh"})
        seen = ws.receive_json()
        while seen["type"] == "game_update" and len(seen["state"]["admin_log"]) < 2:
            seen = ws.receive_json()
        assert seen["type"] == "game_update"
        log = json.dumps(seen["state"]["admin_log"])
        for ident in (*ALICE, *BOB):
            assert ident not in log


def test_updating_profile_updates_admin_log_actor_dynamically(monkeypatch):
    from unittest.mock import AsyncMock

    from storage.profiles import PROFILE_NAMES

    monkeypatch.setattr(
        "storage.supabase.upsert_profile_display_name", AsyncMock(return_value=True)
    )
    PROFILE_NAMES.pop(ALICE[0], None)
    try:
        gid, _ = _match_with_admin_entry()
        before = client.get(f"/api/game?game_id={gid}", headers=auth_headers(*BOB)).json()
        assert before["state"]["admin_log"][0]["actor"] == "Envoy"

        patch_res = client.patch(
            "/api/account/profile",
            json={"display_name": "PrinceTalleyrand"},
            headers=auth_headers(*ALICE),
        )
        assert patch_res.status_code == 200

        after = client.get(f"/api/game?game_id={gid}", headers=auth_headers(*BOB)).json()
        assert after["state"]["admin_log"][0]["actor"] == "PrinceTalleyrand"
        assert after["state"]["admin_log"][0]["actor_id"] is None
    finally:
        PROFILE_NAMES.pop(ALICE[0], None)


def test_sandbox_enter_export_and_timer_start_sanitize_admin_log():
    from storage.profiles import PROFILE_NAMES

    PROFILE_NAMES[ALICE[0]] = "GeneralAlice"
    try:
        gid, entry_id = _match_with_admin_entry()
        _acknowledge(gid, entry_id, BOB, power="GERMANY")
        _acknowledge(gid, entry_id, CAROL)

        # 1. Entering private hypothetical sandbox as Bob resolves actor & hides Alice/Carol UUIDs.
        enter_res = client.post(
            f"/api/sandbox/enter?game_id={gid}",
            json={"power": "GERMANY"},
            headers=auth_headers(*BOB),
        )
        assert enter_res.status_code == 200, enter_res.text
        sbx_state = enter_res.json()
        sbx_id = sbx_state["game_id"]
        assert sbx_id.startswith("sbx_")
        sbx_entry = sbx_state["admin_log"][0]
        assert sbx_entry["actor"] == "GeneralAlice"
        assert sbx_entry["actor_id"] is None
        assert ALICE[0] not in sbx_entry["acknowledged_by"]
        assert CAROL[0] not in sbx_entry["acknowledged_by"]
        assert BOB[0] in sbx_entry["acknowledged_by"]

        # 2. Exporting that private sandbox to a solo draft keeps admin_log sanitized.
        export_res = client.post(
            f"/api/games/solo-sandbox?source_game_id={sbx_id}",
            headers=auth_headers(*BOB),
        )
        assert export_res.status_code == 200, export_res.text
        exp_entry = export_res.json()["state"]["admin_log"][0]
        assert exp_entry["actor"] == "GeneralAlice"
        assert exp_entry["actor_id"] is None
        assert ALICE[0] not in exp_entry["acknowledged_by"]
        assert CAROL[0] not in exp_entry["acknowledged_by"]

        # 3. Starting the phase clock as host Alice returns sanitized admin_log too.
        timer_res = client.post(
            f"/api/games/{gid}/timer/start",
            headers=auth_headers(*ALICE),
        )
        assert timer_res.status_code == 200, timer_res.text
        timer_entry = timer_res.json()["admin_log"][0]
        assert timer_entry["actor"] == "GeneralAlice"
        assert timer_entry["actor_id"] is None
        assert BOB[0] not in timer_entry["acknowledged_by"]
        assert CAROL[0] not in timer_entry["acknowledged_by"]
        assert ALICE[0] in timer_entry["acknowledged_by"]
    finally:
        PROFILE_NAMES.pop(ALICE[0], None)
