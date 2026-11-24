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
from storage.press import press_of
from storage.profiles import resolve_participant_name
from storage.store import GAME_HISTORY, GAME_PRESS, GAME_SUMMARIES, is_private_sandbox, resolve_game
from storage.supabase import SupabaseUnavailable

router = APIRouter(tags=["Turn History"])


async def _resolve_accessible_history(
    game_id: str | None,
    current_user: AuthUser | None,
    passcode: str | None,
    client: str,
) -> tuple[GameState, list[GameState]]:
    """The current game and the snapshots of it the caller may see, oldest first.

    Each snapshot was taken just before its phase resolved, so the current phase is never among
    them and every order in them is public. A private sandbox is the exception: its snapshots hold
    its owner's live orders for the match's current turn, so no one is ever served them.
    """
    if is_private_sandbox(game_id):
        raise HTTPException(status_code=404, detail="A private sandbox has no shared history.")
    game = await resolve_game(game_id)
    require_view_access(game.game_id, current_user, passcode, client=client)
    return game, GAME_HISTORY.get(game.game_id, [])


@router.get(
    "/api/history",
    response_model=list[TurnHistoryEntry],
    summary="List Resolved Turns",
    description="The phases of a game that have resolved, oldest first (up to the last 30).",
)
async def list_turn_history(
    request: Request,
    game_id: str | None = Query(default=None),
    x_passcode: str | None = Header(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    _, history = await _resolve_accessible_history(
        game_id, current_user, x_passcode, client_address(request)
    )
    return [
        TurnHistoryEntry(index=i, season=snap.season, year=snap.year, phase=snap.phase)
        for i, snap in enumerate(history)
    ]


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
    game, history = await _resolve_accessible_history(
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
    return compute_campaign_stats(
        history, game, player_names=player_names, press_messages=press_messages
    )


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
    _, history = await _resolve_accessible_history(
        game_id, current_user, x_passcode, client_address(request)
    )
    if not 0 <= index < len(history):
        raise HTTPException(status_code=404, detail=f"No resolved turn at index {index}.")
    snap = history[index]
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
