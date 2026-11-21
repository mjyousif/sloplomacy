"""Who is asking comes only from the verified token: never from `X-User-Id`/`X-User-Email` or a
`user_id`/`email`/`power` a client writes into the body."""

import pytest
from storage.store import GAME_SUMMARIES, GAMES
from tests.integration.security.helpers import (
    ALICE_ID,
    BOB_ID,
    alice_headers,
    auth_headers,
    bob_headers,
    client,
    secret_plan_match,
)

SPOOF = {"X-User-Id": ALICE_ID, "X-User-Email": "alice@test.com"}

pytestmark = pytest.mark.usefixtures("forget_games_made_by_test")


def test_headers_naming_the_host_do_not_make_a_stranger_the_admin():
    gid = secret_plan_match()
    status_res = client.get(f"/api/admin/status?game_id={gid}", headers=SPOOF)
    assert status_res.json()["is_creator"] is False
    assert status_res.json()["history_entries"] == []

    # Bob holds a seat and sends Alice's identity in headers and body beside his own token.
    spoofed = {**bob_headers(), **SPOOF}
    for path, body in (
        (f"/api/admin/rollback?game_id={gid}", {"user_id": ALICE_ID, "email": "alice@test.com"}),
        (
            f"/api/admin/set-turn?game_id={gid}",
            {
                "season": "Fall",
                "year": 1901,
                "phase": "Movement",
                "user_id": ALICE_ID,
                "email": "alice@test.com",
            },
        ),
        (f"/api/adjudicate?game_id={gid}", None),
        (f"/api/admin/unfinalize-all?game_id={gid}", None),
    ):
        res = client.post(path, json=body, headers=spoofed)
        assert res.status_code == 403, (path, res.status_code)
    assert GAMES[gid].season == "Spring"


def test_headers_alone_never_authenticate_an_admin_action():
    gid = secret_plan_match()
    res = client.post(f"/api/adjudicate?game_id={gid}", headers=SPOOF)
    assert res.status_code == 401
    assert GAMES[gid].season == "Spring"


def test_admin_log_names_the_token_holder_not_a_header_or_body_claim():
    gid = secret_plan_match()
    res = client.post(
        f"/api/admin/set-turn?game_id={gid}",
        json={
            "season": "Fall",
            "year": 1901,
            "phase": "Movement",
            "user_id": BOB_ID,
            "email": "bob@test.com",
        },
        headers={**alice_headers(), "X-User-Id": BOB_ID, "X-User-Email": "bob@test.com"},
    )
    assert res.status_code == 200
    entry = GAMES[gid].admin_log[-1]
    assert entry.actor_id == ALICE_ID
    assert entry.actor == ""
    assert res.json()["admin_log"][-1]["actor"] == "Envoy"
    assert BOB_ID not in entry.acknowledged_by


CAROL_ID = "00000000-0000-0000-0000-0000000ca201"


def match_with_carol() -> tuple[str, str]:
    """Alice (France), Bob (Germany) and Carol (Italy), after an admin action none has dismissed."""
    gid = secret_plan_match()
    joined = client.post(
        f"/api/games/{gid}/join",
        json={"power": "ITALY", "user_id": CAROL_ID, "email": "carol@test.com"},
        headers=auth_headers(CAROL_ID, "carol@test.com"),
    )
    assert joined.status_code == 200, joined.text
    client.post(
        f"/api/admin/set-turn?game_id={gid}",
        json={"season": "Fall", "year": 1901, "phase": "Movement"},
        headers=alice_headers(),
    )
    return gid, GAMES[gid].admin_log[-1].id


def test_acknowledge_ignores_a_body_naming_someone_else():
    gid, entry_id = match_with_carol()

    # Bob dismisses the warning "for" Carol: her id, her email and her seat in the body.
    res = client.post(
        f"/api/admin/acknowledge?game_id={gid}",
        json={
            "entry_ids": [entry_id],
            "user_id": CAROL_ID,
            "email": "carol@test.com",
            "power": "ITALY",
        },
        headers={**bob_headers(), "X-User-Id": CAROL_ID, "X-User-Email": "carol@test.com"},
    )
    assert res.status_code == 200
    acked = GAMES[gid].admin_log[-1].acknowledged_by
    assert BOB_ID in acked
    assert "GERMANY" in acked  # Bob's own seat
    assert CAROL_ID not in acked
    assert "carol@test.com" not in acked
    assert "ITALY" not in acked


def test_guest_acknowledges_only_for_a_seat_claimed_without_an_account():
    gid, entry_id = match_with_carol()
    assert GAME_SUMMARIES[gid].participants["ITALY"].user_id == CAROL_ID

    # With no token, naming Carol's account seat or Carol herself buys nothing.
    res = client.post(
        f"/api/admin/acknowledge?game_id={gid}",
        json={"entry_ids": [entry_id], "user_id": CAROL_ID, "power": "ITALY"},
        headers={"X-User-Id": CAROL_ID},
    )
    assert res.status_code == 200
    assert res.json()["acknowledged_by"] == "guest"
    acked = GAMES[gid].admin_log[-1].acknowledged_by
    assert "guest" in acked
    assert CAROL_ID not in acked and "ITALY" not in acked


def test_guest_holding_a_seat_acknowledges_as_that_seat():
    gid, entry_id = match_with_carol()
    joined = client.post(
        f"/api/games/{gid}/join",
        json={"power": "ENGLAND", "user_id": "guest_dan", "email": "dan@guest.local"},
    )
    assert joined.status_code == 200, joined.text

    res = client.post(
        f"/api/admin/acknowledge?game_id={gid}",
        json={"entry_ids": [entry_id], "power": "ENGLAND"},
    )
    assert res.json()["acknowledged_by"] == "ENGLAND"
    assert "ENGLAND" in GAMES[gid].admin_log[-1].acknowledged_by
