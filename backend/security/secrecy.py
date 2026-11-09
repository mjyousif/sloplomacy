import hmac

from domain.models import GameState, MultiplayerGameSummary, Power
from engine.adjudicator.resolver import adjudicate_turn
from engine.order_utils import create_default_orders
from fastapi import Depends, HTTPException, Request, status
from security.auth import AuthUser, get_current_user
from storage.store import (
    DEFAULT_GAME_ID,
    GAME_PASSCODES,
    GAME_SUMMARIES,
    GAMES,
    is_multiplayer_match,
    resolve_game,
)
from storage.supabase import is_valid_uuid


def require_view_access(
    game_id: str,
    current_user: AuthUser | None,
    passcode: str | None,
) -> None:
    """Refuse to show a private match to anyone who is neither seated in it nor has its passcode."""
    summary = GAME_SUMMARIES.get(game_id)
    if not (summary and summary.has_passcode and is_multiplayer_match(game_id)):
        return
    if current_user and any(
        p.user_id == current_user.user_id for p in summary.participants.values()
    ):
        return
    expected_pw = GAME_PASSCODES.get(game_id, "")
    provided_pw = (passcode or "").strip()
    if not expected_pw or not hmac.compare_digest(provided_pw, expected_pw):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Passcode required or incorrect for this private campaign.",
        )


def verify_admin_access(
    game_id: str,
    user: AuthUser | None = None,
) -> None:
    """Verify that the caller has game creator / administrator permissions for this game."""
    gid = game_id or DEFAULT_GAME_ID
    if gid == DEFAULT_GAME_ID:
        return

    summary = GAME_SUMMARIES.get(gid)
    if not summary and gid not in GAMES:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Game '{gid}' is not loaded.",
        )
    if not summary or summary.is_sandbox:
        return

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required: Provide a valid Supabase Bearer token to modify multiplayer games.",
        )

    is_creator = False
    if summary.creator_id and summary.creator_id == user.user_id:
        is_creator = True
    elif summary.created_by and user.email and summary.created_by.lower() == user.email.lower():
        is_creator = True

    if not is_creator:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Administrator access denied: Only the game creator ({summary.created_by}) can modify game state.",
        )


def verify_power_authorization(
    game_id: str,
    power: Power,
    current_user: AuthUser | None = None,
) -> None:
    """Verify that the caller is authorized to command `power` in this match."""
    if not is_multiplayer_match(game_id):
        return

    summary = GAME_SUMMARIES.get(game_id)
    if not summary:
        return

    is_creator = False
    if current_user:
        if summary.creator_id and summary.creator_id == current_user.user_id:
            is_creator = True
        elif (
            summary.created_by
            and current_user.email
            and summary.created_by.lower() == current_user.email.lower()
        ):
            is_creator = True

    if is_creator:
        return

    part = summary.participants.get(power.value)
    if not part:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{power.value} has no active envoy in this match.",
        )

    if current_user:
        if part.user_id == current_user.user_id:
            return
        if part.email and current_user.email and part.email.lower() == current_user.email.lower():
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Authorization denied: You do not command {power.value} in this match.",
        )

    if part.user_id and is_valid_uuid(part.user_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication required: Provide a valid Bearer token to command {power.value}.",
        )


def caller_holds_seat(
    summary: MultiplayerGameSummary | None,
    power: Power,
    current_user: AuthUser | None,
) -> bool:
    """True when the caller sits in `power`'s seat."""
    if not summary:
        return False
    part = summary.participants.get(power.value)
    if not part:
        return False
    if current_user:
        if part.user_id and part.user_id == current_user.user_id:
            return True
        return bool(
            part.email and current_user.email and part.email.lower() == current_user.email.lower()
        )
    return not (part.user_id and is_valid_uuid(part.user_id))


def viewer_power_for(
    game_id: str,
    current_user: AuthUser | None,
    requested: Power | None = None,
) -> Power | None:
    """The power whose hidden orders this caller may see in a live match."""
    summary = GAME_SUMMARIES.get(game_id)
    if not summary:
        return None
    if requested and caller_holds_seat(summary, requested, current_user):
        return requested
    if not current_user:
        return None
    for part in summary.participants.values():
        if caller_holds_seat(summary, part.power, current_user):
            return part.power
    return None


def build_slot_power(slot_id: str) -> Power | None:
    """The power a build slot (`BUILD_<POWER>_<PROVINCE>`) belongs to."""
    parts = slot_id.split("_")
    if len(parts) < 3 or parts[0] != "BUILD":
        return None
    try:
        return Power(parts[1])
    except ValueError:
        return None


def require_own_seat(game_id: str, power: Power, current_user: AuthUser | None) -> None:
    """Refuse anything that would show `power`'s hidden orders to someone not in that seat."""
    if is_multiplayer_match(game_id) and not caller_holds_seat(
        GAME_SUMMARIES.get(game_id), power, current_user
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You do not hold {power.value}'s seat in this match.",
        )


def sanitize_game_state_for_viewer(
    game: GameState,
    viewer_power: Power | None = None,
) -> GameState:
    """Preserve simultaneous move secrecy (Fog of War) in active multiplayer matches."""
    if not is_multiplayer_match(game.game_id) or game.winner:
        return game

    # A lobby nobody has joined yet, or a match that dropped back to one player, is "waiting"
    # but still has a player whose orders are theirs alone.
    masked_game = game.model_copy()
    defaults = create_default_orders(game.units, game.phase, game.builds)

    if viewer_power:
        own_orders = {uid: o for uid, o in game.orders.items() if o.power == viewer_power}
        foreign_defaults = {uid: o for uid, o in defaults.items() if o.power != viewer_power}
        masked_game.orders = {**foreign_defaults, **own_orders}
        masked_game.issues = [issue for issue in game.issues if issue.power == viewer_power]
    else:
        masked_game.orders = defaults
        masked_game.issues = []

    if game.last_resolution is not None:
        masked_game.last_resolution = adjudicate_turn(
            game.units,
            masked_game.orders,
            game.ownership,
            game.season,
            game.year,
            game.phase,
            retreats=game.retreats,
        )

    return masked_game


def reject_on_multiplayer_match(game_id: str) -> None:
    """Refuse hypothetical work on a shared match: it belongs on a private sandbox copy."""
    if is_multiplayer_match(game_id):
        raise HTTPException(
            status_code=409,
            detail="This is a live match. Hypothetical orders belong in a private sandbox.",
        )


def caller_owns_saved_sandbox(
    summary: MultiplayerGameSummary, current_user: AuthUser | None
) -> bool:
    """True when the caller saved this sandbox. A guest's sandbox stays open, like a guest's seat."""
    if current_user:
        if summary.creator_id and summary.creator_id == current_user.user_id:
            return True
        return bool(
            summary.created_by
            and current_user.email
            and summary.created_by.lower() == current_user.email.lower()
        )
    return not is_valid_uuid(summary.creator_id)


def require_saved_sandbox_owner(game_id: str, current_user: AuthUser | None) -> None:
    """Refuse anyone but its owner on a saved sandbox (one player's private study board)."""
    summary = GAME_SUMMARIES.get(game_id)
    if summary and summary.is_sandbox and not caller_owns_saved_sandbox(summary, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN if current_user else status.HTTP_401_UNAUTHORIZED,
            detail="This saved sandbox belongs to another player.",
        )


async def saved_sandbox_guard(
    request: Request,
    current_user: AuthUser | None = Depends(get_current_user),
) -> None:
    """Router dependency: any HTTP route naming a saved sandbox (path or `?game_id=`) is owner-only.

    It runs for every route, so a new endpoint cannot forget the check.
    """
    gid = request.path_params.get("game_id") or request.query_params.get("game_id")
    if not gid:
        return
    if gid not in GAME_SUMMARIES:
        try:
            await resolve_game(
                gid
            )  # Loads a saved game's summary; the route reports a missing one.
        except HTTPException:
            return
    require_saved_sandbox_owner(gid, current_user)
