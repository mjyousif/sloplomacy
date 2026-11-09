"""Only a seat's holder acts for it: orders, batches, build slots, surrender and leave, timers, passcodes and admin checks."""

import pytest
from domain.orders import OrderType
from fastapi.testclient import TestClient
from main import app
from storage.store import GAME_SUMMARIES, GAMES
from tests.integration.security.helpers import auth_headers, bob_headers, secret_plan_match

client = TestClient(app)


def test_seat_authorization_prevents_opponent_order_tampering():
    # Alice creates match as FRANCE
    alice_id = "00000000-0000-0000-0000-000000000001"
    res_create = client.post(
        "/api/games",
        json={
            "name": "Auth Match",
            "creator_power": "FRANCE",
            "user_id": alice_id,
            "email": "alice@test.com",
        },
        headers=auth_headers(alice_id, "alice@test.com"),
    )
    assert res_create.status_code == 200
    gid = res_create.json()["game_id"]

    # Bob joins as GERMANY
    bob_id = "00000000-0000-0000-0000-000000000002"
    res_join = client.post(
        f"/api/games/{gid}/join",
        json={"power": "GERMANY", "user_id": bob_id, "email": "bob@test.com"},
        headers=auth_headers(bob_id, "bob@test.com"),
    )
    assert res_join.status_code == 200

    # Bob attempts to move Alice's French army in Paris
    malicious_order = {
        "unit_id": "FRA_A_PAR",
        "power": "FRANCE",
        "unit_type": "A",
        "origin": "PAR",
        "order_type": "MOVE",
        "target": "PIC",
        "is_explicit": True,
    }
    res_tamper = client.post(
        f"/api/order?game_id={gid}",
        json={"order": malicious_order},
        headers=auth_headers(bob_id, "bob@test.com"),
    )
    assert res_tamper.status_code == 403

    # Unauthenticated attacker attempts to finalize France
    res_unauth = client.post(
        f"/api/finalize?game_id={gid}",
        json={"power": "FRANCE", "force": True},
    )
    assert res_unauth.status_code == 401

    # Bob attempts to finalize France
    res_bob_finalize = client.post(
        f"/api/finalize?game_id={gid}",
        json={"power": "FRANCE", "force": True},
        headers=auth_headers(bob_id, "bob@test.com"),
    )
    assert res_bob_finalize.status_code == 403

    # Alice finalizes France successfully
    res_alice_finalize = client.post(
        f"/api/finalize?game_id={gid}",
        json={"power": "FRANCE", "force": True},
        headers=auth_headers(alice_id, "alice@test.com"),
    )
    assert res_alice_finalize.status_code == 200


def test_surrender_and_leave_idor_protection():
    alice_id = "00000000-0000-0000-0000-000000000001"
    bob_id = "00000000-0000-0000-0000-000000000002"

    res_create = client.post(
        "/api/games",
        json={
            "name": "IDOR Match",
            "creator_power": "FRANCE",
            "user_id": alice_id,
            "email": "alice@test.com",
        },
        headers=auth_headers(alice_id, "alice@test.com"),
    )
    gid = res_create.json()["game_id"]

    client.post(
        f"/api/games/{gid}/join",
        json={"power": "GERMANY", "user_id": bob_id, "email": "bob@test.com"},
        headers=auth_headers(bob_id, "bob@test.com"),
    )

    # Bob tries to surrender Alice's France
    res_surrender = client.post(
        f"/api/games/{gid}/surrender",
        json={"power": "FRANCE", "user_id": bob_id, "leave": False},
        headers=auth_headers(bob_id, "bob@test.com"),
    )
    assert res_surrender.status_code == 403

    # Bob tries to force Alice to leave
    res_leave = client.post(
        f"/api/games/{gid}/leave",
        json={"power": "FRANCE", "user_id": bob_id, "email": "bob@test.com"},
        headers=auth_headers(bob_id, "bob@test.com"),
    )
    assert res_leave.status_code == 403

    # France is still occupied by Alice
    summary = GAME_SUMMARIES[gid]
    assert "FRANCE" in summary.participants
    assert summary.participants["FRANCE"].user_id == alice_id


def test_private_game_passcode_enforced():
    alice_id = "00000000-0000-0000-0000-000000000001"
    res_create = client.post(
        "/api/games",
        json={
            "name": "Secret Campaign",
            "creator_power": "FRANCE",
            "user_id": alice_id,
            "email": "alice@test.com",
            "is_private": True,
            "passcode": "supersecretpassword",
        },
        headers=auth_headers(alice_id, "alice@test.com"),
    )
    assert res_create.status_code == 200
    gid = res_create.json()["game_id"]

    # Request without passcode is forbidden
    res_no_pw = client.get(f"/api/game?game_id={gid}")
    assert res_no_pw.status_code == 403

    # Request with wrong passcode is forbidden
    res_bad_pw = client.get(f"/api/game?game_id={gid}&passcode=wrongpassword")
    assert res_bad_pw.status_code == 403

    # Request with correct passcode succeeds
    res_good_pw = client.get(f"/api/game?game_id={gid}&passcode=supersecretpassword")
    assert res_good_pw.status_code == 200


def test_timer_action_authorization():
    alice_id = "00000000-0000-0000-0000-000000000001"
    bob_id = "00000000-0000-0000-0000-000000000002"

    res_create = client.post(
        "/api/games",
        json={
            "name": "Timer Match",
            "creator_power": "FRANCE",
            "user_id": alice_id,
            "email": "alice@test.com",
        },
        headers=auth_headers(alice_id, "alice@test.com"),
    )
    gid = res_create.json()["game_id"]

    client.post(
        f"/api/games/{gid}/join",
        json={"power": "GERMANY", "user_id": bob_id, "email": "bob@test.com"},
        headers=auth_headers(bob_id, "bob@test.com"),
    )

    # Bob (non-host) cannot start the timer
    res_start = client.post(
        f"/api/games/{gid}/timer/start",
        headers=auth_headers(bob_id, "bob@test.com"),
    )
    assert res_start.status_code == 403

    # Alice (host) starts the timer -> enters VOTING
    res_alice_start = client.post(
        f"/api/games/{gid}/timer/start",
        headers=auth_headers(alice_id, "alice@test.com"),
    )
    assert res_alice_start.status_code == 200

    # Bob cannot vote on behalf of FRANCE
    res_bob_vote = client.post(
        f"/api/games/{gid}/timer/vote",
        json={"power": "FRANCE", "choice": "15"},
        headers=auth_headers(bob_id, "bob@test.com"),
    )
    assert res_bob_vote.status_code == 403

    # Unauthenticated user cannot vote on behalf of FRANCE
    res_unauth_vote = client.post(
        f"/api/games/{gid}/timer/vote",
        json={"power": "FRANCE", "choice": "15"},
    )
    assert res_unauth_vote.status_code == 401


def test_a_batch_cannot_order_another_powers_units():
    gid = secret_plan_match()
    res = client.post(
        f"/api/orders/batch?game_id={gid}",
        json={
            "power": "GERMANY",
            "orders": [
                {
                    "unit_id": "FRA_A_PAR",
                    "power": "GERMANY",
                    "unit_type": "A",
                    "origin": "PAR",
                    "order_type": "HOLD",
                    "is_explicit": True,
                }
            ],
        },
        headers=bob_headers(),
    )
    assert res.status_code == 403
    assert GAMES[gid].orders["FRA_A_PAR"].order_type == OrderType.MOVE


def test_a_build_slot_belongs_to_the_power_it_names():
    gid = secret_plan_match()
    res = client.post(
        f"/api/order?game_id={gid}",
        json={
            "order": {
                "unit_id": "BUILD_FRANCE_PAR",
                "power": "GERMANY",
                "unit_type": "A",
                "origin": "PAR",
                "order_type": "BUILD",
                "is_explicit": True,
            }
        },
        headers=bob_headers(),
    )
    assert res.status_code == 403
    assert "BUILD_FRANCE_PAR" not in GAMES[gid].orders


def test_nobody_orders_an_empty_seat():
    gid = secret_plan_match()
    order = {
        "order": {
            "unit_id": "RUS_A_MOS",
            "power": "RUSSIA",
            "unit_type": "A",
            "origin": "MOS",
            "order_type": "MOVE",
            "target": "UKR",
            "is_explicit": True,
        }
    }
    for headers in (bob_headers(), {}):
        assert (
            client.post(f"/api/order?game_id={gid}", json=order, headers=headers).status_code == 403
        )
    assert GAMES[gid].orders["RUS_A_MOS"].order_type == OrderType.HOLD


def test_admin_check_fails_closed_for_a_game_that_is_not_loaded():
    from fastapi import HTTPException
    from security.secrecy import verify_admin_access

    with pytest.raises(HTTPException) as denied:
        verify_admin_access("mp_never_loaded", None)
    assert denied.value.status_code == 404
