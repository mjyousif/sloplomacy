"""Validation issues the order checker reports."""

from enum import Enum

from domain.board import Power
from pydantic import BaseModel, Field


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


class ValidationIssue(BaseModel):
    id: str
    severity: IssueSeverity
    code: IssueCode
    title: str
    message: str
    unit_ids: list[str] = Field(default_factory=list)
    provinces: list[str] = Field(default_factory=list)
    power: Power
