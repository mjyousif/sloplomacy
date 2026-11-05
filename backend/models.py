from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


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


class ProvinceInfo(BaseModel):
    id: str
    name: str
    type: ProvinceType
    is_supply_center: bool = False
    home_power: Optional[Power] = None
    coasts: List[str] = Field(default_factory=list)
    army_adj: List[str] = Field(default_factory=list)
    fleet_adj: Dict[str, List[str]] = Field(default_factory=dict)  # key "" or coast like "NC", "SC", "EC"


class Unit(BaseModel):
    id: str
    power: Power
    unit_type: UnitType
    province: str  # Base 3-letter code e.g. "STP", "LON"
    coast: Optional[str] = None  # e.g. "NC", "SC", "EC"
    is_dislodged: bool = False


class Order(BaseModel):
    unit_id: str
    power: Power
    unit_type: UnitType
    origin: str  # Base province e.g. "LON"
    origin_coast: Optional[str] = None
    order_type: OrderType = OrderType.HOLD
    target: Optional[str] = None  # Target province for MOVE, or destination of supported/convoyed unit
    target_coast: Optional[str] = None
    aux_unit_origin: Optional[str] = None  # For SUPPORT or CONVOY: the province of the unit being supported/convoyed
    via_convoy: bool = False
    is_explicit: bool = False  # True if the user explicitly assigned or confirmed this order


class ValidationIssue(BaseModel):
    id: str
    severity: IssueSeverity
    code: IssueCode
    title: str
    message: str
    unit_ids: List[str] = Field(default_factory=list)
    provinces: List[str] = Field(default_factory=list)
    power: Power


class OrderResolution(BaseModel):
    unit_id: str
    origin: str
    order_type: OrderType
    target: Optional[str] = None
    succeeded: bool
    bounced: bool = False
    cut: bool = False
    dislodged: bool = False
    dislodged_by: Optional[str] = None
    attack_strength: int = 1
    defense_strength: int = 1
    reason: str = ""


class SimulationResult(BaseModel):
    resolutions: Dict[str, OrderResolution]
    summary: List[str]
    new_units: List[Unit]
    new_ownership: Dict[str, Power]
    next_season: Optional[str] = None
    next_year: Optional[int] = None
    next_phase: Optional[str] = None
    builds: Optional[Dict[str, Any]] = None
    retreats: Optional[Dict[str, Any]] = None
    winner: Optional[Power] = None  # Set when these orders would end the game


class GameState(BaseModel):
    game_id: str
    season: str  # "Spring", "Fall", or "Winter"
    year: int
    phase: str  # "Movement", "Retreats", or "Adjustments"
    scenario_id: str = "standard_1901"
    active_power: Power = Power.FRANCE
    units: List[Unit]
    orders: Dict[str, Order]  # key: unit_id or order_id
    ownership: Dict[str, Power]  # key: province_id -> Power
    finalized_powers: List[Power] = Field(default_factory=list)
    surrendered_powers: List[Power] = Field(default_factory=list)
    issues: List[ValidationIssue] = Field(default_factory=list)
    last_resolution: Optional[SimulationResult] = None
    turn_history: List[str] = Field(default_factory=list)
    builds: Optional[Dict[str, Any]] = None
    retreats: Optional[Dict[str, Any]] = None
    winner: Optional[Power] = None  # Set once the game has been won; no further turns resolve


class OrderSubmissionRequest(BaseModel):
    power: Power
    orders: List[Order]


class SingleOrderUpdateRequest(BaseModel):
    order: Order
    active_power: Optional[Power] = None


class FinalizeRequest(BaseModel):
    power: Power
    force: bool = False


class FinalizeResponse(BaseModel):
    finalized: bool
    requires_confirmation: bool
    issues: List[ValidationIssue]
    state: GameState


class ScenarioRequest(BaseModel):
    scenario_id: str
    active_power: Optional[Power] = None


class GameParticipant(BaseModel):
    user_id: str
    email: str
    display_name: str
    power: Power
    joined_at: str
    surrendered: bool = False
    surrendered_at: Optional[str] = None


class MultiplayerGameSummary(BaseModel):
    game_id: str
    name: str
    status: str = "waiting"  # "waiting" | "active" | "completed"
    season: str = "Spring"
    year: int = 1901
    phase: str = "Movement"
    created_by: str
    creator_id: Optional[str] = None
    created_at: str
    participants: Dict[str, GameParticipant] = Field(default_factory=dict)
    finalized_powers: List[Power] = Field(default_factory=list)
    surrendered_powers: List[Power] = Field(default_factory=list)
    is_sandbox: bool = False
    is_private: bool = False
    has_passcode: bool = False


class CreateGameRequest(BaseModel):
    name: str
    creator_power: Power
    user_id: str = "guest"
    email: str = "player@diplomacy.local"
    display_name: Optional[str] = None
    is_private: bool = False
    passcode: Optional[str] = None


class JoinGameRequest(BaseModel):
    power: Power
    user_id: str = "guest"
    email: str = "player@diplomacy.local"
    display_name: Optional[str] = None
    passcode: Optional[str] = None


class GenerateAIOrdersRequest(BaseModel):
    powers: Optional[List[Power]] = None
    include_active: bool = False


class LeaveGameRequest(BaseModel):
    user_id: str
    email: Optional[str] = None
    power: Optional[Power] = None


class SurrenderRequest(BaseModel):
    power: Power
    user_id: str
    email: Optional[str] = None
    leave: bool = True


class SaveSandboxRequest(BaseModel):
    name: str
    user_id: str
    email: str = "player@diplomacy.local"
    display_name: Optional[str] = None


class AuthUser(BaseModel):
    user_id: str
    email: Optional[str] = None
    is_authenticated: bool = True


class AdminRollbackRequest(BaseModel):
    user_id: Optional[str] = None
    email: Optional[str] = None


class AdminSetTurnRequest(BaseModel):
    season: str
    year: int
    phase: str
    user_id: Optional[str] = None
    email: Optional[str] = None


class AdminMoveUnitRequest(BaseModel):
    unit_id: str
    new_province: str
    new_coast: Optional[str] = None
    user_id: Optional[str] = None
    email: Optional[str] = None


class AdminSpawnUnitRequest(BaseModel):
    power: Power
    unit_type: UnitType
    province: str
    coast: Optional[str] = None
    user_id: Optional[str] = None
    email: Optional[str] = None


class AdminDestroyUnitRequest(BaseModel):
    unit_id: str
    user_id: Optional[str] = None
    email: Optional[str] = None


class AdminSetOwnershipRequest(BaseModel):
    province: str
    power: Optional[Power] = None
    user_id: Optional[str] = None
    email: Optional[str] = None


class AdminStatusResponse(BaseModel):
    is_creator: bool
    can_rollback: bool
    history_count: int
    creator_email: str
    creator_id: Optional[str] = None


class WebSocketGameUpdate(BaseModel):
    type: str = "game_update"
    game_id: str
    state: GameState
    summary: Optional[MultiplayerGameSummary] = None


class WebSocketLobbyUpdate(BaseModel):
    type: str = "lobby_update"
    games: List[MultiplayerGameSummary]
