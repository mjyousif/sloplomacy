"""Request and response bodies for the HTTP API and WebSocket messages."""

from domain.board import Power, ProvinceInfo, UnitType
from domain.game_state import GameState, MultiplayerGameSummary, TimerChoice
from domain.issues import ValidationIssue
from domain.orders import Order
from pydantic import BaseModel


class OrderSubmissionRequest(BaseModel):
    power: Power
    orders: list[Order]


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


class GameBootstrapResponse(BaseModel):
    state: GameState
    provinces: dict[str, ProvinceInfo]
    summary: MultiplayerGameSummary | None = None
