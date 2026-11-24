"""Matches as a whole: the lobby list, creating, loading, deleting, and saving sandboxes."""

import asyncio
import time
import uuid
from datetime import datetime, timezone

from api.solo_sandbox_helpers import create_or_resume_solo_sandbox
from domain.board import Power
from domain.game_state import GameParticipant, MultiplayerGameSummary
from domain.requests import CreateGameRequest, GameBootstrapResponse, SaveSandboxRequest
from engine import turn_service
from engine.order_utils import (
    refresh_diagnostics_and_simulation,
)
from engine.topology.provinces import PROVINCES
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from scenarios.presets import build_scenario
from security.auth import AuthUser, get_current_user
from security.creator import is_creator
from security.passcode import client_address
from security.secrecy import (
    require_view_access,
    sanitize_game_state_for_viewer,
    sanitize_summary_for_viewer,
    viewer_power_for,
)
from storage import supabase
from storage.lobby import public_summaries
from storage.profiles import PROFILE_NAMES, ensure_profile_loaded, resolve_display_name
from storage.store import (
    DEFAULT_GAME_ID,
    GAME_HISTORY,
    GAME_PASSCODES,
    GAME_SUMMARIES,
    GAMES,
    SANDBOX_CHECKPOINTS,
    cache_loaded_game,
    check_game_capacity,
    delete_game_everywhere,
    evict_game,
    has_unsaved_work,
    hydrate_summary_profiles,
    load_saved_game,
    persist_game,
    resolve_game,
    sync_summary,
)
from storage.supabase import SupabaseUnavailable
from ws.connection_manager import (
    broadcast_lobby_update,
    manager,
)

router = APIRouter(tags=["Lobby & Match Management"])


_PROFILES_TTL_SECONDS = 60.0
_PROFILES_REFRESHED_AT: float = 0.0


_LOBBY_SYNC: tuple[asyncio.AbstractEventLoop, "asyncio.Task[None]"] | None = None


async def sync_lobby_with_db() -> None:
    """Bring the lobby up to date with Supabase, reading the whole table once however many ask.

    Every `GET /api/games` used to read every row. Callers that arrive while a read is in flight
    now wait for that one: nothing is served from an older answer, so a game deleted by hand is
    still noticed on the next call after the read finishes.
    """
    global _LOBBY_SYNC
    loop = asyncio.get_running_loop()
    if _LOBBY_SYNC is None or _LOBBY_SYNC[0] is not loop or _LOBBY_SYNC[1].done():
        _LOBBY_SYNC = (loop, asyncio.ensure_future(_sync_lobby_once()))
    # Shielded, so a caller that gives up does not cancel the read the others are waiting on.
    await asyncio.shield(_LOBBY_SYNC[1])


async def _sync_lobby_once() -> None:
    global _PROFILES_REFRESHED_AT
    # Only a game this process already knew of before the read can be called deleted by it. One
    # created and saved while the read was in flight is missing from the rows through no fault of
    # its own, and by the time the read returns it is no longer "unsaved" either.
    known_at_read = set(GAME_SUMMARIES)
    unsaved_at_read = {gid for gid in known_at_read if has_unsaved_work(gid)}
    try:
        db_summaries = await supabase.load_all_summaries_from_db()
    except SupabaseUnavailable:
        return

    now = time.monotonic()
    if _PROFILES_REFRESHED_AT == 0.0 or (now - _PROFILES_REFRESHED_AT) >= _PROFILES_TTL_SECONDS:
        try:
            profile_names = await supabase.load_profile_names_from_db()
            if isinstance(profile_names, dict) and profile_names:
                PROFILE_NAMES.update(profile_names)
            _PROFILES_REFRESHED_AT = now
        except Exception as ex:
            supabase.logger.debug("Profile refresh skipped during lobby sync: %s", ex)

    evicted = False
    for gid in list(GAME_SUMMARIES.keys()):
        if (
            gid in known_at_read
            and gid not in db_summaries
            and gid not in unsaved_at_read
            and not has_unsaved_work(gid)
        ):
            evict_game(gid)
            evicted = True

    for gid, summary in db_summaries.items():
        # None is a saved game whose summary cannot be read: withheld, not listed.
        if summary is not None and gid not in GAMES:
            GAME_SUMMARIES[gid] = hydrate_summary_profiles(summary)

    if evicted:
        await manager.broadcast_lobby()


@router.get(
    "/api/games",
    response_model=list[MultiplayerGameSummary],
    summary="List Games",
)
async def list_games():
    """Public matches only. Private campaigns and sandboxes are listed to their players by
    `GET /api/games/mine`."""
    await refresh_lobby_summaries()
    return [sanitize_summary_for_viewer(s) for s in public_summaries()]


async def refresh_lobby_summaries() -> None:
    """Bring the lobby's summaries up to date with Supabase and with the games in memory."""
    GAME_SUMMARIES.pop(DEFAULT_GAME_ID, None)
    if supabase.is_persistence_enabled():
        await sync_lobby_with_db()

    for gid in list(GAME_SUMMARIES.keys()):
        if gid != DEFAULT_GAME_ID:
            sync_summary(gid)


@router.get(
    "/api/games/{game_id}",
    response_model=MultiplayerGameSummary,
    summary="Get Game Lobby Details",
)
async def get_game_details(game_id: str):
    if supabase.is_persistence_enabled():
        known_at_read = game_id in GAME_SUMMARIES or game_id in GAMES
        unsaved_at_read = has_unsaved_work(game_id)
        try:
            loaded = await supabase.load_game_from_db(game_id)
        except SupabaseUnavailable:
            if game_id not in GAME_SUMMARIES:
                raise HTTPException(
                    status_code=503,
                    detail="Saved games are unavailable right now. Please try again shortly.",
                )
        else:
            if loaded is not None:
                cache_loaded_game(game_id, loaded)
            elif known_at_read and not unsaved_at_read and not has_unsaved_work(game_id):
                evict_game(game_id)

    sync_summary(game_id)
    summary = GAME_SUMMARIES.get(game_id)
    if not summary:
        raise HTTPException(status_code=404, detail=f"Game lobby '{game_id}' not found.")
    return sanitize_summary_for_viewer(summary)


@router.delete(
    "/api/games/{game_id}",
    summary="Delete Game",
)
async def delete_game(
    game_id: str,
    user: AuthUser | None = Depends(get_current_user),
):
    if game_id == DEFAULT_GAME_ID:
        raise HTTPException(status_code=403, detail="The shared sandbox board cannot be deleted.")

    summary = GAME_SUMMARIES.get(game_id)
    if not summary and supabase.is_persistence_enabled():
        loaded = await load_saved_game(game_id)
        if loaded:
            _, summary, _, _ = loaded

    if not summary and game_id not in GAMES:
        return {"status": "deleted", "game_id": game_id}

    if summary and not summary.is_sandbox:
        if summary.creator_id and summary.creator_id != "guest":
            if not user or not is_creator(summary, user.user_id):
                raise HTTPException(
                    status_code=403, detail="Only the host can delete this campaign."
                )

    await delete_game_everywhere(game_id)

    await manager.broadcast_lobby()
    return {"status": "deleted", "game_id": game_id}


@router.post(
    "/api/games",
    response_model=MultiplayerGameSummary,
    summary="Create Multiplayer Game",
)
async def create_multiplayer_game(
    req: CreateGameRequest,
    current_user: AuthUser | None = Depends(get_current_user),
):
    check_game_capacity()
    gid = f"mp_{uuid.uuid4().hex[:6]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    game_state = build_scenario("standard_1901", req.creator_power, gid)
    GAMES[gid] = game_state
    SANDBOX_CHECKPOINTS[gid] = None
    GAME_HISTORY[gid] = []

    is_priv = bool(req.is_private)
    clean_passcode = req.passcode.strip() if req.passcode else None
    has_pw = bool(is_priv and clean_passcode)
    if has_pw:
        GAME_PASSCODES[gid] = clean_passcode

    effective_user_id = current_user.user_id if current_user else req.user_id
    await ensure_profile_loaded(effective_user_id)
    display_name = resolve_display_name(effective_user_id, fallback=req.display_name)
    participant = GameParticipant(
        user_id=effective_user_id,
        display_name=display_name,
        power=req.creator_power,
        joined_at=now_iso,
    )
    summary = MultiplayerGameSummary(
        game_id=gid,
        name=req.name.strip() or "1901 Diplomatic Theater",
        status="waiting",
        season=game_state.season,
        year=game_state.year,
        phase=game_state.phase,
        created_by="",
        creator_id=effective_user_id,
        created_at=now_iso,
        participants={req.creator_power.value: participant},
        finalized_powers=[],
        is_sandbox=False,
        is_private=is_priv,
        has_passcode=has_pw,
    )
    GAME_SUMMARIES[gid] = summary
    await persist_game(gid)
    await broadcast_lobby_update()
    return sanitize_summary_for_viewer(summary)


@router.post(
    "/api/games/solo-sandbox",
    response_model=GameBootstrapResponse,
    summary="Create, Export, or Resume Personal Solo Sandbox",
)
async def create_solo_sandbox(
    request: Request,
    resume_game_id: str | None = Query(default=None),
    source_game_id: str | None = Query(default=None),
    x_passcode: str | None = Header(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    return await create_or_resume_solo_sandbox(
        resume_game_id=resume_game_id,
        source_game_id=source_game_id,
        passcode=x_passcode,
        current_user=current_user,
        sync_lobby=sync_lobby_with_db,
        client=client_address(request),
    )


@router.post(
    "/api/games/save-sandbox",
    response_model=MultiplayerGameSummary,
    summary="Save Sandbox to Account",
)
async def save_sandbox_to_account(
    req: SaveSandboxRequest,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    check_game_capacity()
    source_game = await resolve_game(game_id)
    gid = source_game.game_id
    now_iso = datetime.now(timezone.utc).isoformat()

    effective_user_id = current_user.user_id if current_user else req.user_id
    await ensure_profile_loaded(effective_user_id)
    display_name = resolve_display_name(effective_user_id, fallback=req.display_name)

    existing_summary = GAME_SUMMARIES.get(gid)
    if existing_summary and existing_summary.is_sandbox and existing_summary.is_draft:
        chosen_name = (
            req.name.strip()
            or existing_summary.name
            or f"Saved Tactical Sandbox ({source_game.season} {source_game.year})"
        )
        existing_summary.name = chosen_name
        existing_summary.is_draft = False
        existing_summary.creator_id = effective_user_id
        existing_summary.created_by = ""
        existing_summary.participants[source_game.active_power.value] = GameParticipant(
            user_id=effective_user_id,
            display_name=display_name,
            power=source_game.active_power,
            joined_at=now_iso,
        )
        sync_summary(gid)
        await persist_game(gid)
        await broadcast_lobby_update()
        return sanitize_summary_for_viewer(existing_summary)

    new_gid = f"saved_{uuid.uuid4().hex[:8]}"
    visible = sanitize_game_state_for_viewer(
        source_game, viewer_power_for(source_game.game_id, current_user)
    )
    cloned_state = visible.model_copy(deep=True)
    cloned_state.game_id = new_gid
    cloned_state.timer = None
    GAMES[new_gid] = cloned_state
    SANDBOX_CHECKPOINTS[new_gid] = None
    GAME_HISTORY[new_gid] = []

    summary = MultiplayerGameSummary(
        game_id=new_gid,
        name=req.name.strip()
        or f"Saved Tactical Sandbox ({cloned_state.season} {cloned_state.year})",
        status="active",
        season=cloned_state.season,
        year=cloned_state.year,
        phase=cloned_state.phase,
        created_by="",
        creator_id=effective_user_id,
        created_at=now_iso,
        participants={
            cloned_state.active_power.value: GameParticipant(
                user_id=effective_user_id,
                display_name=display_name,
                power=cloned_state.active_power,
                joined_at=now_iso,
            )
        },
        finalized_powers=list(cloned_state.finalized_powers),
        is_sandbox=True,
        is_draft=False,
    )
    GAME_SUMMARIES[new_gid] = summary
    await persist_game(new_gid)
    await broadcast_lobby_update()
    return sanitize_summary_for_viewer(summary)


@router.get(
    "/api/game",
    response_model=GameBootstrapResponse,
    summary="Get Game State",
)
async def get_game(
    request: Request,
    game_id: str | None = Query(default=None),
    power: Power | None = Query(default=None),
    x_passcode: str | None = Header(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await resolve_game(game_id)
    gid = game.game_id
    # Before the clock is ticked, so a caller who may not see the match cannot resolve its turn.
    require_view_access(gid, current_user, x_passcode, client=client_address(request))
    await turn_service.tick_timer(game)
    refresh_diagnostics_and_simulation(game)
    sync_summary(gid)
    summary = GAME_SUMMARIES.get(gid)

    viewer_power = viewer_power_for(gid, current_user, power)

    return GameBootstrapResponse(
        state=sanitize_game_state_for_viewer(game, viewer_power),
        provinces=PROVINCES,
        summary=sanitize_summary_for_viewer(summary) if summary else None,
    )
