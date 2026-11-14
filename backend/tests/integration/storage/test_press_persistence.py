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
