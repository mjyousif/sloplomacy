"""The clock's pure rules: counting votes and how many players an extension needs."""

import pytest
from domain.board import Power
from domain.game_state import PhaseTimer, TimerStage
from engine.phase_timer import (
    tally_votes,
)

ALL_POWERS = ["FRANCE", "ENGLAND", "GERMANY", "ITALY", "AUSTRIA", "RUSSIA", "TURKEY"]


@pytest.mark.parametrize(
    "votes, expected",
    [
        ({}, "pause"),
        ({Power.FRANCE: "15"}, "15"),
        # Most votes wins without needing more than half of them.
        (
            {
                Power.FRANCE: "15",
                Power.ENGLAND: "15",
                Power.GERMANY: "15",
                Power.ITALY: "20",
                Power.AUSTRIA: "20",
                Power.RUSSIA: "30",
                Power.TURKEY: "30",
            },
            "15",
        ),
        # Ties go to the longer option.
        ({Power.FRANCE: "15", Power.ENGLAND: "20"}, "20"),
        ({Power.FRANCE: "20", Power.ENGLAND: "30"}, "30"),
        ({Power.FRANCE: "30", Power.ENGLAND: "pause"}, "pause"),
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
