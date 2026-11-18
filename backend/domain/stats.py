"""Campaign statistics and War Ledger domain models."""

from domain.board import Power
from pydantic import BaseModel, Field


class PowerStats(BaseModel):
    """Aggregated tactical, diplomatic, and logistics statistics for a single Great Power."""

    power: Power
    player_name: str | None = None
    is_eliminated: bool = False
    is_surrendered: bool = False
    current_scs: int = 0
    peak_scs: int = 0
    scs_captured: int = 0
    scs_lost: int = 0
    units_built: int = 0
    armies_built: int = 0
    fleets_built: int = 0
    units_disbanded: int = 0
    units_destroyed: int = 0
    enemies_dislodged: int = 0
    builds_waived: int = 0
    foreign_supports_given: int = 0
    foreign_supports_effective: int = 0
    foreign_supports_received: int = 0
    foreign_convoys: int = 0
    convoys_executed: int = 0
    supports_cut: int = 0
    moves_succeeded: int = 0
    moves_bounced: int = 0
    move_success_rate: float = 0.0
    self_bounces: int = 0


class SCTimelinePoint(BaseModel):
    """Supply center counts per power at a single season/year checkpoint."""

    label: str
    season: str
    year: int
    counts: dict[Power, int] = Field(default_factory=dict)


class CampaignAward(BaseModel):
    """Notable end-of-campaign superlative awarded from the War Ledger."""

    id: str
    title: str
    subtitle: str
    power: Power
    value: str
    count: int


class CampaignStatsResponse(BaseModel):
    """Complete War Ledger payload derived from resolved game history."""

    game_id: str
    turns_resolved: int = 0
    powers: dict[Power, PowerStats] = Field(default_factory=dict)
    sc_timeline: list[SCTimelinePoint] = Field(default_factory=list)
    support_matrix: dict[Power, dict[Power, int]] = Field(default_factory=dict)
    attack_matrix: dict[Power, dict[Power, int]] = Field(default_factory=dict)
    awards: list[CampaignAward] = Field(default_factory=list)
