"""The lobby browser's filters, order and pages, on summaries built in memory."""

from domain.board import Power
from domain.game_state import GameParticipant, MultiplayerGameSummary
from storage.lobby import browse, is_public_listing, summaries_for_user


def _seat(power: Power, user: str) -> GameParticipant:
    return GameParticipant(
        user_id=user,
        email=f"{user}@test.com",
        display_name=user.title(),
        power=power,
        joined_at="2026-11-01T00:00:00+00:00",
    )


def _game(gid, powers=(Power.FRANCE,), season="Spring", year=1901, moved=None, **kw):
    seats = {p.value: _seat(p, "host" if i == 0 else f"u{i}") for i, p in enumerate(powers)}
    return MultiplayerGameSummary(
        game_id=gid,
        name=gid,
        created_by="host@test.com",
        creator_id="host",
        created_at=kw.pop("created", "2026-11-01T00:00:00+00:00"),
        last_moved_at=moved,
        season=season,
        year=year,
        participants=seats,
        **kw,
    )


ALL = tuple(Power)


def _ids(page):
    return [r.game_id for r in page.games]


def test_open_games_come_first_then_most_recently_played():
    games = [
        _game("old_open", moved="2026-11-02T00:00:00+00:00"),
        _game("full_recent", powers=ALL, moved="2026-11-09T00:00:00+00:00"),
        _game("new_open", moved="2026-11-05T00:00:00+00:00"),
        _game("never_moved", created="2026-11-03T00:00:00+00:00"),
    ]

    assert _ids(browse(games, seats="all")) == [
        "new_open",
        "never_moved",
        "old_open",
        "full_recent",
    ]


def test_seat_filter_splits_open_and_full_games():
    games = [_game("open"), _game("full", powers=ALL), _game("done", status="completed")]

    assert _ids(browse(games, seats="open")) == ["open"]
    assert _ids(browse(games, seats="full")) == ["full"]
    assert set(_ids(browse(games, seats="all"))) == {"open", "full", "done"}


def test_country_filter_needs_every_listed_power_open():
    games = [
        _game("fr_it_taken", powers=(Power.FRANCE, Power.ITALY)),
        _game("fr_taken", powers=(Power.FRANCE,)),
    ]

    assert _ids(browse(games, countries=[Power.ITALY])) == ["fr_taken"]
    assert _ids(browse(games, countries=[Power.ENGLAND, Power.ITALY])) == ["fr_taken"]
    assert set(_ids(browse(games, countries=[Power.ENGLAND]))) == {"fr_it_taken", "fr_taken"}


def test_turn_filter_orders_seasons_within_a_year():
    games = [
        _game("s1903", season="Spring", year=1903),
        _game("f1903", season="Fall", year=1903),
        _game("w1903", season="Winter", year=1903),
        _game("s1904", season="Spring", year=1904),
    ]

    assert _ids(browse(games, turn_op="at", season="Fall", year=1903)) == ["f1903"]
    assert set(_ids(browse(games, turn_op="before", season="Fall", year=1903))) == {"s1903"}
    assert set(_ids(browse(games, turn_op="after", season="Fall", year=1903))) == {
        "w1903",
        "s1904",
    }
    assert set(_ids(browse(games, turn_op="at", year=1903))) == {"s1903", "f1903", "w1903"}


def test_pages_split_the_list_and_report_the_total():
    games = [_game(f"g{i}", moved=f"2026-11-{10 + i:02d}T00:00:00+00:00") for i in range(5)]

    first = browse(games, page=1, page_size=2)
    last = browse(games, page=3, page_size=2)

    assert first.total == 5
    assert _ids(first) == ["g4", "g3"]
    assert _ids(last) == ["g0"]
    assert browse(games, page=4, page_size=2).games == []


def test_rows_name_the_host_without_any_email():
    row = browse([_game("g", powers=(Power.FRANCE, Power.ITALY))]).games[0]

    assert row.host_name == "Host"
    assert row.claimed_powers == [Power.FRANCE, Power.ITALY]
    assert Power.ENGLAND in row.open_powers
    assert "@" not in row.model_dump_json()


def test_private_games_sandboxes_and_drafts_are_not_public():
    assert is_public_listing("a", _game("a"))
    assert not is_public_listing("b", _game("b", is_private=True))
    assert not is_public_listing("c", _game("c", is_sandbox=True))
    assert not is_public_listing("d", _game("d", is_sandbox=True, is_draft=True))
    assert not is_public_listing("proto_1901", _game("proto_1901"))


def test_a_players_own_games_include_private_ones(monkeypatch):
    from storage import lobby

    mine_private = _game("mine_private", powers=(Power.FRANCE, Power.ITALY), is_private=True)
    theirs = _game("theirs", is_private=True)
    theirs.participants = {"FRANCE": _seat(Power.FRANCE, "stranger")}
    theirs.creator_id = "stranger"
    monkeypatch.setattr(lobby, "GAME_SUMMARIES", {"mine_private": mine_private, "theirs": theirs})

    assert [s.game_id for s in summaries_for_user("u1")] == ["mine_private"]
    assert summaries_for_user("nobody") == []
