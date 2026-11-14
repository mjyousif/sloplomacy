"""FastAPI router for the lobby browser: paged public matches and the caller's own games."""

from typing import Literal

from api.games import refresh_lobby_summaries
from domain.board import Power
from domain.game_state import MultiplayerGameSummary
from domain.requests import LobbyBrowsePage
from fastapi import APIRouter, Depends, HTTPException, Query
from security.auth import AuthUser, get_current_user
from security.secrecy import sanitize_summary_for_viewer
from storage.lobby import browse, public_summaries, summaries_for_user

router = APIRouter(tags=["Lobby & Match Management"])

MAX_PAGE_SIZE = 50


def _parse_countries(raw: str | None) -> list[Power]:
    if not raw:
        return []
    try:
        return [Power(c.strip().upper()) for c in raw.split(",") if c.strip()]
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Unknown country in '{raw}'.") from exc


@router.get(
    "/api/games/browse",
    response_model=LobbyBrowsePage,
    summary="Browse Public Games",
)
async def browse_games(
    seats: Literal["open", "full", "all"] = "open",
    countries: str | None = Query(None, description="Comma-separated powers that must be open"),
    turn_op: Literal["at", "before", "after"] | None = None,
    season: Literal["Spring", "Fall", "Winter"] | None = None,
    year: int | None = Query(None, ge=1901, le=3000),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=MAX_PAGE_SIZE),
):
    """Public matches only, without emails or user ids. Open games first, then most recently played."""
    await refresh_lobby_summaries()
    return browse(
        public_summaries(),
        seats=seats,
        countries=_parse_countries(countries),
        turn_op=turn_op,
        season=season,
        year=year,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/api/games/mine",
    response_model=list[MultiplayerGameSummary],
    summary="List My Games",
)
async def list_my_games(current_user: AuthUser | None = Depends(get_current_user)):
    """Every game the signed-in caller holds a seat in or saved, private campaigns included."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Sign in to list your games.")
    await refresh_lobby_summaries()
    return [sanitize_summary_for_viewer(s) for s in summaries_for_user(current_user.user_id)]
