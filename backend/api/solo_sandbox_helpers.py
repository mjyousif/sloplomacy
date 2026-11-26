"""Helpers for creating, resuming, overriding, and exporting personal Solo Sandboxes."""

import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

from domain.board import Power
from domain.game_state import GameParticipant, GameState, MultiplayerGameSummary
from domain.requests import GameBootstrapResponse
from engine.order_utils import refresh_diagnostics_and_simulation
from engine.topology.provinces import PROVINCES
from scenarios.presets import build_scenario
from security.auth import AuthUser
from security.creator import is_creator
from security.secrecy import (
    caller_owns_saved_sandbox,
    require_own_seat,
    require_saved_sandbox_owner,
    require_view_access,
    sanitize_game_state_for_viewer,
    sanitize_summary_for_viewer,
    viewer_power_for,
    with_sanitized_admin_log,
)
from storage import supabase
from storage.phases import ensure_history_loaded, replace_all_phases
from storage.profiles import ensure_profile_loaded, resolve_display_name
from storage.store import (
    DEFAULT_GAME_ID,
    GAME_SUMMARIES,
    GAMES,
    PRIVATE_SANDBOXES,
    SANDBOX_CHECKPOINTS,
    check_game_capacity,
    delete_game_everywhere,
    load_saved_game,
    persist_game,
    resolve_game,
    sync_summary,
)


def _draft_belongs_to_user(summary: MultiplayerGameSummary, user: AuthUser) -> bool:
    return is_creator(summary, user.user_id)


def _build_solo_draft_summary(
    gid: str,
    game_state: GameState,
    active_power: Power,
    current_user: AuthUser | None,
) -> MultiplayerGameSummary:
    now_iso = datetime.now(timezone.utc).isoformat()
    effective_user_id = current_user.user_id if current_user else "guest"
    display_name = resolve_display_name(effective_user_id)
    return MultiplayerGameSummary(
        game_id=gid,
        name=f"Draft Tactical Sandbox ({game_state.season} {game_state.year})",
        status="active",
        season=game_state.season,
        year=game_state.year,
        phase=game_state.phase,
        created_by="",
        creator_id=effective_user_id,
        created_at=now_iso,
        participants={
            active_power.value: GameParticipant(
                user_id=effective_user_id,
                display_name=display_name,
                power=active_power,
                joined_at=now_iso,
            )
        },
        finalized_powers=[],
        is_sandbox=True,
        is_draft=True,
    )


async def try_load_draft_sandbox(
    gid: str, current_user: AuthUser | None
) -> tuple[GameState, MultiplayerGameSummary] | None:
    if not gid or gid == DEFAULT_GAME_ID:
        return None
    if gid not in GAMES and supabase.is_persistence_enabled():
        try:
            loaded = await load_saved_game(gid)
            if loaded is not None:
                from storage.store import cache_loaded_game

                cache_loaded_game(gid, loaded)
        except Exception:
            return None
    game = GAMES.get(gid)
    summary = GAME_SUMMARIES.get(gid)
    if not (game and summary and summary.is_sandbox and summary.is_draft):
        return None
    if not caller_owns_saved_sandbox(summary, current_user):
        return None
    if current_user and summary.creator_id in (None, "", "guest"):
        summary.creator_id = current_user.user_id
        summary.created_by = ""
        await persist_game(gid)
    sync_summary(gid)
    return game, summary


async def clear_caller_draft_sandboxes(
    resume_game_id: str | None,
    current_user: AuthUser | None,
    sync_lobby: Callable[[], Awaitable[None]],
) -> None:
    """Evict and delete existing ephemeral draft sandboxes belonging to the caller."""
    draft_ids: set[str] = set()
    if resume_game_id and resume_game_id.strip():
        loaded = await try_load_draft_sandbox(resume_game_id.strip(), current_user)
        if loaded:
            draft_ids.add(loaded[0].game_id)
    if current_user and current_user.user_id and current_user.user_id != "guest":
        if supabase.is_persistence_enabled():
            await sync_lobby()
        for gid_cand, s in list(GAME_SUMMARIES.items()):
            if gid_cand == DEFAULT_GAME_ID:
                continue
            if s.is_sandbox and s.is_draft and _draft_belongs_to_user(s, current_user):
                draft_ids.add(gid_cand)
    for old_gid in draft_ids:
        await delete_game_everywhere(old_gid)


async def export_game_to_solo_sandbox(
    source_game_id: str,
    resume_game_id: str | None,
    passcode: str | None,
    current_user: AuthUser | None,
    sync_lobby: Callable[[], Awaitable[None]],
    client: str,
) -> GameBootstrapResponse:
    """Export an authorized view of `source_game_id` into a new personal draft sandbox."""
    check_game_capacity()
    source = await resolve_game(source_game_id)
    if source.game_id in PRIVATE_SANDBOXES:
        match_id, seat_power = PRIVATE_SANDBOXES[source.game_id]
        require_own_seat(match_id, seat_power, current_user)
        visible = with_sanitized_admin_log(source, current_user).model_copy(deep=True)
        export_power = source.active_power
    else:
        require_saved_sandbox_owner(source.game_id, current_user)
        require_view_access(source.game_id, current_user, passcode, client=client)
        viewer_power = viewer_power_for(source.game_id, current_user)
        visible = sanitize_game_state_for_viewer(source, viewer_power)
        export_power = viewer_power or source.active_power

    source_history = (
        [] if source.game_id in PRIVATE_SANDBOXES else await ensure_history_loaded(source.game_id)
    )
    export_history = [snap.model_copy(deep=True) for snap in source_history]
    await clear_caller_draft_sandboxes(resume_game_id, current_user, sync_lobby)

    gid = f"solo_{uuid.uuid4().hex[:8]}"
    game_state = visible.model_copy(deep=True)
    game_state.game_id = gid
    game_state.active_power = export_power
    game_state.timer = None
    game_state.finalized_powers = []
    refresh_diagnostics_and_simulation(game_state)
    GAMES[gid] = game_state
    SANDBOX_CHECKPOINTS[gid] = None
    replace_all_phases(gid, export_history)

    await ensure_profile_loaded(current_user.user_id if current_user else None)
    summary = _build_solo_draft_summary(gid, game_state, export_power, current_user)
    GAME_SUMMARIES[gid] = summary
    await persist_game(gid)
    return GameBootstrapResponse(
        state=with_sanitized_admin_log(game_state, current_user),
        provinces=PROVINCES,
        summary=sanitize_summary_for_viewer(summary),
    )


async def create_or_resume_solo_sandbox(
    resume_game_id: str | None,
    source_game_id: str | None,
    passcode: str | None,
    current_user: AuthUser | None,
    sync_lobby: Callable[[], Awaitable[None]],
    client: str,
) -> GameBootstrapResponse:
    """Create a fresh draft sandbox, resume an existing draft, or export a board state."""
    if source_game_id and source_game_id.strip():
        return await export_game_to_solo_sandbox(
            source_game_id.strip(), resume_game_id, passcode, current_user, sync_lobby, client
        )

    if resume_game_id:
        resumed = await try_load_draft_sandbox(resume_game_id.strip(), current_user)
        if resumed:
            game_state, summary = resumed
            return GameBootstrapResponse(
                state=with_sanitized_admin_log(game_state, current_user),
                provinces=PROVINCES,
                summary=sanitize_summary_for_viewer(summary),
            )

    if current_user and current_user.user_id and current_user.user_id != "guest":
        candidates = [
            s
            for gid, s in GAME_SUMMARIES.items()
            if gid != DEFAULT_GAME_ID
            and s.is_sandbox
            and s.is_draft
            and s.creator_id
            and s.creator_id != "guest"
            and _draft_belongs_to_user(s, current_user)
        ]
        candidates.sort(key=lambda s: s.created_at or "", reverse=True)
        for cand in candidates:
            resumed = await try_load_draft_sandbox(cand.game_id, current_user)
            if resumed:
                game_state, summary = resumed
                return GameBootstrapResponse(
                    state=with_sanitized_admin_log(game_state, current_user),
                    provinces=PROVINCES,
                    summary=sanitize_summary_for_viewer(summary),
                )

    check_game_capacity()
    gid = f"solo_{uuid.uuid4().hex[:8]}"
    game_state = build_scenario("standard_1901", Power.FRANCE, gid)
    GAMES[gid] = game_state
    SANDBOX_CHECKPOINTS[gid] = None
    replace_all_phases(gid, [])

    await ensure_profile_loaded(current_user.user_id if current_user else None)
    summary = _build_solo_draft_summary(gid, game_state, Power.FRANCE, current_user)
    GAME_SUMMARIES[gid] = summary
    await persist_game(gid)
    return GameBootstrapResponse(
        state=game_state,
        provinces=PROVINCES,
        summary=sanitize_summary_for_viewer(summary),
    )
