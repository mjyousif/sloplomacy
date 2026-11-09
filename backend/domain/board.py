"""The pieces of the board: powers, provinces and units."""

from enum import Enum

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
