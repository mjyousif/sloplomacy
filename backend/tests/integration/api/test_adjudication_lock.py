"""A phase resolves once, however many callers decide to resolve it, and chained phases never deadlock."""

import asyncio
from unittest.mock import patch

import pytest
from domain.board import Power
from engine.order_utils import turn_label
from engine.turn_service import execute_adjudication
from storage.store import ADJUDICATION_LOCKS, GAME_HISTORY, GAMES
from tests.integration.api.helpers import _dislodge_russia_in_silesia, _seated_game

pytestmark = pytest.mark.usefixtures("forget_games_made_by_test")


def _slow_persist():
    async def persist(game_id):
        await asyncio.sleep(0.02)  # Resolving awaits here, which is where a second caller slips in.

    return patch("storage.store.persist_game", persist)


def test_two_resolvers_of_one_turn_resolve_it_once():
    game_id = _seated_game()
    game = GAMES[game_id]
    label = turn_label(game)
    assert label == "Spring 1901 Movement"

    async def run():
        with _slow_persist():
            await asyncio.gather(
                execute_adjudication(game, expected_turn=label),
                execute_adjudication(game, expected_turn=label),
                execute_adjudication(game, expected_turn=label),
            )

    asyncio.run(run())

    assert turn_label(GAMES[game_id]) == "Fall 1901 Movement"
    assert len(GAME_HISTORY[game_id]) == 1


def test_resolver_that_lost_the_race_does_not_resolve_the_next_turn_too():
    game_id = _seated_game()
    game = GAMES[game_id]
    stale = turn_label(game)

    async def run():
        with _slow_persist():
            first = asyncio.ensure_future(execute_adjudication(game, expected_turn=stale))
            await asyncio.sleep(0)  # The first resolver now holds the lock, mid-persist.
            second = await execute_adjudication(game, expected_turn=stale)
            await first
            return second

    second = asyncio.run(run())

    assert second is game
    assert turn_label(game) == "Fall 1901 Movement"


def test_phases_nobody_waits_for_chain_inside_the_lock_without_deadlock():
    game_id = _seated_game()
    # Germany dislodges Russia, who nobody plays: the Retreats phase has no one to wait for.
    _dislodge_russia_in_silesia(game_id)
    game = GAMES[game_id]
    game.finalized_powers = [Power.FRANCE, Power.GERMANY]

    async def run():
        with _slow_persist():
            await asyncio.wait_for(execute_adjudication(game), timeout=10)

    asyncio.run(run())

    assert turn_label(game) == "Fall 1901 Movement"
    assert [h.phase for h in GAME_HISTORY[game_id]] == ["Movement", "Retreats"]


def test_each_game_has_its_own_lock_and_eviction_forgets_it():
    from storage.store import evict_game

    first, second = _seated_game(), _seated_game()

    async def run():
        from storage.store import adjudication_lock

        assert adjudication_lock(first) is adjudication_lock(first)
        assert adjudication_lock(first) is not adjudication_lock(second)

    asyncio.run(run())
    assert first in ADJUDICATION_LOCKS
    evict_game(first)
    assert first not in ADJUDICATION_LOCKS
