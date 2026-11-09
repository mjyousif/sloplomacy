"""Orders and what adjudicating them produced."""

from enum import Enum
from typing import Any

from domain.board import Power, Unit, UnitType
from pydantic import BaseModel


class OrderType(str, Enum):
    HOLD = "HOLD"
    MOVE = "MOVE"
    SUPPORT = "SUPPORT"
    CONVOY = "CONVOY"
    BUILD = "BUILD"
    DISBAND = "DISBAND"
    WAIVE = "WAIVE"
    RETREAT = "RETREAT"


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
