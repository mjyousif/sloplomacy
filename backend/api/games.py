import hmac
import uuid
from datetime import datetime, timezone

from domain.models import (
    CreateGameRequest,
    GameParticipant,
    GameState,
    JoinGameRequest,
    LeaveGameRequest,
    MultiplayerGameSummary,
    Power,
    ProvinceInfo,
    SaveSandboxRequest,
    SurrenderRequest,
)
from engine.order_utils import (
    everyone_is_ready,
    put_into_civil_disorder,
    refresh_diagnostics_and_simulation,
)
from engine.topology import PROVINCES
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from scenarios.presets import build_scenario
from security.auth import AuthUser, get_current_user
from security.secrecy import (
    require_view_access,
    sanitize_game_state_for_viewer,
    viewer_power_for,
)
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
    get_main_attr,
    load_saved_game,
    persist_game,
    resolve_game,
    sync_summary,
)
from storage.supabase import (
    SupabaseUnavailable,
    delete_game_from_db,
    is_persistence_enabled,
    is_valid_uuid,
    load_all_summaries_from_db,
    load_game_from_db,
)
from ws.connection_manager import (
    broadcast_game_update,
    broadcast_lobby_update,
    manager,
)

router = APIRouter(tags=["Lobby & Match Management"])


def _is_persistence_enabled() -> bool:
    return get_main_attr("is_persistence_enabled", is_persistence_enabled)()


async def _load_all_summaries_from_db():
    fn = get_main_attr("load_all_summaries_from_db", load_all_summaries_from_db)
    return await fn()


async def _delete_game_from_db(game_id: str):
    fn = get_main_attr("delete_game_from_db", delete_game_from_db)
    return await fn(game_id)


class GameBootstrapResponse(BaseModel):
    state: GameState
    provinces: dict[str, ProvinceInfo]
    summary: MultiplayerGameSummary | None = None


class SetPowerRequest(BaseModel):
    power: Power


async def sync_lobby_with_db() -> None:
    unsaved_at_read = set(UNSAVED_GAMES)
    try:
        db_summaries = await _load_all_summaries_from_db()
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
    if _is_persistence_enabled():
        await sync_lobby_with_db()

    for gid in list(GAME_SUMMARIES.keys()):
        if gid not in (DEFAULT_GAME_ID, "proto_1901"):
            sync_summary(gid)
    return [s for gid, s in GAME_SUMMARIES.items() if gid not in (DEFAULT_GAME_ID, "proto_1901")]


@router.get(
    "/api/games/{game_id}",
    response_model=MultiplayerGameSummary,
    summary="Get Game Lobby Details",
)
async def get_game_details(game_id: str):
    if _is_persistence_enabled():
        unsaved_at_read = game_id in UNSAVED_GAMES
        try:
            load_fn = get_main_attr("load_game_from_db", load_game_from_db)
            loaded = await load_fn(game_id)
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
    if not summary and _is_persistence_enabled():
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
    if _is_persistence_enabled():
        await _delete_game_from_db(game_id)

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
    "/api/games/{game_id}/join",
    response_model=GameBootstrapResponse,
    summary="Join Multiplayer Game",
)
async def join_multiplayer_game(
    game_id: str,
    req: JoinGameRequest,
    current_user: AuthUser | None = Depends(get_current_user),
):
    from api.turns import refresh_timer

    game_state = await resolve_game(game_id)
    summary = GAME_SUMMARIES.get(game_id)
    if not summary:
        raise HTTPException(status_code=404, detail=f"Game lobby '{game_id}' not found.")

    effective_user_id = current_user.user_id if current_user else req.user_id
    effective_email = (current_user.email or req.email) if current_user else req.email

    if summary.has_passcode:
        is_already_participant = any(
            p.user_id == effective_user_id for p in summary.participants.values()
        )
        if not is_already_participant:
            expected_pw = GAME_PASSCODES.get(game_id)
            provided_pw = (req.passcode or "").strip()
            if not expected_pw or not hmac.compare_digest(provided_pw, expected_pw):
                raise HTTPException(
                    status_code=403,
                    detail="Passcode required or incorrect for this private campaign.",
                )

    existing = summary.participants.get(req.power.value)
    if existing and existing.user_id != effective_user_id:
        raise HTTPException(
            status_code=409,
            detail=f"{req.power.value} is already claimed by {existing.display_name}.",
        )
    if existing and existing.user_id == effective_user_id:
        if is_valid_uuid(existing.user_id) and not current_user:
            raise HTTPException(
                status_code=401,
                detail="Authentication required to re-enter this claimed seat.",
            )

    for p_key, part in list(summary.participants.items()):
        if part.user_id == effective_user_id and p_key != req.power.value:
            del summary.participants[p_key]

    now_iso = datetime.now(timezone.utc).isoformat()
    display_name = req.display_name or effective_email.split("@")[0]
    summary.participants[req.power.value] = GameParticipant(
        user_id=effective_user_id,
        email=effective_email,
        display_name=display_name,
        power=req.power,
        joined_at=now_iso,
    )
    if len(summary.participants) >= 2 and summary.status == "waiting":
        summary.status = "active"
    refresh_timer(game_state)

    if req.power in game_state.surrendered_powers:
        game_state.surrendered_powers.remove(req.power)
        game_state.turn_history.append(
            f"Envoy {display_name} has assumed sovereign command of {req.power.value} from Civil Disorder."
        )

    if summary.is_sandbox:
        game_state.active_power = req.power
    refresh_diagnostics_and_simulation(game_state)
    sync_summary(game_id)
    await persist_game(game_id)
    await broadcast_game_update(game_id, game_state, summary)
    await broadcast_lobby_update()
    return GameBootstrapResponse(
        state=sanitize_game_state_for_viewer(
            game_state.model_copy(update={"active_power": req.power}),
            req.power,
        ),
        provinces=PROVINCES,
        summary=summary,
    )


@router.post(
    "/api/games/{game_id}/leave",
    response_model=GameBootstrapResponse,
    summary="Leave Game",
)
async def leave_game(
    game_id: str,
    req: LeaveGameRequest,
    current_user: AuthUser | None = Depends(get_current_user),
):
    from api.turns import _execute_adjudication, refresh_timer

    game_state = await resolve_game(game_id)
    summary = GAME_SUMMARIES.get(game_id)
    if not summary:
        raise HTTPException(status_code=404, detail=f"Game lobby '{game_id}' not found.")

    effective_user_id = current_user.user_id if current_user else req.user_id
    if current_user and req.user_id and req.user_id != current_user.user_id:
        raise HTTPException(
            status_code=403, detail="Cannot vacate a seat claimed by another player."
        )
    if not current_user and is_valid_uuid(req.user_id):
        raise HTTPException(status_code=401, detail="Authentication required to vacate this seat.")

    if req.power:
        p_val = req.power.value if hasattr(req.power, "value") else str(req.power)
        part = summary.participants.get(p_val)
        if part and part.user_id != effective_user_id:
            raise HTTPException(
                status_code=403, detail=f"You do not command {p_val} in this campaign."
            )

    if summary.is_sandbox:
        if summary.creator_id == effective_user_id or summary.created_by == (
            current_user.email if current_user else req.email
        ):
            evict_game(game_id)
            if _is_persistence_enabled():
                await _delete_game_from_db(game_id)
            await broadcast_lobby_update()
            return GameBootstrapResponse(
                state=game_state,
                provinces=PROVINCES,
                summary=None,
            )

    leaving_powers: list[Power] = []
    for p_key, part in list(summary.participants.items()):
        if part.user_id == effective_user_id and (req.power is None or part.power == req.power):
            leaving_powers.append(part.power)
            del summary.participants[p_key]

    if not leaving_powers and req.power:
        p_val = req.power.value if hasattr(req.power, "value") else str(req.power)
        if (
            p_val in summary.participants
            and summary.participants[p_val].user_id == effective_user_id
        ):
            leaving_powers.append(summary.participants[p_val].power)
            del summary.participants[p_val]

    if not leaving_powers:
        raise HTTPException(
            status_code=400, detail="User is not an active participant in this game."
        )

    for pwr in leaving_powers:
        if pwr in game_state.finalized_powers:
            game_state.finalized_powers.remove(pwr)

        put_into_civil_disorder(game_state, pwr)

        power_label = pwr.value if hasattr(pwr, "value") else str(pwr)
        game_state.turn_history.append(
            f"The envoy of {power_label} has vacated their seat and left the campaign. Imperial units stand in Civil Disorder."
        )

    if len(summary.participants) == 0:
        evict_game(game_id)
        if _is_persistence_enabled():
            await _delete_game_from_db(game_id)
        await broadcast_lobby_update()
        return GameBootstrapResponse(
            state=game_state,
            provinces=PROVINCES,
            summary=None,
        )

    if len(summary.participants) < 2 and summary.status == "active":
        summary.status = "waiting"

    refresh_timer(game_state)
    refresh_diagnostics_and_simulation(game_state)
    sync_summary(game_id)
    await persist_game(game_id)
    await broadcast_game_update(game_id, game_state, summary)
    await broadcast_lobby_update()
    if everyone_is_ready(game_state):
        await _execute_adjudication(game_state)
    return GameBootstrapResponse(
        state=sanitize_game_state_for_viewer(game_state),
        provinces=PROVINCES,
        summary=summary,
    )


@router.post(
    "/api/games/{game_id}/surrender",
    response_model=GameBootstrapResponse,
    summary="Surrender Power",
)
async def surrender_power(
    game_id: str,
    req: SurrenderRequest,
    current_user: AuthUser | None = Depends(get_current_user),
):
    from api.turns import _execute_adjudication, refresh_timer

    game_state = await resolve_game(game_id)
    summary = GAME_SUMMARIES.get(game_id)
    if not summary:
        raise HTTPException(status_code=404, detail=f"Game lobby '{game_id}' not found.")

    p_val = req.power.value if hasattr(req.power, "value") else str(req.power)
    part = summary.participants.get(p_val)
    if part:
        if current_user:
            if part.user_id != current_user.user_id and (
                not current_user.email or current_user.email.lower() != (part.email or "").lower()
            ):
                raise HTTPException(
                    status_code=403,
                    detail=f"You do not command {p_val} in this campaign.",
                )
        elif is_valid_uuid(part.user_id):
            raise HTTPException(
                status_code=401,
                detail=f"Authentication required to surrender command of {p_val}.",
            )
        elif part.user_id != req.user_id:
            raise HTTPException(
                status_code=403,
                detail=f"You do not command {p_val} in this campaign.",
            )

    if req.power not in game_state.surrendered_powers:
        game_state.surrendered_powers.append(req.power)

    put_into_civil_disorder(game_state, req.power)

    if req.power in game_state.finalized_powers:
        game_state.finalized_powers.remove(req.power)

    disp = part.display_name if part else "Envoy"
    game_state.turn_history.append(
        f"{p_val} ({disp}) has formally surrendered! Sovereign forces have entered Civil Disorder."
    )

    if req.leave:
        if p_val in summary.participants:
            del summary.participants[p_val]
        if len(summary.participants) < 2 and summary.status == "active":
            summary.status = "waiting"
    else:
        if part:
            part.surrendered = True
            part.surrendered_at = datetime.now(timezone.utc).isoformat()

    refresh_timer(game_state)
    refresh_diagnostics_and_simulation(game_state)
    sync_summary(game_id)
    await persist_game(game_id)
    await broadcast_game_update(game_id, game_state, summary)
    await broadcast_lobby_update()
    if everyone_is_ready(game_state):
        await _execute_adjudication(game_state)
    return GameBootstrapResponse(
        state=sanitize_game_state_for_viewer(game_state),
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
    new_gid = f"saved_{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    visible = sanitize_game_state_for_viewer(
        source_game, viewer_power_for(source_game.game_id, current_user)
    )
    cloned_state = visible.model_copy(deep=True)
    cloned_state.game_id = new_gid
    cloned_state.timer = None
    GAMES[new_gid] = cloned_state
    SANDBOX_CHECKPOINTS[new_gid] = None
    GAME_HISTORY[new_gid] = []

    effective_user_id = current_user.user_id if current_user else req.user_id
    effective_email = (current_user.email or req.email) if current_user else req.email
    display_name = req.display_name or effective_email.split("@")[0]
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


@router.post(
    "/api/power",
    response_model=GameState,
    summary="Set Active Power",
)
async def set_active_power(
    req: SetPowerRequest,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await resolve_game(game_id)
    gid = game.game_id
    game.active_power = req.power
    checkpoint = SANDBOX_CHECKPOINTS.get(gid)
    if checkpoint is not None:
        checkpoint.active_power = req.power
    refresh_diagnostics_and_simulation(game)
    await persist_game(gid)
    await broadcast_game_update(gid, game)
    return sanitize_game_state_for_viewer(game, viewer_power_for(gid, current_user, req.power))
