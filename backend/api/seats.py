"""Seats in a match: joining, leaving, surrendering, and picking which of your powers to play."""

import hmac
from datetime import datetime, timezone

from api.games import GameBootstrapResponse
from domain.models import (
    GameParticipant,
    GameState,
    JoinGameRequest,
    LeaveGameRequest,
    Power,
    SurrenderRequest,
)
from engine.order_utils import (
    everyone_is_ready,
    put_into_civil_disorder,
    refresh_diagnostics_and_simulation,
)
from engine.topology.provinces import PROVINCES
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from security.auth import AuthUser, get_current_user
from security.secrecy import (
    sanitize_game_state_for_viewer,
    viewer_power_for,
)
from storage import supabase
from storage.store import (
    GAME_PASSCODES,
    GAME_SUMMARIES,
    SANDBOX_CHECKPOINTS,
    evict_game,
    persist_game,
    resolve_game,
    sync_summary,
)
from storage.supabase import is_valid_uuid
from ws.connection_manager import (
    broadcast_game_update,
    broadcast_lobby_update,
)

router = APIRouter(tags=["Lobby & Match Management"])


class SetPowerRequest(BaseModel):
    power: Power


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
            if supabase.is_persistence_enabled():
                await supabase.delete_game_from_db(game_id)
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
        if supabase.is_persistence_enabled():
            await supabase.delete_game_from_db(game_id)
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
