"""Press: the messages players send each other in a match (the public box and private threads, signed or anonymous)."""

from domain.board import Power
from domain.orders import Order
from pydantic import BaseModel, Field

MAX_PRESS_BODY_LENGTH = 1000


class PressMessage(BaseModel):
    """A message as the server keeps it. `sender` is always the real author, so never send this
    to a client: `security.press.view_of` makes the copy a given player may see."""

    id: str
    # Counts up within the game. It stays on the server: its gaps would show a player how much
    # private press the others exchange.
    seq: int
    # The message's place in each reader's own feed (1, 2, 3...), set when it is sent. This is
    # the `seq` a reader is sent.
    numbers: dict[Power, int] = Field(default_factory=dict)
    # A public message's place among the public messages alone (1, 2, 3...), which is the `seq` a
    # spectator is sent. 0 for a private message, which a spectator never reads.
    public_number: int = 0
    sender: Power
    anonymous: bool = False
    # Empty for public press. Otherwise the powers it was sent to, never including the sender.
    recipients: list[Power] = Field(default_factory=list)
    body: str
    sent_at: str
    # The turn it was sent in.
    season: str
    year: int
    phase: str
    # A suggestion: orders the sender proposes for this turn (Movement, Retreats, or Adjustments).
    # In public press, for any unit or build slot on the board; in a signed thread, for units or
    # build slots of the sender and the recipients; in a one-to-one anonymous backchannel, only
    # for those of the recipient. Empty for a plain message. It is only what the sender attached:
    # it is never read from the game's orders and never written to them.
    orders: list[Order] = Field(default_factory=list)

    def readers(self) -> set[Power]:
        """Who may read it."""
        if not self.recipients:
            return set(Power)
        return {self.sender, *self.recipients}


def number_messages(messages: list[PressMessage]) -> None:
    """Give each message that has no `numbers` yet its place in each reader's feed, and each
    public message that has no `public_number` yet its place among public messages, counting on
    from the messages before it. `messages` is in `seq` order. Press saved before either kind of
    numbering existed is numbered the same way when it is loaded."""
    last: dict[Power, int] = {}
    last_public = 0
    for message in messages:
        if not message.numbers:
            message.numbers = {p: last.get(p, 0) + 1 for p in message.readers()}
        last.update(message.numbers)
        if not message.recipients:
            if not message.public_number:
                message.public_number = last_public + 1
            last_public = message.public_number


class PressMessageView(BaseModel):
    """A message as one player sees it. `sender` is None while an anonymous author is hidden."""

    id: str
    # Its place in this player's own feed, counting from 1.
    seq: int
    sender: Power | None
    anonymous: bool
    # Who it was sent to. While an anonymous author is hidden in a group thread, this lists every
    # power in the thread instead (author included), since the real list leaves out the author.
    # For a one-to-one anonymous message, it lists only the recipient.
    recipients: list[Power]
    body: str
    sent_at: str
    season: str
    year: int
    phase: str
    orders: list[Order] = Field(default_factory=list)


class PressFeed(BaseModel):
    """What `GET /api/press` answers: the messages the caller's power may read, oldest first.

    For a spectator (a viewer with no seat) `power` is None and the feed is the public box alone.
    """

    power: Power | None
    messages: list[PressMessageView]


class PressPostRequest(BaseModel):
    # The seat the caller is writing from. It only picks among the caller's own seats.
    power: Power
    # Empty posts to the public box. Otherwise a private message to these powers.
    recipients: list[Power] = Field(default_factory=list)
    anonymous: bool = False
    # May be empty when `orders` are attached.
    body: str = Field(max_length=MAX_PRESS_BODY_LENGTH * 4)
    # Suggested orders, for public press, a signed private thread, or a one-to-one backchannel.
    orders: list[Order] = Field(default_factory=list)
