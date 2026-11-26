"""FastAPI router for turn history: every resolved phase of a game, with all orders and outcomes."""

from domain.board import Power
from domain.game_state import GameState, TurnHistoryEntry, TurnRecord
from domain.stats import CampaignStatsResponse
from engine.adjudicator.resolver import adjudicate_turn
from engine.stats import compute_campaign_stats
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from security.auth import AuthUser, get_current_user
from security.passcode import client_address
from security.secrecy import require_view_access
from storage.phases import (
    STATS_CACHE,
    ensure_history_loaded,
    get_phase_snapshot,
    list_phase_entries,
)
from storage.press import press_of
from storage.profiles import resolve_participant_name
from storage.store import (
    GAME_PRESS,
    GAME_SUMMARIES,
    current_phase_count,
    is_private_sandbox,
    resolve_game,
)
from storage.supabase import SupabaseUnavailable

router = APIRouter(tags=["Turn History"])


async def _resolve_accessible_game(
    game_id: str | None,
    current_user: AuthUser | None,
    passcode: str | None,
    client: str,
) -> GameState:
    """Resolve the current game after verifying view access; reject private sandboxes."""
    if is_private_sandbox(game_id):
        raise HTTPException(status_code=404, detail="A private sandbox has no shared history.")
    game = await resolve_game(game_id)
    require_view_access(game.game_id, current_user, passcode, client=client)
    return game


@router.get(
    "/api/history",
    response_model=list[TurnHistoryEntry],
    summary="List Resolved Turns",
    description="All resolved phases of a game, oldest first.",
)
async def list_turn_history(
    request: Request,
    game_id: str | None = Query(default=None),
    x_passcode: str | None = Header(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await _resolve_accessible_game(
        game_id, current_user, x_passcode, client_address(request)
    )
    return await list_phase_entries(game.game_id)


@router.get(
    "/api/history/stats",
    response_model=CampaignStatsResponse,
    summary="Get Campaign Statistics & War Ledger",
    description="Per-power tactical, diplomatic, and logistics statistics derived strictly from resolved turns.",
)
async def get_campaign_stats(
    request: Request,
    game_id: str | None = Query(default=None),
    x_passcode: str | None = Header(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await _resolve_accessible_game(
        game_id, current_user, x_passcode, client_address(request)
    )
    summary = GAME_SUMMARIES.get(game.game_id)
    player_names: dict[Power, str] = {}
    if summary:
        for part in summary.participants.values():
            player_names[part.power] = resolve_participant_name(part)
    press_messages = None
    if game.winner is not None:
        try:
            press_messages = await press_of(game.game_id)
        except SupabaseUnavailable:
            press_messages = GAME_PRESS.get(game.game_id, [])

    # Cache computed campaign stats in memory to avoid re-adjudicating long campaigns on repeat
    # requests (see https://github.com/mjyousif/traitorous/issues/401).
    cache_key = (
        current_phase_count(game.game_id),
        game.board_revision,
        game.winner.value if game.winner else None,
        tuple(sorted((p.value, name) for p, name in player_names.items())),
        tuple(sorted(p.value for p in game.surrendered_powers)),
        len(press_messages) if press_messages is not None else None,
    )
    cached = STATS_CACHE.get(game.game_id)
    if cached is not None and cached[0] == cache_key:
        return cached[1]

    history = await ensure_history_loaded(game.game_id)
    stats = compute_campaign_stats(
        history, game, player_names=player_names, press_messages=press_messages
    )
    STATS_CACHE[game.game_id] = (cache_key, stats)
    return stats


@router.get(
    "/api/history/{index}",
    response_model=TurnRecord,
    summary="Get a Resolved Turn",
    description="A resolved phase as it began, with every power's orders and how each one resolved.",
)
async def get_turn_record(
    index: int,
    request: Request,
    game_id: str | None = Query(default=None),
    x_passcode: str | None = Header(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await _resolve_accessible_game(
        game_id, current_user, x_passcode, client_address(request)
    )
    snap = await get_phase_snapshot(game.game_id, index)
    if snap is None:
        raise HTTPException(status_code=404, detail=f"No resolved turn at index {index}.")
    if snap.phase == "Admin" and snap.admin_resolution is not None:
        resolution = snap.admin_resolution
    else:
        # Adjudication is deterministic, so this is exactly how the phase resolved.
        resolution = adjudicate_turn(
            snap.units,
            snap.orders,
            snap.ownership,
            snap.season,
            snap.year,
            snap.phase,
            retreats=snap.retreats,
        )
    return TurnRecord(
        index=index,
        season=snap.season,
        year=snap.year,
        phase=snap.phase,
        units=snap.units,
        orders=snap.orders,
        ownership=snap.ownership,
        builds=snap.builds,
        retreats=snap.retreats,
        resolution=resolution,
    )
