"""FastAPI router for turn history: every resolved phase of a game, with all orders and outcomes."""

from domain.models import GameState, TurnHistoryEntry, TurnRecord
from engine.adjudicator import adjudicate_turn
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from security.auth import AuthUser, get_current_user
from security.secrecy import require_view_access
from storage.store import GAME_HISTORY, PRIVATE_SANDBOXES, resolve_game

router = APIRouter(tags=["Turn History"])


async def _history_for(
    game_id: str | None,
    current_user: AuthUser | None,
    passcode: str | None,
) -> list[GameState]:
    """The snapshots of a game the caller may see, oldest first.

    Each snapshot was taken just before its phase resolved, so the current phase is never among
    them and every order in them is public. A private sandbox is the exception: its snapshots hold
    its owner's live orders for the match's current turn, so no one is ever served them.
    """
    if game_id and (game_id.startswith("sbx_") or game_id in PRIVATE_SANDBOXES):
        raise HTTPException(status_code=404, detail="A private sandbox has no shared history.")
    game = await resolve_game(game_id)
    require_view_access(game.game_id, current_user, passcode)
    return GAME_HISTORY.get(game.game_id, [])


@router.get(
    "/api/history",
    response_model=list[TurnHistoryEntry],
    summary="List Resolved Turns",
    description="The phases of a game that have resolved, oldest first (up to the last 30).",
)
async def list_turn_history(
    game_id: str | None = Query(default=None),
    passcode: str | None = Query(default=None),
    x_passcode: str | None = Header(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    history = await _history_for(game_id, current_user, passcode or x_passcode)
    return [
        TurnHistoryEntry(index=i, season=snap.season, year=snap.year, phase=snap.phase)
        for i, snap in enumerate(history)
    ]


@router.get(
    "/api/history/{index}",
    response_model=TurnRecord,
    summary="Get a Resolved Turn",
    description="A resolved phase as it began, with every power's orders and how each one resolved.",
)
async def get_turn_record(
    index: int,
    game_id: str | None = Query(default=None),
    passcode: str | None = Query(default=None),
    x_passcode: str | None = Header(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    history = await _history_for(game_id, current_user, passcode or x_passcode)
    if not 0 <= index < len(history):
        raise HTTPException(status_code=404, detail=f"No resolved turn at index {index}.")
    snap = history[index]
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
