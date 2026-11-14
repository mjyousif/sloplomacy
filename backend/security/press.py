"""Who may read a press message, and what they see of it.

Press has three kinds of message, told apart by `recipients` and `anonymous`:

- public (no recipients): every seated player reads it;
- a private thread message (recipients, signed): the sender and the recipients read it;
- an anonymous note (recipients, anonymous): the same readers, but nobody is told who wrote it.

An anonymous author is hidden from everyone but themself, the host included. Once the game is
over the press is `revealed`: every seated player may read every message and see every author.
"""

from domain.board import Power
from domain.game_state import GameState
from domain.press import PressMessage, PressMessageView


def press_revealed(game: GameState) -> bool:
    """True once the game is over, when all press becomes public to the players."""
    return game.winner is not None


def can_read(message: PressMessage, viewer: Power, revealed: bool) -> bool:
    if revealed or not message.recipients:
        return True
    return viewer == message.sender or viewer in message.recipients


def view_of(message: PressMessage, viewer: Power, revealed: bool) -> PressMessageView:
    """The copy of `message` that `viewer` may be sent. Call `can_read` first."""
    author_shown = revealed or not message.anonymous or viewer == message.sender
    return PressMessageView(
        id=message.id,
        seq=message.seq,
        sender=message.sender if author_shown else None,
        anonymous=message.anonymous,
        recipients=list(message.recipients),
        body=message.body,
        sent_at=message.sent_at,
        season=message.season,
        year=message.year,
        phase=message.phase,
    )


def feed_for(
    messages: list[PressMessage], viewer: Power, revealed: bool, after: int = 0
) -> list[PressMessageView]:
    """Every message newer than `after` that `viewer` may read, oldest first."""
    return [
        view_of(message, viewer, revealed)
        for message in messages
        if message.seq > after and can_read(message, viewer, revealed)
    ]
