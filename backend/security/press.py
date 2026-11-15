"""Who may read a press message, and what they see of it.

A message is public (no recipients), which every seated player reads, or a private thread
message (recipients), which the sender and the recipients read. Either may be `anonymous`: the
same readers, but nobody is told who wrote it. A private one needs at least two recipients,
because in a one-to-one thread the reader would know.

An anonymous author is hidden from everyone but themself, the host included. A hidden author's
private message lists the whole thread as its recipients, author included, since the real list
leaves out exactly the author. Once the game is
over the press is `revealed`: every seated player may read every message and see every author.

The `seq` a player is sent numbers the messages they may read 1, 2, 3... (`PressMessage.numbers`),
never the game-wide count, whose gaps would show how much private press the others exchange.
Once the press is revealed everyone reads everything, so it is then the game-wide count.
"""

from domain.board import Power
from domain.game_state import GameState
from domain.press import PressMessage, PressMessageView


def press_revealed(game: GameState) -> bool:
    """True once the game is over, when all press becomes public to the players."""
    return game.winner is not None


def can_read(message: PressMessage, viewer: Power, revealed: bool) -> bool:
    return revealed or viewer in message.readers()


def number_for(message: PressMessage, viewer: Power, revealed: bool) -> int:
    """The `seq` `viewer` is sent for `message`: its place in their own feed."""
    return message.seq if revealed else message.numbers.get(viewer, 0)


def _thread_of(message: PressMessage) -> list[Power]:
    """Every power in a message's thread, the sender included; empty for public press."""
    if not message.recipients:
        return []
    return sorted({message.sender, *message.recipients}, key=lambda p: p.value)


def view_of(message: PressMessage, viewer: Power, revealed: bool) -> PressMessageView:
    """The copy of `message` that `viewer` may be sent. Call `can_read` first."""
    author_shown = revealed or not message.anonymous or viewer == message.sender
    return PressMessageView(
        id=message.id,
        seq=number_for(message, viewer, revealed),
        sender=message.sender if author_shown else None,
        anonymous=message.anonymous,
        recipients=_thread_of(message) if not author_shown else list(message.recipients),
        body=message.body,
        sent_at=message.sent_at,
        season=message.season,
        year=message.year,
        phase=message.phase,
        orders=[order.model_copy() for order in message.orders],
    )


def feed_for(
    messages: list[PressMessage], viewer: Power, revealed: bool, after: int = 0
) -> list[PressMessageView]:
    """Every message `viewer` may read numbered after `after` in their own feed, oldest first."""
    return [
        view_of(message, viewer, revealed)
        for message in messages
        if can_read(message, viewer, revealed) and number_for(message, viewer, revealed) > after
    ]
