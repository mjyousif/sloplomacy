import math
import time
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, computed_field


class Power(str, Enum):
    AUSTRIA = "AUSTRIA"
    ENGLAND = "ENGLAND"
    FRANCE = "FRANCE"
    GERMANY = "GERMANY"
    ITALY = "ITALY"
    RUSSIA = "RUSSIA"
    TURKEY = "TURKEY"


class UnitType(str, Enum):
    ARMY = "A"
    FLEET = "F"


class ProvinceType(str, Enum):
    LAND = "LAND"
    COAST = "COAST"
    SEA = "SEA"
    IMPASSABLE = "IMPASSABLE"


class OrderType(str, Enum):
    HOLD = "HOLD"
    MOVE = "MOVE"
    SUPPORT = "SUPPORT"
    CONVOY = "CONVOY"
    BUILD = "BUILD"
    DISBAND = "DISBAND"
    WAIVE = "WAIVE"
    RETREAT = "RETREAT"


class IssueSeverity(str, Enum):
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class IssueCode(str, Enum):
    ILLEGAL_MOVE = "ILLEGAL_MOVE"
    ILLEGAL_SUPPORT = "ILLEGAL_SUPPORT"
    ILLEGAL_CONVOY = "ILLEGAL_CONVOY"
    SELF_BOUNCE = "SELF_BOUNCE"
    SELF_OCCUPIED_BOUNCE = "SELF_OCCUPIED_BOUNCE"
    FRIENDLY_FIRE = "FRIENDLY_FIRE"
    UNMATCHED_SUPPORT = "UNMATCHED_SUPPORT"
    BROKEN_CONVOY = "BROKEN_CONVOY"
    UNASSIGNED_UNIT = "UNASSIGNED_UNIT"
    VOID_SUPPORT_SELF = "VOID_SUPPORT_SELF"


class TimerStage(str, Enum):
    VOTING = "voting"  # Players choose how long this phase lasts
    RUNNING = "running"  # The phase clock is counting down
    PAUSED = "paused"  # No clock: players ready up to open a new vote


class TimerChoice(str, Enum):
    MIN_15 = "15"
    MIN_20 = "20"
    MIN_30 = "30"
    PAUSE = "pause"


class ProvinceInfo(BaseModel):
    id: str
    name: str
    type: ProvinceType
    is_supply_center: bool = False
    home_power: Power | None = None
    coasts: list[str] = Field(default_factory=list)
    army_adj: list[str] = Field(default_factory=list)
    fleet_adj: dict[str, list[str]] = Field(
        default_factory=dict
    )  # key "" or coast like "NC", "SC", "EC"


class Unit(BaseModel):
    id: str
    power: Power
    unit_type: UnitType
    province: str  # Base 3-letter code e.g. "STP", "LON"
    coast: str | None = None  # e.g. "NC", "SC", "EC"
    is_dislodged: bool = False


class Order(BaseModel):
    unit_id: str
    power: Power
    unit_type: UnitType
    origin: str  # Base province e.g. "LON"
    origin_coast: str | None = None
    order_type: OrderType = OrderType.HOLD
    target: str | None = None  # Target province for MOVE, or destination of supported/convoyed unit
    target_coast: str | None = None
    aux_unit_origin: str | None = (
        None  # For SUPPORT or CONVOY: the province of the unit being supported/convoyed
    )
    via_convoy: bool = False
    is_explicit: bool = False  # True if the user explicitly assigned or confirmed this order


class ValidationIssue(BaseModel):
    id: str
    severity: IssueSeverity
    code: IssueCode
    title: str
    message: str
    unit_ids: list[str] = Field(default_factory=list)
    provinces: list[str] = Field(default_factory=list)
    power: Power


class OrderResolution(BaseModel):
    unit_id: str
    origin: str
    order_type: OrderType
    target: str | None = None
    succeeded: bool
    bounced: bool = False
    cut: bool = False
    dislodged: bool = False
    dislodged_by: str | None = None
    attack_strength: int = 1
    defense_strength: int = 1
    reason: str = ""


class SimulationResult(BaseModel):
    resolutions: dict[str, OrderResolution]
    summary: list[str]
    new_units: list[Unit]
    new_ownership: dict[str, Power]
    next_season: str | None = None
    next_year: int | None = None
    next_phase: str | None = None
    builds: dict[str, Any] | None = None
    retreats: dict[str, Any] | None = None
    winner: Power | None = None  # Set when these orders would end the game


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


class GameState(BaseModel):
    game_id: str
    season: str  # "Spring", "Fall", or "Winter"
    year: int
    phase: str  # "Movement", "Retreats", or "Adjustments"
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


class OrderSubmissionRequest(BaseModel):
    power: Power
    orders: list[Order]


class SingleOrderUpdateRequest(BaseModel):
    order: Order
    active_power: Power | None = None
    # The turn the player was looking at, e.g. "Spring 1901 Movement". A request for an older
    # turn is refused, because a clock can resolve the phase while it is on its way.
    turn: str | None = None


class FinalizeRequest(BaseModel):
    power: Power
    force: bool = False
    turn: str | None = None  # See SingleOrderUpdateRequest.turn


class TimerVoteRequest(BaseModel):
    power: Power
    choice: TimerChoice


class TimerToggleRequest(BaseModel):
    """Ready up for a paused game, or ask for more time. `active=False` takes it back."""

    power: Power
    active: bool = True


class FinalizeResponse(BaseModel):
    finalized: bool
    requires_confirmation: bool
    issues: list[ValidationIssue]
    state: GameState


class ScenarioRequest(BaseModel):
    scenario_id: str
    active_power: Power | None = None


class SeedScenarioRequest(BaseModel):
    scenario_id: str
    game_id: str | None = None
    active_power: Power | None = None


class GameParticipant(BaseModel):
    user_id: str
    email: str
    display_name: str
    power: Power
    joined_at: str
    surrendered: bool = False
    surrendered_at: str | None = None


class MultiplayerGameSummary(BaseModel):
    game_id: str
    name: str
    status: str = "waiting"  # "waiting" | "active" | "completed"
    season: str = "Spring"
    year: int = 1901
    phase: str = "Movement"
    created_by: str
    creator_id: str | None = None
    created_at: str
    participants: dict[str, GameParticipant] = Field(default_factory=dict)
    finalized_powers: list[Power] = Field(default_factory=list)
    surrendered_powers: list[Power] = Field(default_factory=list)
    is_sandbox: bool = False
    is_private: bool = False
    has_passcode: bool = False


class CreateGameRequest(BaseModel):
    name: str
    creator_power: Power
    user_id: str = "guest"
    email: str = "player@diplomacy.local"
    display_name: str | None = None
    is_private: bool = False
    passcode: str | None = None


class JoinGameRequest(BaseModel):
    power: Power
    user_id: str = "guest"
    email: str = "player@diplomacy.local"
    display_name: str | None = None
    passcode: str | None = None


class GenerateAIOrdersRequest(BaseModel):
    powers: list[Power] | None = None
    include_active: bool = False


class LeaveGameRequest(BaseModel):
    user_id: str
    email: str | None = None
    power: Power | None = None


class SurrenderRequest(BaseModel):
    power: Power
    user_id: str
    email: str | None = None
    leave: bool = True


class SaveSandboxRequest(BaseModel):
    name: str
    user_id: str
    email: str = "player@diplomacy.local"
    display_name: str | None = None


class AuthUser(BaseModel):
    user_id: str
    email: str | None = None
    is_authenticated: bool = True


class AdminRollbackRequest(BaseModel):
    user_id: str | None = None
    email: str | None = None


class AdminSetTurnRequest(BaseModel):
    season: str
    year: int
    phase: str
    user_id: str | None = None
    email: str | None = None


class AdminMoveUnitRequest(BaseModel):
    unit_id: str
    new_province: str
    new_coast: str | None = None
    user_id: str | None = None
    email: str | None = None


class AdminSpawnUnitRequest(BaseModel):
    power: Power
    unit_type: UnitType
    province: str
    coast: str | None = None
    user_id: str | None = None
    email: str | None = None


class AdminDestroyUnitRequest(BaseModel):
    unit_id: str
    user_id: str | None = None
    email: str | None = None


class AdminSetOwnershipRequest(BaseModel):
    province: str
    power: Power | None = None
    user_id: str | None = None
    email: str | None = None


class AdminStatusResponse(BaseModel):
    is_creator: bool
    can_rollback: bool
    history_count: int
    creator_email: str
    creator_id: str | None = None


class WebSocketGameUpdate(BaseModel):
    type: str = "game_update"
    game_id: str
    state: GameState
    summary: MultiplayerGameSummary | None = None


class WebSocketLobbyUpdate(BaseModel):
    type: str = "lobby_update"
    games: list[MultiplayerGameSummary]
