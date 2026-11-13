"""Account profile management: updating public username and syncing active games."""

from domain.requests import UpdateProfileRequest, UpdateProfileResponse
from fastapi import APIRouter, Depends, HTTPException
from security.auth import AuthUser, get_current_user
from storage import supabase
from storage.lobby import is_public_listing
from storage.store import (
    GAME_SUMMARIES,
    GAMES,
    PRIVATE_SANDBOXES,
    PROFILE_NAMES,
    persist_game,
)
from ws.connection_manager import broadcast_game_update, broadcast_lobby_update

router = APIRouter(tags=["Account"])

MIN_USERNAME_LEN = 2
MAX_USERNAME_LEN = 24


def normalize_display_name(raw: str) -> str:
    """Trim and collapse whitespace; enforce 2..24 character bounds."""
    clean = " ".join((raw or "").split())
    if len(clean) < MIN_USERNAME_LEN or len(clean) > MAX_USERNAME_LEN:
        raise HTTPException(
            status_code=422,
            detail=f"Username must be between {MIN_USERNAME_LEN} and {MAX_USERNAME_LEN} characters.",
        )
    return clean


@router.patch(
    "/api/account/profile",
    response_model=UpdateProfileResponse,
    summary="Update Account Display Name",
)
async def update_account_profile(
    req: UpdateProfileRequest,
    current_user: AuthUser | None = Depends(get_current_user),
):
    if not current_user or not current_user.is_authenticated:
        raise HTTPException(status_code=401, detail="Authentication required.")

    clean_name = normalize_display_name(req.display_name)
    PROFILE_NAMES[current_user.user_id] = clean_name
    await supabase.upsert_profile_display_name(current_user.user_id, clean_name)

    updated_games = 0
    public_lobby_touched = False

    for gid, summary in list(GAME_SUMMARIES.items()):
        changed = False
        for part in summary.participants.values():
            if part.user_id == current_user.user_id and part.display_name != clean_name:
                part.display_name = clean_name
                changed = True
        if not changed:
            continue

        updated_games += 1
        if is_public_listing(gid, summary):
            public_lobby_touched = True

        if gid in GAMES:
            await persist_game(gid)
            if gid not in PRIVATE_SANDBOXES and not summary.is_draft:
                await broadcast_game_update(gid, GAMES[gid], summary)

    if public_lobby_touched:
        await broadcast_lobby_update()

    return UpdateProfileResponse(
        status="ok",
        display_name=clean_name,
        updated_games=updated_games,
    )
