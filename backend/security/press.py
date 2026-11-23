"""Who may read a press message, and what they see of it.

A message is public (no recipients), which every seated player reads, or a private thread
message (recipients), which the sender and the recipients read. Either may be `anonymous`: the
same readers, but nobody is told who wrote it.

An anonymous author is hidden from everyone but themself, the host included. In a group thread
(two or more recipients), a hidden author's message lists the whole thread as its recipients,
author included, since the real list leaves out exactly the author. In a one-to-one anonymous
message (one recipient), `recipients` stays just that recipient so the sender is not revealed.

A spectator (someone watching with no seat) reads the public box alone, numbered by
`PressMessage.public_number`, so the gaps private press would leave never show. An anonymous public
author stays hidden from them. A spectator never reads a private message and never sends.

The `seq` a player is sent numbers the messages they may read 1, 2, 3... (`PressMessage.numbers`),
never the game-wide count, whose gaps would show how much private press the others exchange.
Press visibility, anonymity, and numbering never change when the game ends.
"""

from domain.board import Power
from domain.press import PressMessage, PressMessageView


def can_read(message: PressMessage, viewer: Power) -> bool:
    return viewer in message.readers()


def number_for(message: PressMessage, viewer: Power) -> int:
    """The `seq` `viewer` is sent for `message`: its place in their own feed."""
    return message.numbers.get(viewer, 0)


def _thread_of(message: PressMessage) -> list[Power]:
    """Every power in a message's thread, the sender included; empty for public press."""
    if not message.recipients:
        return []
    return sorted({message.sender, *message.recipients}, key=lambda p: p.value)


def view_of(message: PressMessage, viewer: Power) -> PressMessageView:
    """The copy of `message` that `viewer` may be sent. Call `can_read` first."""
    author_shown = not message.anonymous or viewer == message.sender
    if not author_shown and len(message.recipients) >= 2:
        recipients = _thread_of(message)
    else:
        recipients = list(message.recipients)
    return PressMessageView(
        id=message.id,
        seq=number_for(message, viewer),
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


def feed_for(messages: list[PressMessage], viewer: Power, after: int = 0) -> list[PressMessageView]:
    """Every message `viewer` may read numbered after `after` in their own feed, oldest first."""
    return [
        view_of(message, viewer)
        for message in messages
        if can_read(message, viewer) and number_for(message, viewer) > after
    ]


def spectator_view(message: PressMessage) -> PressMessageView:
    """The copy of a public message a spectator may be sent. Never call it for a private one."""
    if message.recipients:
        raise ValueError("A spectator never reads a private message.")
    return PressMessageView(
        id=message.id,
        seq=message.public_number,
        sender=None if message.anonymous else message.sender,
        anonymous=message.anonymous,
        recipients=[],
        body=message.body,
        sent_at=message.sent_at,
        season=message.season,
        year=message.year,
        phase=message.phase,
        orders=[order.model_copy() for order in message.orders],
    )


def spectator_feed(messages: list[PressMessage], after: int = 0) -> list[PressMessageView]:
    """Every public message numbered after `after` among public messages, oldest first."""
    return [
        spectator_view(message)
        for message in messages
        if not message.recipients and message.public_number > after
    ]
