"""Press: the messages players send each other in a match (public, private threads, anonymous notes)."""

from domain.board import Power
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
    body: str = Field(max_length=MAX_PRESS_BODY_LENGTH * 4)
