"""Matches as a whole: the lobby list, creating, loading, deleting, and saving sandboxes."""

import uuid
from datetime import datetime, timezone

from domain.board import Power
from domain.game_state import GameParticipant, MultiplayerGameSummary
from domain.requests import CreateGameRequest, GameBootstrapResponse, SaveSandboxRequest
from engine.order_utils import (
    refresh_diagnostics_and_simulation,
)
from engine.topology.provinces import PROVINCES
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from scenarios.presets import build_scenario
from security.auth import AuthUser, get_current_user
from security.secrecy import (
    require_view_access,
    sanitize_game_state_for_viewer,
    viewer_power_for,
)
from storage import supabase
from storage.store import (
    DEFAULT_GAME_ID,
    GAME_HISTORY,
    GAME_PASSCODES,
    GAME_SUMMARIES,
    GAMES,
    SANDBOX_CHECKPOINTS,
    UNSAVED_GAMES,
    cache_loaded_game,
    check_game_capacity,
    evict_game,
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


async def sync_lobby_with_db() -> None:
    unsaved_at_read = set(UNSAVED_GAMES)
    try:
        db_summaries = await supabase.load_all_summaries_from_db()
    except SupabaseUnavailable:
        return

    evicted = False
    for gid in list(GAME_SUMMARIES.keys()):
        if gid not in db_summaries and gid not in unsaved_at_read and gid not in UNSAVED_GAMES:
            evict_game(gid)
            evicted = True

    for gid, summary in db_summaries.items():
        if gid not in GAMES:
            GAME_SUMMARIES[gid] = summary

    if evicted:
        await manager.broadcast_lobby()


@router.get(
    "/api/games",
    response_model=list[MultiplayerGameSummary],
    summary="List Games",
)
async def list_games():
    GAME_SUMMARIES.pop(DEFAULT_GAME_ID, None)
    GAME_SUMMARIES.pop("proto_1901", None)
    if supabase.is_persistence_enabled():
        await sync_lobby_with_db()

    for gid in list(GAME_SUMMARIES.keys()):
        if gid not in (DEFAULT_GAME_ID, "proto_1901"):
            sync_summary(gid)
    return [
        s
        for gid, s in GAME_SUMMARIES.items()
        if gid not in (DEFAULT_GAME_ID, "proto_1901") and not s.is_draft
    ]


@router.get(
    "/api/games/{game_id}",
    response_model=MultiplayerGameSummary,
    summary="Get Game Lobby Details",
)
async def get_game_details(game_id: str):
    if supabase.is_persistence_enabled():
        unsaved_at_read = game_id in UNSAVED_GAMES
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
            elif not unsaved_at_read and game_id not in UNSAVED_GAMES:
                evict_game(game_id)

    sync_summary(game_id)
    summary = GAME_SUMMARIES.get(game_id)
    if not summary:
        raise HTTPException(status_code=404, detail=f"Game lobby '{game_id}' not found.")
    return summary


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
            if not user or (
                user.user_id != summary.creator_id and user.email != summary.created_by
            ):
                raise HTTPException(
                    status_code=403, detail="Only the host can delete this campaign."
                )

    evict_game(game_id)
    if supabase.is_persistence_enabled():
        await supabase.delete_game_from_db(game_id)

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
    effective_email = (current_user.email or req.email) if current_user else req.email
    display_name = req.display_name or effective_email.split("@")[0]
    participant = GameParticipant(
        user_id=effective_user_id,
        email=effective_email,
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
        created_by=effective_email,
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
    return summary


@router.post(
    "/api/games/solo-sandbox",
    response_model=GameBootstrapResponse,
    summary="Create Personal Solo Sandbox",
)
async def create_solo_sandbox(
    current_user: AuthUser | None = Depends(get_current_user),
):
    check_game_capacity()
    gid = f"solo_{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    game_state = build_scenario("standard_1901", Power.FRANCE, gid)
    GAMES[gid] = game_state
    SANDBOX_CHECKPOINTS[gid] = None
    GAME_HISTORY[gid] = []

    effective_user_id = current_user.user_id if current_user else "guest"
    effective_email = (
        (current_user.email or "guest@diplomacy.local") if current_user else "guest@diplomacy.local"
    )
    display_name = effective_email.split("@")[0]
    summary = MultiplayerGameSummary(
        game_id=gid,
        name=f"Draft Tactical Sandbox ({game_state.season} {game_state.year})",
        status="active",
        season=game_state.season,
        year=game_state.year,
        phase=game_state.phase,
        created_by=effective_email,
        creator_id=effective_user_id,
        created_at=now_iso,
        participants={
            Power.FRANCE.value: GameParticipant(
                user_id=effective_user_id,
                email=effective_email,
                display_name=display_name,
                power=Power.FRANCE,
                joined_at=now_iso,
            )
        },
        finalized_powers=[],
        is_sandbox=True,
        is_draft=True,
    )
    GAME_SUMMARIES[gid] = summary
    await persist_game(gid)
    return GameBootstrapResponse(
        state=game_state,
        provinces=PROVINCES,
        summary=summary,
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
    effective_email = (current_user.email or req.email) if current_user else req.email
    display_name = req.display_name or effective_email.split("@")[0]

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
        existing_summary.created_by = effective_email
        existing_summary.participants[source_game.active_power.value] = GameParticipant(
            user_id=effective_user_id,
            email=effective_email,
            display_name=display_name,
            power=source_game.active_power,
            joined_at=now_iso,
        )
        sync_summary(gid)
        await persist_game(gid)
        await broadcast_lobby_update()
        return existing_summary

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
        created_by=effective_email,
        creator_id=effective_user_id,
        created_at=now_iso,
        participants={
            cloned_state.active_power.value: GameParticipant(
                user_id=effective_user_id,
                email=effective_email,
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
    return summary


@router.get(
    "/api/game",
    response_model=GameBootstrapResponse,
    summary="Get Game State",
)
async def get_game(
    game_id: str | None = Query(default=None),
    power: Power | None = Query(default=None),
    passcode: str | None = Query(default=None),
    x_passcode: str | None = Header(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    from api.turns import tick_timer

    game = await resolve_game(game_id)
    await tick_timer(game)
    refresh_diagnostics_and_simulation(game)
    gid = game.game_id
    sync_summary(gid)
    summary = GAME_SUMMARIES.get(gid)

    require_view_access(gid, current_user, passcode or x_passcode)

    viewer_power = viewer_power_for(gid, current_user, power)

    return GameBootstrapResponse(
        state=sanitize_game_state_for_viewer(game, viewer_power),
        provinces=PROVINCES,
        summary=summary,
    )
