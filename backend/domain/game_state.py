"""A game as the server holds it: the board, its clock, its history and its seats."""

import math
import time
from enum import Enum
from typing import Any

from domain.board import Power, Unit
from domain.issues import ValidationIssue
from domain.orders import Order, SimulationResult
from pydantic import BaseModel, Field, computed_field


class TimerStage(str, Enum):
    VOTING = "voting"  # Players choose how long this phase lasts
    RUNNING = "running"  # The phase clock is counting down
    PAUSED = "paused"  # No clock: players ready up to open a new vote


class TimerChoice(str, Enum):
    MIN_15 = "15"
    MIN_20 = "20"
    MIN_30 = "30"
    PAUSE = "pause"


class PhaseTimer(BaseModel):
    """
    The clock of a live multiplayer match. The rules that change it are in phase_timer.py.

    Everything is stored as absolute time, so a restart or an idle server loses nothing.
    """

    stage: TimerStage
    deadline: float | None = None  # Unix time the vote or phase ends; None while paused
    minutes: int | None = None  # Length the running phase was given
    players: list[Power] = Field(default_factory=list)  # Who votes, readies up and extends
    votes: dict[Power, TimerChoice] = Field(default_factory=dict)
    extend_requests: list[Power] = Field(default_factory=list)
    ready_powers: list[Power] = Field(default_factory=list)

    @computed_field
    @property
    def remaining_seconds(self) -> float | None:
        """Time left when this was sent, which lets clients count down without trusting their own clock."""
        if self.deadline is None:
            return None
        return round(max(0.0, self.deadline - time.time()), 1)

    @computed_field
    @property
    def extensions_needed(self) -> int:
        """Players needed to add time: 5 of 7, scaled to however many are playing."""
        return max(1, math.ceil(len(self.players) * 5 / 7))


class ConvoyReach(BaseModel):
    """Provinces a convoy can reach, split by whether this fleet completes the chain now."""

    direct: list[str] = Field(default_factory=list)
    chained: list[str] = Field(default_factory=list)


class SupportOption(BaseModel):
    """A unit this piece can legally support, and where."""

    unit_id: str
    province: str
    hold: bool = False
    moves: list[str] = Field(default_factory=list)


class UnitMoveOptions(BaseModel):
    """
    Everything one unit may be ordered to do this phase, computed by the engine.

    The client only displays it: green for `direct_moves` and `active_convoys`, ocean blue for
    `potential_convoys`, and an outline only for the `potential_convoys` missing from
    `own_fleet_convoys` (they need another power's fleet to agree). In a live match it is rebuilt from the orders the viewer may see, so a
    foreign fleet's hidden convoy order never turns a destination green.
    """

    direct_moves: list[str] = Field(default_factory=list)
    active_convoys: list[str] = Field(default_factory=list)
    potential_convoys: list[str] = Field(default_factory=list)
    own_fleet_convoys: list[str] = Field(default_factory=list)
    convoyable_armies: ConvoyReach | None = None
    convoy_targets: dict[str, ConvoyReach] = Field(default_factory=dict)
    valid_supports: list[SupportOption] = Field(default_factory=list)


class AdminActionLogEntry(BaseModel):
    """Audit log entry for a creator/administrator intervention on a match."""

    id: str
    timestamp: str
    actor: str
    season: str
    year: int
    phase: str
    summary_lines: list[str] = Field(default_factory=list)
    acknowledged_by: list[str] = Field(default_factory=list)


class GameState(BaseModel):
    game_id: str
    season: str  # "Spring", "Fall", or "Winter"
    year: int
    phase: str  # "Movement", "Retreats", "Adjustments", or "Admin" (in history snapshots)
    scenario_id: str = "standard_1901"
    active_power: Power = Power.FRANCE
    units: list[Unit]
    orders: dict[str, Order]  # key: unit_id or order_id
    ownership: dict[str, Power]  # key: province_id -> Power
    finalized_powers: list[Power] = Field(default_factory=list)
    surrendered_powers: list[Power] = Field(default_factory=list)
    issues: list[ValidationIssue] = Field(default_factory=list)
    last_resolution: SimulationResult | None = None
    turn_history: list[str] = Field(default_factory=list)
    builds: dict[str, Any] | None = None
    retreats: dict[str, Any] | None = None
    winner: Power | None = None  # Set once the game has been won; no further turns resolve
    timer: PhaseTimer | None = None  # None until the host starts the clock
    admin_log: list[AdminActionLogEntry] = Field(default_factory=list)
    state_revision: int = 1
    # Per unit id: where it may move, convoy and support. Rebuilt on refresh and load, never saved.
    unit_options: dict[str, UnitMoveOptions] = Field(default_factory=dict)


class TurnHistoryEntry(BaseModel):
    """One resolved phase in a game's history, as the turn selector lists it."""

    index: int  # Position in the game's history, oldest first
    season: str
    year: int
    phase: str


class TurnRecord(TurnHistoryEntry):
    """
    A resolved phase as it began, with every power's orders and what they did.

    Orders are public once their phase has resolved. This holds only what the map needs, so a
    snapshot's clock, log and finalize marks never leave the server.
    """

    units: list[Unit]
    orders: dict[str, Order]
    ownership: dict[str, Power]
    builds: dict[str, Any] | None = None
    retreats: dict[str, Any] | None = None
    resolution: SimulationResult


class GameParticipant(BaseModel):
    user_id: str
    email: str
    display_name: str = "Envoy"
    power: Power
    joined_at: str
    surrendered: bool = False
    surrendered_at: str | None = None
    game_over_seen_at: str | None = None


class MultiplayerGameSummary(BaseModel):
    game_id: str
    name: str
    status: str = "waiting"  # "waiting" | "active" | "completed"
    winner: Power | None = None
    completed_at: str | None = None
    season: str = "Spring"
    year: int = 1901
    phase: str = "Movement"
    created_by: str
    creator_id: str | None = None
    created_at: str
    # When a phase last resolved. None until the first one does; the lobby then uses created_at.
    last_moved_at: str | None = None
    participants: dict[str, GameParticipant] = Field(default_factory=dict)
    finalized_powers: list[Power] = Field(default_factory=list)
    surrendered_powers: list[Power] = Field(default_factory=list)
    is_sandbox: bool = False
    is_draft: bool = False
    is_private: bool = False
    has_passcode: bool = False


FIRST_YEAR = 1901


PHASES_BY_SEASON: dict[str, list[str]] = {
    "Spring": ["Movement", "Retreats"],
    "Fall": ["Movement", "Retreats"],
    "Winter": ["Adjustments"],
}
