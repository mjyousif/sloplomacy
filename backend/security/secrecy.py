from collections.abc import Collection
from contextvars import ContextVar

from domain.board import Power
from domain.game_state import GameState, MultiplayerGameSummary
from engine.adjudicator.resolver import adjudicate_turn
from engine.order_utils import create_default_orders
from engine.reachability import compute_unit_options
from fastapi import Depends, HTTPException, Request, status
from security.auth import AuthUser, get_current_user
from security.creator import is_creator
from security.passcode import require_passcode
from storage.profiles import (
    resolve_actor_name,
    resolve_host_name,
    resolve_participant_name,
)
from storage.store import (
    DEFAULT_GAME_ID,
    GAME_SUMMARIES,
    GAMES,
    PRIVATE_SANDBOXES,
    is_multiplayer_match,
    lacks_summary,
    resolve_game,
)
from storage.supabase_codec import is_valid_uuid


def _missing_summary_error(game_id: str) -> HTTPException:
    """A game with no summary has no seats, owner or passcode on record, so nobody passes."""
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Game '{game_id}' is unavailable: its record is incomplete.",
    )


def require_view_access(
    game_id: str,
    current_user: AuthUser | None,
    passcode: str | None,
    *,
    client: str,
) -> None:
    """Refuse to show a private match to anyone who is neither seated in it nor has its passcode.

    `client` is the caller's address (`security.passcode.client_address`), against which a wrong
    passcode is counted.
    """
    summary = GAME_SUMMARIES.get(game_id)
    if lacks_summary(game_id):
        raise _missing_summary_error(game_id)
    if not (summary and summary.has_passcode and is_multiplayer_match(game_id)):
        return
    if current_user and any(
        p.user_id == current_user.user_id for p in summary.participants.values()
    ):
        return
    require_passcode(game_id, passcode, client)


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
    if lacks_summary(gid):
        raise _missing_summary_error(gid)
    if not summary or summary.is_sandbox:
        return

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required: Provide a valid Supabase Bearer token to modify multiplayer games.",
        )

    if not is_creator(summary, user.user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access denied: Only the game creator can modify game state.",
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
        raise _missing_summary_error(game_id)

    if current_user and is_creator(summary, current_user.user_id):
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
        return bool(part.user_id and part.user_id == current_user.user_id)
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


def require_seat_holder(
    summary: MultiplayerGameSummary | None,
    power: Power,
    current_user: AuthUser | None,
    *,
    guest_user_id: str | None = None,
    action: str | None = None,
) -> None:
    """Refuse anyone who does not hold `power`'s seat when that seat is claimed."""
    if not summary:
        return
    p_val = power.value if hasattr(power, "value") else str(power)
    part = summary.participants.get(p_val)
    if not part:
        return
    if current_user:
        if part.user_id != current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You do not command {p_val} in this match.",
            )
    elif is_valid_uuid(part.user_id):
        verb = action or f"act for {p_val}"
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication required to {verb}.",
        )
    elif guest_user_id is not None and part.user_id != guest_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You do not command {p_val} in this match.",
        )


def require_own_seat(game_id: str, power: Power, current_user: AuthUser | None) -> None:
    """Refuse anything that would show `power`'s hidden orders to someone not in that seat."""
    if is_multiplayer_match(game_id) and not caller_holds_seat(
        GAME_SUMMARIES.get(game_id), power, current_user
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You do not hold {power.value}'s seat in this match.",
        )


def sanitize_summary_for_viewer(
    summary: MultiplayerGameSummary, keep_board: bool = False
) -> MultiplayerGameSummary:
    """Return a copy of `summary` with centralized public display names resolved.

    The board preview is dropped too unless `keep_board` is set, which only a player's own
    games (`GET /api/games/mine`) do: the lobby list and socket go to everyone.
    """
    sanitized_participants = {
        key: part.model_copy(
            update={
                "display_name": resolve_participant_name(part),
            }
        )
        for key, part in summary.participants.items()
    }
    return summary.model_copy(
        update={
            "created_by": resolve_host_name(summary),
            "participants": sanitized_participants,
            "board": summary.board if keep_board else None,
        }
    )


# Who the caller of the current HTTP request is, as the tokens an admin-log acknowledgement may be
# filed under (`viewer_ack_ids`). `saved_sandbox_guard` binds it for every route, and the game
# socket and the broadcast pass theirs explicitly, so no `sanitize_game_state_for_viewer` call has
# to be handed the caller.
_VIEWER_ACK_IDS: ContextVar[tuple[str, ...]] = ContextVar("viewer_ack_ids", default=())

# Acknowledgement tokens that name no one: a seat, or an anonymous guest.
_PUBLIC_ACK_TOKENS = frozenset({p.value for p in Power} | {"guest"})


def viewer_ack_ids(user: AuthUser | None) -> tuple[str, ...]:
    """The acknowledgement tokens `user` files an admin log entry under: their user id."""
    if not user or not user.user_id:
        return ()
    return (user.user_id,)


def bind_viewer(user: AuthUser | None) -> None:
    """Remember who is calling, for the admin log of every state this request returns."""
    _VIEWER_ACK_IDS.set(viewer_ack_ids(user))


def sanitize_admin_log(game: GameState, viewer_ids: Collection[str]) -> list:
    """The admin log as one viewer may see it.

    Actors are resolved centrally from `actor_id` / `PROFILE_NAMES` (`actor_id` is stripped from
    the outgoing entry), and `acknowledged_by` keeps only the viewer's own tokens and the
    nameless ones (a seat, `guest`), scrubbing any legacy email tokens.
    """
    if not game.admin_log:
        return game.admin_log
    allowed = _PUBLIC_ACK_TOKENS.union(viewer_ids)
    summary = GAME_SUMMARIES.get(game.game_id)
    entries = []
    for entry in game.admin_log:
        update: dict = {}
        resolved_actor = resolve_actor_name(entry, summary)
        if entry.actor != resolved_actor:
            update["actor"] = resolved_actor
        if entry.actor_id is not None:
            update["actor_id"] = None
        kept = [t for t in entry.acknowledged_by if t in allowed and "@" not in t]
        if len(kept) != len(entry.acknowledged_by) or any(
            a != b for a, b in zip(kept, entry.acknowledged_by, strict=False)
        ):
            update["acknowledged_by"] = kept
        entries.append(entry.model_copy(update=update) if update else entry)
    return entries


def with_sanitized_admin_log(game: GameState, user: AuthUser | None) -> GameState:
    """Return a copy of `game` with `admin_log` sanitized for `user`, if any entry changed."""
    if not game.admin_log:
        return game
    sanitized_log = sanitize_admin_log(game, viewer_ack_ids(user))
    if any(a is not b for a, b in zip(sanitized_log, game.admin_log, strict=False)):
        return game.model_copy(update={"admin_log": sanitized_log})
    return game


def sanitize_game_state_for_viewer(
    game: GameState,
    viewer_power: Power | None = None,
    viewer_ids: Collection[str] | None = None,
) -> GameState:
    """Preserve simultaneous move secrecy (Fog of War) in active multiplayer matches.

    `viewer_ids` are the viewer's acknowledgement tokens (`viewer_ack_ids`). Left out, they come
    from the request being served (`bind_viewer`), and none are known outside one.
    """
    sanitized_log = sanitize_admin_log(
        game, _VIEWER_ACK_IDS.get() if viewer_ids is None else viewer_ids
    )
    if not is_multiplayer_match(game.game_id) or game.winner:
        if sanitized_log is not game.admin_log and any(
            a is not b for a, b in zip(sanitized_log, game.admin_log, strict=False)
        ):
            return game.model_copy(update={"admin_log": sanitized_log})
        return game

    # A lobby nobody has joined yet, or a match that dropped back to one player, is "waiting"
    # but still has a player whose orders are theirs alone.
    masked_game = game.model_copy(update={"admin_log": sanitized_log})
    defaults = create_default_orders(game.units, game.phase, game.builds)

    if viewer_power:
        own_orders = {uid: o for uid, o in game.orders.items() if o.power == viewer_power}
        foreign_defaults = {uid: o for uid, o in defaults.items() if o.power != viewer_power}
        masked_game.orders = {**foreign_defaults, **own_orders}
        masked_game.issues = [issue for issue in game.issues if issue.power == viewer_power]
    else:
        masked_game.orders = defaults
        masked_game.issues = []

    # Rebuilt for every viewer from what they may see, so the stored preview never leaves.
    masked_game.preview = None
    if not game.winner:
        masked_game.preview = adjudicate_turn(
            game.units,
            masked_game.orders,
            game.ownership,
            game.season,
            game.year,
            game.phase,
            retreats=game.retreats,
        )

    # Rebuild options from masked orders so a foreign fleet's secret convoy never turns green.
    masked_game.unit_options = compute_unit_options(
        game.units, masked_game.orders, game.phase, retreats=game.retreats
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
    if not is_valid_uuid(summary.creator_id):
        return True
    return bool(current_user and is_creator(summary, current_user.user_id))


def require_saved_sandbox_owner(game_id: str, current_user: AuthUser | None) -> None:
    """Refuse anyone but its owner on a saved or private sandbox (one player's study board)."""
    if game_id in PRIVATE_SANDBOXES:
        match_id, seat_power = PRIVATE_SANDBOXES[game_id]
        require_own_seat(match_id, seat_power, current_user)
        return
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
    bind_viewer(current_user)
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
    if gid in PRIVATE_SANDBOXES and (
        request.url.path.startswith("/api/history") or request.url.path == "/api/sandbox/exit"
    ):
        return
    require_saved_sandbox_owner(gid, current_user)
