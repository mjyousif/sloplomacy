"""
Rules of the multiplayer phase clock (GitHub issues #41 and #393).

A Movement phase opens with a vote on its length. Retreats and Adjustments run a fixed clock
without one. The clock never holds a phase back: a phase still resolves as soon as everyone has
finalized. The lengths come from the match's `timer_settings`, which the host may change, and the
host may also pause, resume, retime or stop the clock (the `host_*` functions below).

These functions only change a game's `timer` and never wait or touch the network, so the routers
own saving, broadcasting and resolving. Expiry is driven by the requests clients already make
rather than a background task, because Cloud Run scales to zero and only gives a service CPU
during a request.
"""

import math
from collections import Counter

from domain.board import Power
from domain.game_state import (
    PAUSE_CHOICE,
    GameState,
    PhaseTimer,
    TimerChoice,
    TimerSettings,
    TimerStage,
)

EXTENSION_MINUTES = 5
# A new match's lengths, before the host changes any (TimerSettings holds the real ones).
VOTE_WINDOW_SECONDS = TimerSettings().vote_window_seconds
FIXED_PHASE_MINUTES = TimerSettings().fixed_phase_minutes  # Retreats and Adjustments


def _length(choice: TimerChoice) -> float:
    """How long a choice runs. A pause is the longest of all."""
    return math.inf if choice == PAUSE_CHOICE else int(choice)


def vote_choices(timer: PhaseTimer) -> list[TimerChoice]:
    """What a vote offers, shortest first and the pause last."""
    return [str(m) for m in sorted(timer.vote_minutes)] + [PAUSE_CHOICE]


def tally_votes(votes: dict[Power, TimerChoice]) -> TimerChoice:
    """Most votes wins and a tie goes to the longer option. Nobody voting pauses the game."""
    if not votes:
        return PAUSE_CHOICE
    counts = Counter(votes.values())
    return max(counts, key=lambda choice: (counts[choice], _length(choice)))


def open_vote(players: list[Power], now: float, settings: TimerSettings) -> PhaseTimer:
    return PhaseTimer(
        stage=TimerStage.VOTING,
        deadline=now + settings.vote_window_seconds,
        players=players,
        vote_minutes=list(settings.vote_minutes),
    )


def start_phase_clock(game: GameState, players: list[Power], now: float) -> None:
    """Set the clock for the phase the game has just entered."""
    settings = game.timer_settings
    if game.winner or not players:
        game.timer = None
    elif game.phase == "Movement":
        game.timer = open_vote(players, now, settings)
    else:
        game.timer = PhaseTimer(
            stage=TimerStage.RUNNING,
            deadline=now + settings.fixed_phase_minutes * 60,
            minutes=settings.fixed_phase_minutes,
            players=players,
            vote_minutes=list(settings.vote_minutes),
        )


def close_vote(timer: PhaseTimer, now: float) -> None:
    """End the vote, which starts the clock or pauses the game."""
    choice = tally_votes(timer.votes)
    if choice == PAUSE_CHOICE:
        timer.stage = TimerStage.PAUSED
        timer.deadline = None
        timer.minutes = None
    else:
        timer.stage = TimerStage.RUNNING
        timer.minutes = int(choice)
        timer.deadline = now + timer.minutes * 60


def settle_timer(game: GameState, players: list[Power], now: float) -> None:
    """
    Apply whatever the current players have now agreed.

    Runs after every vote, click and change of players, so that someone leaving can complete a
    vote, a ready-up or an extension the others were waiting on them for. A host pause is left
    alone: only the host lifts it.
    """
    timer = game.timer
    if timer is None:
        return
    offered = set(vote_choices(timer))
    timer.players = players
    timer.votes = {
        power: choice
        for power, choice in timer.votes.items()
        if power in players and choice in offered
    }
    timer.extend_requests = [power for power in timer.extend_requests if power in players]
    timer.ready_powers = [power for power in timer.ready_powers if power in players]

    if timer.stage == TimerStage.VOTING:
        if all(power in timer.votes for power in players):
            close_vote(timer, now)
    elif timer.stage == TimerStage.PAUSED:
        if not timer.host_paused and all(power in timer.ready_powers for power in players):
            game.timer = open_vote(players, now, game.timer_settings)
    elif len(timer.extend_requests) >= timer.extensions_needed:
        # A request can land just after the deadline, before anything has noticed it passed.
        timer.deadline = max(timer.deadline or now, now) + EXTENSION_MINUTES * 60
        timer.extend_requests = []


def has_expired(timer: PhaseTimer | None, now: float) -> bool:
    return bool(timer and timer.deadline is not None and now >= timer.deadline)


def _clear_requests(timer: PhaseTimer) -> None:
    timer.votes = {}
    timer.extend_requests = []
    timer.ready_powers = []


def host_pause(timer: PhaseTimer) -> None:
    """Stop the clock until the host resumes it. Players cannot ready up out of it."""
    timer.stage = TimerStage.PAUSED
    timer.deadline = None
    timer.minutes = None
    timer.host_paused = True
    _clear_requests(timer)


def host_resume(game: GameState, players: list[Power], now: float) -> None:
    """Lift any pause the way a new phase starts: a fresh vote, or the fixed clock."""
    start_phase_clock(game, players, now)


def host_set_deadline(timer: PhaseTimer, deadline: float, now: float) -> None:
    """
    Run the clock to `deadline`, whatever it was doing. This ends a vote (with no winner), lifts
    a pause and drops any ready-ups, votes and extension requests that no longer apply.
    """
    timer.stage = TimerStage.RUNNING
    timer.deadline = deadline
    timer.minutes = max(1, math.ceil((deadline - now) / 60))
    timer.host_paused = False
    _clear_requests(timer)
