"""Request and response bodies for the HTTP API and WebSocket messages."""

from domain.board import Power, ProvinceInfo, Unit
from domain.game_state import GameState, MultiplayerGameSummary, TimerChoice, TurnHistoryEntry
from domain.issues import ValidationIssue
from domain.orders import Order
from pydantic import BaseModel, Field, model_validator


class OrderSubmissionRequest(BaseModel):
    power: Power
    orders: list[Order]
    turn: str | None = None  # See SingleOrderUpdateRequest.turn


class SetPowerRequest(BaseModel):
    power: Power


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
    choice: TimerChoice = Field(pattern=r"^(pause|[1-9][0-9]{0,5})$")


class TimerDeadlineRequest(BaseModel):
    """
    The host sets when the clock runs out (issue #393). Give exactly one: how long is left from
    now, a change to the running deadline, or a wall-clock Unix time.
    """

    seconds_left: float | None = None
    adjust_seconds: float | None = None
    deadline: float | None = None

    @model_validator(mode="after")
    def _exactly_one(self) -> "TimerDeadlineRequest":
        given = [
            v for v in (self.seconds_left, self.adjust_seconds, self.deadline) if v is not None
        ]
        if len(given) != 1:
            raise ValueError("Give exactly one of seconds_left, adjust_seconds or deadline.")
        return self


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


class CreateGameRequest(BaseModel):
    name: str
    creator_power: Power
    user_id: str = "guest"
    display_name: str | None = None
    is_private: bool = False
    passcode: str | None = None


class JoinGameRequest(BaseModel):
    power: Power
    user_id: str = "guest"
    display_name: str | None = None
    passcode: str | None = None


class LeaveGameRequest(BaseModel):
    user_id: str
    power: Power | None = None


class SurrenderRequest(BaseModel):
    power: Power
    user_id: str
    leave: bool = True


class SaveSandboxRequest(BaseModel):
    name: str
    user_id: str
    display_name: str | None = None


class AuthUser(BaseModel):
    user_id: str
    is_authenticated: bool = True


class AdminRollbackRequest(BaseModel):
    snapshot_index: int | None = None


class AdminSetTurnRequest(BaseModel):
    season: str
    year: int
    phase: str


class AdminAcknowledgeRequest(BaseModel):
    entry_ids: list[str] | None = None
    power: Power | None = None


class AdminBatchBoardEditRequest(BaseModel):
    expected_revision: int
    expected_season: str
    expected_year: int
    expected_phase: str
    units: list[Unit]
    ownership: dict[str, Power]
    orders: dict[str, Order] | None = None
    summary_lines: list[str] | None = None


class AdminStatusResponse(BaseModel):
    is_creator: bool
    can_rollback: bool
    history_count: int
    history_entries: list[TurnHistoryEntry] = Field(default_factory=list)
    creator_id: str | None = None


class GameBootstrapResponse(BaseModel):
    state: GameState
    provinces: dict[str, ProvinceInfo]
    summary: MultiplayerGameSummary | None = None


class LobbyGameRow(BaseModel):
    """One public game in the lobby browser. It names players only by display name, never email."""

    game_id: str
    name: str
    status: str
    season: str
    year: int
    phase: str
    host_name: str
    created_at: str
    last_moved_at: str
    claimed_powers: list[Power]
    open_powers: list[Power]


class LobbyBrowsePage(BaseModel):
    games: list[LobbyGameRow]
    total: int
    page: int
    page_size: int


class UpdateProfileRequest(BaseModel):
    display_name: str


class UpdateProfileResponse(BaseModel):
    status: str
    display_name: str
    updated_games: int
