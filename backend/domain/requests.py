"""Request and response bodies for the HTTP API and WebSocket messages."""

from typing import Literal

from domain.board import Power, ProvinceInfo, Unit, UnitType
from domain.game_state import GameState, MultiplayerGameSummary, TimerChoice, TurnHistoryEntry
from domain.issues import ValidationIssue
from domain.orders import Order
from pydantic import BaseModel, Field


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
    snapshot_index: int | None = None
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


class AdminAcknowledgeRequest(BaseModel):
    entry_ids: list[str] | None = None
    user_id: str | None = None
    email: str | None = None
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
    user_id: str | None = None
    email: str | None = None


class AdminStatusResponse(BaseModel):
    is_creator: bool
    can_rollback: bool
    history_count: int
    history_entries: list[TurnHistoryEntry] = Field(default_factory=list)
    creator_email: str
    creator_id: str | None = None


class WebSocketGameUpdate(BaseModel):
    type: Literal["game_update"] = "game_update"
    game_id: str
    state: GameState
    summary: MultiplayerGameSummary | None = None


class WebSocketLobbyUpdate(BaseModel):
    type: Literal["lobby_update"] = "lobby_update"
    games: list[MultiplayerGameSummary]


class WebSocketPong(BaseModel):
    type: Literal["pong"] = "pong"


class WebSocketAuthMessage(BaseModel):
    type: Literal["auth"] = "auth"
    token: str | None = None


class WebSocketPingMessage(BaseModel):
    type: Literal["ping"] = "ping"


class WebSocketRefreshMessage(BaseModel):
    type: Literal["refresh"] = "refresh"


class DeleteGameResponse(BaseModel):
    status: str
    game_id: str


class AdminAcknowledgeResponse(BaseModel):
    ok: bool
    acknowledged_by: str


class AcknowledgeGameOverResponse(BaseModel):
    ok: bool
    game_over_seen_at: str | None = None
    summary: MultiplayerGameSummary | None = None


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
