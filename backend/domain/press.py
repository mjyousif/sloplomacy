"""Press: the messages players send each other in a match (public, private threads, anonymous notes)."""

from domain.board import Power
from domain.orders import Order
from pydantic import BaseModel, Field

MAX_PRESS_BODY_LENGTH = 1000


class PressMessage(BaseModel):
    """A message as the server keeps it. `sender` is always the real author, so never send this
    to a client: `security.press.view_of` makes the copy a given player may see."""

    id: str
    # Counts up within a game, so a client can ask for what it has not seen yet.
    seq: int
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
    # A suggestion: orders the sender proposes for this turn, for units of the sender and the
    # recipients. Empty for a plain message. It is only what the sender attached: it is never
    # read from the game's orders and never written to them.
    orders: list[Order] = Field(default_factory=list)


class PressMessageView(BaseModel):
    """A message as one player sees it. `sender` is None while an anonymous author is hidden."""

    id: str
    seq: int
    sender: Power | None
    anonymous: bool
    recipients: list[Power]
    body: str
    sent_at: str
    season: str
    year: int
    phase: str
    orders: list[Order] = Field(default_factory=list)


class PressFeed(BaseModel):
    """What `GET /api/press` answers: the messages the caller's power may read, oldest first."""

    power: Power
    # True once the game is over: every thread and every anonymous author is shown to the players.
    revealed: bool
    messages: list[PressMessageView]


class PressPostRequest(BaseModel):
    # The seat the caller is writing from. It only picks among the caller's own seats.
    power: Power
    # Empty posts to the public box. Otherwise a private message to these powers.
    recipients: list[Power] = Field(default_factory=list)
    anonymous: bool = False
    # May be empty when `orders` are attached.
    body: str = Field(max_length=MAX_PRESS_BODY_LENGTH * 4)
    # Suggested orders, for a signed private thread in a Movement phase. See PressMessage.orders.
    orders: list[Order] = Field(default_factory=list)
