"""
Rules of the multiplayer phase clock (GitHub issue #41).

A Movement phase opens with a vote on its length. Retreats and Adjustments run a fixed clock
without one. The clock never holds a phase back: a phase still resolves as soon as everyone has
finalized.

These functions only change a game's `timer` and never wait or touch the network, so main.py owns
saving, broadcasting and resolving. Expiry is driven by the requests clients already make rather
than a background task, because Cloud Run scales to zero and only gives a service CPU during a
request.
"""

from collections import Counter
from typing import Dict, List, Optional

from models import GameState, PhaseTimer, Power, TimerChoice, TimerStage

VOTE_WINDOW_SECONDS = 60
FIXED_PHASE_MINUTES = 5  # Retreats and Adjustments
EXTENSION_MINUTES = 5

# Longest last, because a tied vote goes to the longer option and a pause is the longest of all.
CHOICES_BY_LENGTH = [TimerChoice.MIN_15, TimerChoice.MIN_20, TimerChoice.MIN_30, TimerChoice.PAUSE]


def tally_votes(votes: Dict[Power, TimerChoice]) -> TimerChoice:
    """Most votes wins and a tie goes to the longer option. Nobody voting pauses the game."""
    if not votes:
        return TimerChoice.PAUSE
    counts = Counter(votes.values())
    return max(
        CHOICES_BY_LENGTH, key=lambda choice: (counts[choice], CHOICES_BY_LENGTH.index(choice))
    )


def open_vote(players: List[Power], now: float) -> PhaseTimer:
    return PhaseTimer(stage=TimerStage.VOTING, deadline=now + VOTE_WINDOW_SECONDS, players=players)


def start_phase_clock(game: GameState, players: List[Power], now: float) -> None:
    """Set the clock for the phase the game has just entered."""
    if game.winner or not players:
        game.timer = None
    elif game.phase == "Movement":
        game.timer = open_vote(players, now)
    else:
        game.timer = PhaseTimer(
            stage=TimerStage.RUNNING,
            deadline=now + FIXED_PHASE_MINUTES * 60,
            minutes=FIXED_PHASE_MINUTES,
            players=players,
        )


def close_vote(timer: PhaseTimer, now: float) -> None:
    """End the vote, which starts the clock or pauses the game."""
    choice = tally_votes(timer.votes)
    if choice == TimerChoice.PAUSE:
        timer.stage = TimerStage.PAUSED
        timer.deadline = None
        timer.minutes = None
    else:
        timer.stage = TimerStage.RUNNING
        timer.minutes = int(choice.value)
        timer.deadline = now + timer.minutes * 60


def settle_timer(game: GameState, players: List[Power], now: float) -> None:
    """
    Apply whatever the current players have now agreed.

    Runs after every vote, click and change of players, so that someone leaving can complete a
    vote, a ready-up or an extension the others were waiting on them for.
    """
    timer = game.timer
    if timer is None:
        return
    timer.players = players
    timer.votes = {power: choice for power, choice in timer.votes.items() if power in players}
    timer.extend_requests = [power for power in timer.extend_requests if power in players]
    timer.ready_powers = [power for power in timer.ready_powers if power in players]

    if timer.stage == TimerStage.VOTING:
        if all(power in timer.votes for power in players):
            close_vote(timer, now)
    elif timer.stage == TimerStage.PAUSED:
        if all(power in timer.ready_powers for power in players):
            game.timer = open_vote(players, now)
    elif len(timer.extend_requests) >= timer.extensions_needed:
        # A request can land just after the deadline, before anything has noticed it passed.
        timer.deadline = max(timer.deadline or now, now) + EXTENSION_MINUTES * 60
        timer.extend_requests = []


def has_expired(timer: Optional[PhaseTimer], now: float) -> bool:
    return bool(timer and timer.deadline is not None and now >= timer.deadline)
