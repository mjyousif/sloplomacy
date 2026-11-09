"""Helpers for the clock tests: a match with seated players, and driving its clock through the API."""

import time

import jwt
from storage.store import GAMES

TEST_JWT_SECRET = "test-secret-at-least-32-chars-long-12345"
ALL_POWERS = ["FRANCE", "ENGLAND", "GERMANY", "ITALY", "AUSTRIA", "RUSSIA", "TURKEY"]
HOST_ID = "timer_host"
HOST_EMAIL = "host@example.com"


def host_headers() -> dict:
    token = jwt.encode(
        {
            "sub": HOST_ID,
            "email": HOST_EMAIL,
            "exp": int(time.time()) + 3600,
            "aud": "authenticated",
        },
        TEST_JWT_SECRET,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def make_match(client, powers=ALL_POWERS) -> str:
    created = client.post(
        "/api/games",
        json={
            "name": "Timer Test",
            "creator_power": powers[0],
            "user_id": HOST_ID,
            "email": HOST_EMAIL,
        },
    )
    assert created.status_code == 200
    gid = created.json()["game_id"]
    for power in powers[1:]:
        joined = client.post(
            f"/api/games/{gid}/join",
            json={"power": power, "user_id": f"user_{power}", "email": f"{power}@example.com"},
        )
        assert joined.status_code == 200
    return gid


def start_clock(client, gid: str) -> dict:
    res = client.post(f"/api/games/{gid}/timer/start", headers=host_headers())
    assert res.status_code == 200, res.text
    return res.json()["timer"]


def vote(client, gid: str, power: str, choice: str):
    return client.post(f"/api/games/{gid}/timer/vote", json={"power": power, "choice": choice})


def run_vote(client, gid: str, choice: str = "15") -> None:
    for power in GAMES[gid].timer.players:
        assert vote(client, gid, power.value, choice).status_code == 200


def extend(client, gid: str, power: str, active: bool = True):
    return client.post(f"/api/games/{gid}/timer/extend", json={"power": power, "active": active})


def ready(client, gid: str, power: str, active: bool = True):
    return client.post(f"/api/games/{gid}/timer/ready", json={"power": power, "active": active})


def poll(client, gid: str) -> dict:
    res = client.get(f"/api/game?game_id={gid}")
    assert res.status_code == 200
    return res.json()["state"]


def run_out(gid: str) -> None:
    GAMES[gid].timer.deadline = time.time() - 1


def turn_label(gid: str) -> str:
    game = GAMES[gid]
    return f"{game.season} {game.year} {game.phase}"
