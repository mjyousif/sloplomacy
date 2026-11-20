# Press and Diplomacy

Press is the in-match chat of a multiplayer game: a public box everyone reads, private threads between powers, optional anonymity for the author, and *move suggestions* a player can attach to a private message. The server is the only party that knows who really wrote what, so every message is filtered per reader before it leaves the backend. Press lives outside the board state, in its own database column, so chatting and playing never overwrite each other.

## Contents

- [Purpose and user-facing behavior](#purpose-and-user-facing-behavior)
- [Message kinds](#message-kinds)
- [Who sees what](#who-sees-what)
- [Move suggestions](#move-suggestions)
- [Flow across the stack](#flow-across-the-stack)
- [Storage](#storage)
- [Unread tracking and the client store](#unread-tracking-and-the-client-store)
- [Invariants](#invariants)
- [Related docs](#related-docs)

## Purpose and user-facing behavior

Diplomacy is a negotiation game, so seated players need to talk without leaving the app. In a live match a player can:

- post to the **public box**, which every seated player (and any spectator) reads;
- open a **private thread** with one or more other powers by picking recipients (on the Diplomatic Standing rows, via the letter button);
- send either kind **signed** or **anonymous**;
- attach **suggested orders** to a private message during a Movement phase;
- see an **unread** badge on the Press section, the collapsed rail and the phone's Press button.

Only multiplayer matches have press. A hypothetical private copy (`sbx_*`) answers `404`; a solo or saved sandbox (or other non-match game) answers `409`. Only players holding a seat may send; a spectator or a host with no seat is refused with `403` (see [Spectating](spectating.md)). A power that has surrendered can no longer send.

## Message kinds

| Kind | Recipients | Readers before the game ends |
| :--- | :--- | :--- |
| Public, signed | none | every seated player and spectators |
| Public, anonymous | none | same readers; author hidden |
| Private thread, signed | 1 or more powers | sender and recipients |
| Private thread, anonymous | 1 or more powers | sender and recipients; author hidden |

An anonymous one-to-one message appears as a *backchannel* in the recipient's feed. Rules enforced on send:

- body is trimmed; an empty body is only allowed when orders are attached; maximum 1000 characters;
- the sender is dropped from the recipient list; sending only to yourself is refused;
- every recipient power must actually be held by someone;
- a sender may post at most 8 messages per 10 seconds per game (`429` beyond that);
- once the game is over only *signed public* messages may be sent, because everything is already revealed.

## Who sees what

```mermaid
flowchart TD
    M[Stored message: real sender, recipients, anonymous flag] --> R{Game over?}
    R -- yes --> ALL["Every seated player reads everything, every author shown, game-wide numbering"]
    R -- no --> K{Viewer kind}
    K -- Seated player --> P{"Sender or recipient, or public?"}
    P -- no --> HIDE[Not sent at all]
    P -- yes --> A{"Anonymous and viewer is not the sender?"}
    A -- no --> SHOWN[Sender shown]
    A -- yes --> MASK["Sender = null; group thread lists whole thread as recipients"]
    K -- Spectator --> PUB["Public messages only, own numbering, anonymous authors hidden until game over"]
```

Details that are easy to miss:

- **Hidden authors** are hidden from everyone but themselves, the host included.
- In an anonymous **group** thread the recipient list shown to others is the whole thread *including the author*, because the real list omits exactly the author and would give them away. In a **one-to-one** anonymous message the list stays just the recipient.
- **Numbering is per reader.** Each message carries a per-reader number (1, 2, 3 …) rather than the game-wide counter, whose gaps would reveal how much private press others exchange. Spectators have a separate public-only numbering. After the game ends, seated players switch to the game-wide count while spectators keep the public-only numbering.
- A spectator never reads a private message, even after the game ends.

## Move suggestions

A signed private message, or a one-to-one anonymous message, may carry `orders`, proposed moves for the current Movement phase. The server validates and rebuilds them:

- Movement phase only (`409` otherwise); only hold, move, support and convoy are allowed.
- At most one order per unit.
- Signed thread: units of the sender and the recipients. Anonymous backchannel: units of the **recipient only**, so the suggestion cannot point back at the author.
- Provinces must exist (same level of checking as `POST /api/order`); legality is *not* checked.
- A suggestion is just data on the message. It never reads or writes the game's real orders.

On the client, `useSuggestionBoard` swaps a suggestion onto the map the same way a past turn is shown, leaving the player's own orders untouched. The view ends automatically when the turn resolves, the phase stops being Movement, the game ends, or the board is needed for something else (Hypothetical Mode, Direct-Edit, a past turn). Units that have since moved or disappeared are dropped. The recipient can adopt the orders for their own units.

## Flow across the stack

```mermaid
sequenceDiagram
    participant UI as Press composer
    participant API as POST /api/press
    participant Mem as In-memory press
    participant WS as Game sockets
    participant DB as Supabase press column
    UI->>API: power, recipients, anonymous, body, orders
    API->>API: check seat, rate limit, recipients, suggestion
    API->>Mem: number and add message (no await in between)
    API->>WS: broadcast_press
    WS-->>UI: each socket gets only what its seat may read, as it may see it
    API->>DB: persist_press (own write)
    API-->>UI: the sender's own view of the message
```

- **Read**: `GET /api/press` returns the caller's feed oldest first; `after` returns only newer messages by the caller's own numbering. A caller naming a seat they do not hold is refused. A seatless caller gets the public box with `power` null, and a private match then requires its passcode.
- **Live**: new messages arrive on the game socket as a `press` message. A seated socket receives it only if it may read it; a seatless socket only receives public ones. The socket learns its seat from the `auth` handshake, never from the URL.
- **Fallback**: while the socket is down the client polls the feed and catches up with `after` when it reconnects.

## Storage

Press is kept per game in memory, separate from `GameState`, and saved to a dedicated `press` column of the game's `multiplayer_games` row by its own write.

- A game save never touches the press column and a press save never touches the board, so neither can overwrite the other with an older copy.
- Saves are coalesced per game: a save already running picks up messages added meanwhile.
- At most 2000 messages are kept; the oldest are dropped so a row cannot grow forever.
- Messages saved before per-reader numbering existed are numbered when loaded.
- If the load fails the API answers `503` rather than treating the press as empty (which could then overwrite saved press). If the column is missing (migration not applied) press works in memory only and a warning is logged once.

## Unread tracking and the client store

The client keeps press in a small store outside React so the socket, the Press section, the rail and the phone top bar share it without props. Unread is tracked per channel (the public box and each thread) as how far the player has read; reading never moves backwards. When a game ends and the feed is renumbered game-wide, the first revealed load marks what is held as read instead of flagging the whole history as unread. Switching match or seat starts from empty.

## Invariants

- The server never sends a stored message (real sender) to a client; every outgoing copy comes from the view functions in `security/press.py`.
- Anonymity holds against the host and against list-length and numbering leaks.
- A client-supplied `power` only chooses among seats the caller holds.
- Press and board persistence stay independent writes.
- Suggestions never mutate real orders.

## Related docs

- [Spectating](spectating.md)
- [Sandbox and Hypothetical Mode](sandbox-and-hypothetical-mode.md)
- [Admin and creator controls](admin-and-creator-controls.md)
- [Turn clock](turn-clock.md)
- [API reference](../backend/api-reference.md)
- [Database](../architecture/database.md)
- [Service interactions](../architecture/service-interactions.md)
