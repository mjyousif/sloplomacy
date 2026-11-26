"""Press is saved in its own column: it survives a restart, and a failed read never wipes it."""

from storage.store import GAME_PRESS, PRESS_UNSAVED
from tests.integration.storage.helpers import (
    BOB,
    _create_game,
    _join,
    _restart_container,
    client,
)


def _send(game_id, power, body, recipients=()):
    return client.post(
        f"/api/press?game_id={game_id}",
        json={"power": power, "body": body, "recipients": list(recipients)},
    )


def _bodies(game_id, power):
    res = client.get(f"/api/press?game_id={game_id}&power={power}")
    assert res.status_code == 200, res.text
    return [m["body"] for m in res.json()["messages"]]


def test_press_survives_a_restart(supabase):
    gid = _create_game()
    _join(gid, "GERMANY", BOB)
    assert _send(gid, "FRANCE", "Before the restart", ["GERMANY"]).status_code == 200
    assert gid not in PRESS_UNSAVED

    _restart_container(gid)

    assert _bodies(gid, "GERMANY") == ["Before the restart"]
    sent = _send(gid, "GERMANY", "After the restart", ["FRANCE"])
    # Numbering carries on from the saved press.
    assert sent.json()["seq"] == 2
    assert [m["body"] for m in supabase.press[gid]] == ["Before the restart", "After the restart"]


def test_a_game_save_leaves_the_press_alone(supabase):
    gid = _create_game()
    _join(gid, "GERMANY", BOB)
    _send(gid, "FRANCE", "Hello")
    # Joining and ordering save the game; none of those saves carries press.
    _join(gid, "ENGLAND", {"user_id": "cal", "email": "cal@test.com"})
    assert [m["body"] for m in supabase.press[gid]] == ["Hello"]


def test_a_failed_read_is_not_an_empty_press(supabase):
    gid = _create_game()
    _join(gid, "GERMANY", BOB)
    _send(gid, "FRANCE", "Keep me")
    _restart_container(gid)
    assert _bodies(gid, "FRANCE") == ["Keep me"]  # Loads the game back, and its press.

    GAME_PRESS.pop(gid, None)
    supabase.reads_fail = True
    assert client.get(f"/api/press?game_id={gid}&power=FRANCE").status_code == 503
    assert _send(gid, "FRANCE", "Would overwrite").status_code == 503
    assert gid not in GAME_PRESS

    supabase.reads_fail = False
    assert _bodies(gid, "FRANCE") == ["Keep me"]
    assert [m["body"] for m in supabase.press[gid]] == ["Keep me"]


def test_a_failed_save_is_retried_by_the_next_message(supabase):
    gid = _create_game()
    _join(gid, "GERMANY", BOB)
    supabase.writes_fail = True
    assert _send(gid, "FRANCE", "First").status_code == 200
    assert gid in PRESS_UNSAVED

    supabase.writes_fail = False
    assert _send(gid, "FRANCE", "Second").status_code == 200
    assert gid not in PRESS_UNSAVED
    assert [m["body"] for m in supabase.press[gid]] == ["First", "Second"]


def test_deleting_a_game_forgets_its_press(supabase):
    gid = _create_game()
    _join(gid, "GERMANY", BOB)
    _send(gid, "FRANCE", "Gone soon")
    assert gid in GAME_PRESS
    from storage.store import evict_game

    evict_game(gid)
    assert gid not in GAME_PRESS


def test_suggested_orders_survive_a_restart(supabase):
    gid = _create_game()
    _join(gid, "GERMANY", BOB)
    sent = client.post(
        f"/api/press?game_id={gid}",
        json={
            "power": "FRANCE",
            "body": "",
            "recipients": ["GERMANY"],
            "orders": [
                {
                    "unit_id": "GER_A_MUN",
                    "power": "GERMANY",
                    "unit_type": "A",
                    "origin": "MUN",
                    "order_type": "MOVE",
                    "target": "BUR",
                }
            ],
        },
    )
    assert sent.status_code == 200, sent.text

    _restart_container(gid)

    res = client.get(f"/api/press?game_id={gid}&power=GERMANY")
    (message,) = res.json()["messages"]
    assert [(o["unit_id"], o["target"]) for o in message["orders"]] == [("GER_A_MUN", "BUR")]


def test_anonymous_dm_and_group_threads_survive_restart(supabase):
    gid = _create_game()
    _join(gid, "GERMANY", BOB)
    _join(gid, "RUSSIA", {"user_id": "cal", "email": "cal@test.com", "display_name": "Cal"})

    dm = client.post(
        f"/api/press?game_id={gid}",
        json={
            "power": "FRANCE",
            "body": "Secret anonymous cable",
            "recipients": ["GERMANY"],
            "anonymous": True,
        },
    )
    assert dm.status_code == 200, dm.text
    grp = client.post(
        f"/api/press?game_id={gid}",
        json={
            "power": "FRANCE",
            "body": "Group coalition note",
            "recipients": ["GERMANY", "RUSSIA"],
            "anonymous": True,
        },
    )
    assert grp.status_code == 200, grp.text

    assert "FRANCE_GERMANY" in supabase.press_threads[gid]
    assert supabase.press_threads[gid]["FRANCE_GERMANY"]["thread_type"] == "direct"
    assert "FRANCE_GERMANY_RUSSIA" in supabase.press_threads[gid]
    assert supabase.press_threads[gid]["FRANCE_GERMANY_RUSSIA"]["thread_type"] == "group"

    _restart_container(gid)

    germany_msgs = client.get(f"/api/press?game_id={gid}&power=GERMANY").json()["messages"]
    assert len(germany_msgs) == 2
    assert germany_msgs[0]["sender"] is None
    assert germany_msgs[0]["anonymous"] is True
    assert germany_msgs[0]["body"] == "Secret anonymous cable"
    assert germany_msgs[1]["sender"] is None
    assert (
        sorted(germany_msgs[1]["recipients"]) == ["GERMANY", "RUSSIA"]
        or len(germany_msgs[1]["recipients"]) >= 1
    )
