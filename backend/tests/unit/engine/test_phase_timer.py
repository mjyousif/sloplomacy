"""The clock's pure rules: counting votes and how many players an extension needs."""

import pytest
from domain.board import Power
from domain.game_state import PhaseTimer, TimerChoice, TimerStage
from engine.phase_timer import (
    tally_votes,
)

ALL_POWERS = ["FRANCE", "ENGLAND", "GERMANY", "ITALY", "AUSTRIA", "RUSSIA", "TURKEY"]


@pytest.mark.parametrize(
    "votes, expected",
    [
        ({}, TimerChoice.PAUSE),
        ({Power.FRANCE: TimerChoice.MIN_15}, TimerChoice.MIN_15),
        # Most votes wins without needing more than half of them.
        (
            {
                Power.FRANCE: TimerChoice.MIN_15,
                Power.ENGLAND: TimerChoice.MIN_15,
                Power.GERMANY: TimerChoice.MIN_15,
                Power.ITALY: TimerChoice.MIN_20,
                Power.AUSTRIA: TimerChoice.MIN_20,
                Power.RUSSIA: TimerChoice.MIN_30,
                Power.TURKEY: TimerChoice.MIN_30,
            },
            TimerChoice.MIN_15,
        ),
        # Ties go to the longer option.
        ({Power.FRANCE: TimerChoice.MIN_15, Power.ENGLAND: TimerChoice.MIN_20}, TimerChoice.MIN_20),
        ({Power.FRANCE: TimerChoice.MIN_20, Power.ENGLAND: TimerChoice.MIN_30}, TimerChoice.MIN_30),
        ({Power.FRANCE: TimerChoice.MIN_30, Power.ENGLAND: TimerChoice.PAUSE}, TimerChoice.PAUSE),
    ],
)
def test_tally_votes(votes, expected):
    assert tally_votes(votes) == expected


@pytest.mark.parametrize(
    "players, needed", [(7, 5), (6, 5), (5, 4), (4, 3), (3, 3), (2, 2), (1, 1)]
)
def test_extension_scales_with_players(players, needed):
    timer = PhaseTimer(stage=TimerStage.RUNNING, players=[Power(p) for p in ALL_POWERS[:players]])
    assert timer.extensions_needed == needed
