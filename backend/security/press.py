"""Who may read a press message, and what they see of it.

A message is public (no recipients), which every seated player reads, or a private thread
message (recipients), which the sender and the recipients read. Either may be `anonymous`: the
same readers, but nobody is told who wrote it.

An anonymous author is hidden from everyone but themself, the host included. In a group thread
(two or more recipients), a hidden author's message lists the whole thread as its recipients,
author included, since the real list leaves out exactly the author. In a one-to-one anonymous
message (one recipient), `recipients` stays just that recipient so the sender is not revealed.
Once the game is over the press is `revealed`: every seated player may read every message and see
every author.

A spectator (someone watching with no seat) reads the public box alone, numbered by
`PressMessage.public_number`, so the gaps private press would leave never show. An anonymous public
author stays hidden from them until the press is revealed. A spectator never reads a private
message, not even once the game is over, and never sends.

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
    if not author_shown and len(message.recipients) >= 2:
        recipients = _thread_of(message)
    else:
        recipients = list(message.recipients)
    return PressMessageView(
        id=message.id,
        seq=number_for(message, viewer, revealed),
        sender=message.sender if author_shown else None,
        anonymous=message.anonymous,
        recipients=recipients,
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


def spectator_view(message: PressMessage, revealed: bool) -> PressMessageView:
    """The copy of a public message a spectator may be sent. Never call it for a private one."""
    if message.recipients:
        raise ValueError("A spectator never reads a private message.")
    return PressMessageView(
        id=message.id,
        seq=message.public_number,
        sender=message.sender if revealed or not message.anonymous else None,
        anonymous=message.anonymous,
        recipients=[],
        body=message.body,
        sent_at=message.sent_at,
        season=message.season,
        year=message.year,
        phase=message.phase,
        orders=[],
    )


def spectator_feed(
    messages: list[PressMessage], revealed: bool, after: int = 0
) -> list[PressMessageView]:
    """Every public message numbered after `after` among public messages, oldest first."""
    return [
        spectator_view(message, revealed)
        for message in messages
        if not message.recipients and message.public_number > after
    ]
