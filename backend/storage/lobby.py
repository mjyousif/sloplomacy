"""Which games the lobby lists, and to whom.

The public lobby holds only public matches: never a private campaign, a sandbox or a draft.
A player's own games, private ones included, come from `summaries_for_user` instead.
"""

from datetime import datetime, timezone
from typing import Literal

from domain.board import Power
from domain.game_state import MultiplayerGameSummary
from domain.requests import LobbyBrowsePage, LobbyGameRow
from storage.store import DEFAULT_GAME_ID, GAME_SUMMARIES

SEASON_ORDER = {"Spring": 0, "Fall": 1, "Winter": 2}
SeatFilter = Literal["open", "full", "all"]
TurnOp = Literal["at", "before", "after"]


def is_public_listing(game_id: str, summary: MultiplayerGameSummary) -> bool:
    return (
        game_id not in (DEFAULT_GAME_ID, "proto_1901")
        and not summary.is_private
        and not summary.is_sandbox
        and not summary.is_draft
    )


def public_summaries() -> list[MultiplayerGameSummary]:
    return [s for gid, s in GAME_SUMMARIES.items() if is_public_listing(gid, s)]


def summaries_for_user(user_id: str) -> list[MultiplayerGameSummary]:
    """Every game the user holds a seat in or owns, private ones and saved sandboxes included."""
    return [
        s
        for gid, s in GAME_SUMMARIES.items()
        if gid not in (DEFAULT_GAME_ID, "proto_1901")
        and not s.is_draft
        and (s.creator_id == user_id or any(p.user_id == user_id for p in s.participants.values()))
    ]


def open_powers(summary: MultiplayerGameSummary) -> list[Power]:
    return [p for p in Power if p.value not in summary.participants]


def _host_name(summary: MultiplayerGameSummary) -> str:
    for p in summary.participants.values():
        if summary.creator_id and p.user_id == summary.creator_id:
            return p.display_name
    return "Unknown host"


def to_row(summary: MultiplayerGameSummary) -> LobbyGameRow:
    open_seats = open_powers(summary)
    return LobbyGameRow(
        game_id=summary.game_id,
        name=summary.name,
        status=summary.status,
        season=summary.season,
        year=summary.year,
        phase=summary.phase,
        host_name=_host_name(summary),
        created_at=summary.created_at,
        last_moved_at=summary.last_moved_at or summary.created_at,
        claimed_powers=[p for p in Power if p not in open_seats],
        open_powers=open_seats,
    )


def _when(stamp: str) -> datetime:
    """Parse a stored ISO time. Unreadable ones sort last rather than failing the whole lobby."""
    try:
        parsed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _turn_key(season: str, year: int) -> tuple[int, int]:
    return (year, SEASON_ORDER.get(season, 0))


def _matches_turn(row: LobbyGameRow, op: TurnOp, season: str | None, year: int) -> bool:
    if season is None:
        mine, wanted = (row.year,), (year,)
    else:
        mine, wanted = _turn_key(row.season, row.year), _turn_key(season, year)
    if op == "at":
        return mine == wanted
    if op == "before":
        return mine < wanted
    return mine > wanted


def _is_open(row: LobbyGameRow) -> bool:
    return bool(row.open_powers) and row.status != "completed"


def browse(
    summaries: list[MultiplayerGameSummary],
    seats: SeatFilter = "open",
    countries: list[Power] | None = None,
    turn_op: TurnOp | None = None,
    season: str | None = None,
    year: int | None = None,
    page: int = 1,
    page_size: int = 10,
) -> LobbyBrowsePage:
    """Filter, sort and page the given games.

    Games with open seats come first, then the most recently played. `countries` keeps games
    where every listed power is still unclaimed. A turn filter without a season compares years.
    """
    rows = [to_row(s) for s in summaries]
    if seats == "open":
        rows = [r for r in rows if _is_open(r)]
    elif seats == "full":
        rows = [r for r in rows if not r.open_powers]
    if countries:
        rows = [r for r in rows if all(c in r.open_powers for c in countries)]
    if turn_op and year is not None:
        rows = [r for r in rows if _matches_turn(r, turn_op, season, year)]

    rows.sort(key=lambda r: (_when(r.last_moved_at), _when(r.created_at)), reverse=True)
    rows.sort(key=lambda r: not _is_open(r))

    start = (page - 1) * page_size
    return LobbyBrowsePage(
        games=rows[start : start + page_size],
        total=len(rows),
        page=page,
        page_size=page_size,
    )
