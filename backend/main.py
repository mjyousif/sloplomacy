import os
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple
import uuid
from fastapi import Depends, FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from auth import AuthUser, get_current_user
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from adjudicator import adjudicate_turn, compute_current_builds, create_diplomacy_game
from map_data import PROVINCES, get_initial_1901_units, get_initial_ownership
from models import (
    AdminDestroyUnitRequest,
    AdminMoveUnitRequest,
    AdminRollbackRequest,
    AdminSetOwnershipRequest,
    AdminSetTurnRequest,
    AdminSpawnUnitRequest,
    AdminStatusResponse,
    CreateGameRequest,
    FinalizeRequest,
    FinalizeResponse,
    GameParticipant,
    GameState,
    GenerateAIOrdersRequest,
    JoinGameRequest,
    LeaveGameRequest,
    MultiplayerGameSummary,
    Order,
    OrderSubmissionRequest,
    OrderType,
    Power,
    ProvinceInfo,
    ProvinceType,
    SaveSandboxRequest,
    ScenarioRequest,
    SimulationResult,
    SingleOrderUpdateRequest,
    SurrenderRequest,
    WebSocketGameUpdate,
    WebSocketLobbyUpdate,
    Unit,
    UnitType,
)
from ai_engine import generate_tactical_orders
from validator import validate_orders
import logging
from database import (
    SupabaseUnavailable,
    delete_game_from_db,
    is_persistence_enabled,
    load_all_summaries_from_db,
    load_game_from_db,
    save_game_to_db,
)

logger = logging.getLogger("diplomacy.server")

app = FastAPI(title="Sloplomacy 1901 Tactical Server", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SCENARIO_IDS = {"standard_1901", "tactical_blunders_demo"}
FIRST_YEAR = 1901
PHASES_BY_SEASON = {
    "Spring": {"Movement", "Retreats"},
    "Fall": {"Movement", "Retreats"},
    "Winter": {"Adjustments"},
}


def validate_order_references(order: Order) -> None:
    """
    Refuse orders naming provinces or coasts that do not exist.

    Real but illegal moves are still accepted: drafting one is allowed, the validator flags it,
    and the engine refuses it at adjudication.
    """
    named_provinces = [order.target, order.aux_unit_origin]
    if order.unit_id.startswith("BUILD_"):
        named_provinces.append(order.origin)
    for code in named_provinces:
        if code and code not in PROVINCES:
            raise HTTPException(status_code=400, detail=f"Unknown province '{code}'.")

    # Builds carry their coast on the unit being built, not on a target.
    if order.target_coast and order.order_type != OrderType.BUILD:
        target_coasts = PROVINCES[order.target].coasts if order.target else []
        if order.target_coast not in target_coasts:
            raise HTTPException(
                status_code=400,
                detail=f"'{order.target}' has no coast '{order.target_coast}'.",
            )


def fleet_coast(unit_type: UnitType, province: ProvinceInfo, requested: Optional[str]) -> Optional[str]:
    """
    Return the coast a unit stands on. Only a fleet on a split-coast province has one.

    An army stored with a coast is unknown to the engine, so it stops existing there: it captures
    nothing, anything can move through it, and it is removed in the next Winter.
    """
    if unit_type != UnitType.FLEET or not province.coasts:
        return None
    return requested if requested in province.coasts else province.coasts[0]


def resolve_static_path(static_root: str, requested: str) -> Optional[str]:
    """Return the file `requested` names inside static_root, or None if it is missing or outside it."""
    root = Path(static_root).resolve()
    try:
        candidate = (root / requested).resolve()
        if candidate.is_relative_to(root) and candidate.is_file():
            return str(candidate)
    except (OSError, ValueError):  # ValueError: the path contains a NUL byte
        pass
    return None


def default_build_slot(power: Power, home: str) -> Order:
    """A home center with no decision yet. Nothing is built unless the player orders it."""
    return Order(
        unit_id=f"BUILD_{power.value}_{home}",
        power=power,
        unit_type=UnitType.ARMY,
        origin=home,
        origin_coast=None,
        order_type=OrderType.WAIVE,
        is_explicit=False,
    )


def create_default_orders(
    units: List[Unit],
    phase: str = "Movement",
    builds: Optional[Dict[str, Any]] = None,
) -> Dict[str, Order]:
    """
    Return what every unit does if nobody orders it, which follows the rulebook: a unit holds, a
    dislodged unit disbands, and a build is waived. The same goes for empty seats and civil disorder.
    """
    orders: Dict[str, Order] = {}
    if phase == "Retreats":
        for u in units:
            orders[u.id] = Order(
                unit_id=u.id,
                power=u.power,
                unit_type=u.unit_type,
                origin=u.province,
                origin_coast=u.coast,
                order_type=OrderType.DISBAND if u.is_dislodged else OrderType.HOLD,
                is_explicit=not u.is_dislodged,
            )
        return orders

    if phase == "Adjustments":
        for u in units:
            p_count = (builds or {}).get(u.power.value, {}).get("count", 0)
            orders[u.id] = Order(
                unit_id=u.id,
                power=u.power,
                unit_type=u.unit_type,
                origin=u.province,
                origin_coast=u.coast,
                order_type=OrderType.HOLD,
                is_explicit=(p_count >= 0),
            )
        if builds:
            for p_name, b_info in builds.items():
                if b_info.get("count", 0) > 0:
                    for h in b_info.get("homes", []):
                        slot = default_build_slot(Power(p_name), h)
                        orders[slot.unit_id] = slot
        return orders

    # Default Movement phase
    for u in units:
        orders[u.id] = Order(
            unit_id=u.id,
            power=u.power,
            unit_type=u.unit_type,
            origin=u.province,
            origin_coast=u.coast,
            order_type=OrderType.HOLD,
            is_explicit=False,
        )
    return orders


def refresh_diagnostics_and_simulation(game: GameState) -> None:
    """Re-run real-time tactical validation and non-destructive turn simulation."""
    if game.winner:
        # Nothing is left to validate or preview; last_resolution keeps the deciding turn.
        game.builds = None
        game.retreats = None
        game.issues = []
        return

    if game.phase == "Adjustments":
        game.builds = compute_current_builds(game.units, game.ownership, game.year)
        game.retreats = None
        for p_name, b_info in game.builds.items():
            if b_info.get("count", 0) > 0:
                for h in b_info.get("homes", []):
                    slot = default_build_slot(Power(p_name), h)
                    game.orders.setdefault(slot.unit_id, slot)
    elif game.phase == "Retreats":
        game.builds = None
        if not game.retreats:
            r_game = create_diplomacy_game(
                game.units, game.ownership, game.season, game.year, "Retreats"
            )
            game.retreats = r_game.get_state().get("retreats", {})
    else:
        game.builds = None
        game.retreats = None

    game.issues = validate_orders(
        game.units,
        game.orders,
        include_unassigned_warnings=False,
        phase=game.phase,
        builds=game.builds,
        retreats=game.retreats,
    )
    game.last_resolution = adjudicate_turn(
        game.units,
        game.orders,
        game.ownership,
        game.season,
        game.year,
        game.phase,
        retreats=game.retreats,
    )


def build_scenario(
    scenario_id: str,
    active_power: Power = Power.FRANCE,
    game_id: str = "proto_1901",
) -> GameState:
    units = get_initial_1901_units()
    ownership = get_initial_ownership()
    orders = create_default_orders(units)

    if scenario_id == "tactical_blunders_demo":
        # France: A PAR -> BUR AND A MAR -> BUR (Self-Bounce in Burgundy!)
        orders["FRA_A_PAR"] = Order(
            unit_id="FRA_A_PAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PAR",
            order_type=OrderType.MOVE,
            target="BUR",
            is_explicit=True,
        )
        orders["FRA_A_MAR"] = Order(
            unit_id="FRA_A_MAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="MAR",
            order_type=OrderType.MOVE,
            target="BUR",
            is_explicit=True,
        )
        orders["FRA_F_BRE"] = Order(
            unit_id="FRA_F_BRE",
            power=Power.FRANCE,
            unit_type=UnitType.FLEET,
            origin="BRE",
            order_type=OrderType.MOVE,
            target="MAO",
            is_explicit=True,
        )
        # England: F LON -> NTH, F EDI supports F LON -> NTH, A LVP -> YOR
        orders["ENG_F_LON"] = Order(
            unit_id="ENG_F_LON",
            power=Power.ENGLAND,
            unit_type=UnitType.FLEET,
            origin="LON",
            order_type=OrderType.MOVE,
            target="NTH",
            is_explicit=True,
        )
        orders["ENG_F_EDI"] = Order(
            unit_id="ENG_F_EDI",
            power=Power.ENGLAND,
            unit_type=UnitType.FLEET,
            origin="EDI",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="LON",
            target="NTH",
            is_explicit=True,
        )
        orders["ENG_A_LVP"] = Order(
            unit_id="ENG_A_LVP",
            power=Power.ENGLAND,
            unit_type=UnitType.ARMY,
            origin="LVP",
            order_type=OrderType.MOVE,
            target="YOR",
            is_explicit=True,
        )

    game = GameState(
        game_id=game_id,
        season="Spring",
        year=1901,
        phase="Movement",
        scenario_id=scenario_id,
        active_power=active_power,
        units=units,
        orders=orders,
        ownership=ownership,
        finalized_powers=[],
        issues=[],
        last_resolution=None,
        turn_history=["Game initialized — Spring 1901 Diplomatic & Movement Phase."],
    )
    refresh_diagnostics_and_simulation(game)
    return game


DEFAULT_GAME_ID = "proto_1901"
GAMES: Dict[str, GameState] = {
    DEFAULT_GAME_ID: build_scenario("standard_1901", Power.FRANCE, DEFAULT_GAME_ID)
}
SANDBOX_CHECKPOINTS: Dict[str, Optional[GameState]] = {
    DEFAULT_GAME_ID: None
}
GAME_HISTORY: Dict[str, List[GameState]] = {
    DEFAULT_GAME_ID: []
}
GAME_SUMMARIES: Dict[str, MultiplayerGameSummary] = {}
GAME_PASSCODES: Dict[str, str] = {}
# Games whose newest state is not confirmed saved, so Supabase may not even have a row for them.
UNSAVED_GAMES: Set[str] = set()
# Games with a save running. The value turns True if the game changes during it, so it repeats.
SAVES_RUNNING: Dict[str, bool] = {}
# Games whose rollback history differs from what is saved. History only changes when a turn does,
# so other saves leave it out: it is the bulk of a save, and every order click saves.
HISTORY_UNSAVED: Set[str] = set()
# Private what-if copies of multiplayer matches: sandbox id -> (match id, the player's power).
# They exist only in this process and are never saved, listed or shown to other players.
PRIVATE_SANDBOXES: Dict[str, Tuple[str, Power]] = {}


def seed_initial_multiplayer_lobbies() -> None:
    now_iso = datetime.now(timezone.utc).isoformat()

    # Seed Game 1: Concert of Europe — Match #104
    g1_id = "mp_concert_104"
    g1_state = build_scenario("standard_1901", Power.FRANCE, g1_id)
    # Give Germany an initial explicit move and mark finalized to make the match feel alive
    g1_state.orders["GER_A_BER"] = Order(
        unit_id="GER_A_BER",
        power=Power.GERMANY,
        unit_type=UnitType.ARMY,
        origin="BER",
        order_type=OrderType.MOVE,
        target="KIE",
        is_explicit=True,
    )
    g1_state.orders["GER_F_KIE"] = Order(
        unit_id="GER_F_KIE",
        power=Power.GERMANY,
        unit_type=UnitType.FLEET,
        origin="KIE",
        order_type=OrderType.MOVE,
        target="DEN",
        is_explicit=True,
    )
    g1_state.orders["GER_A_MUN"] = Order(
        unit_id="GER_A_MUN",
        power=Power.GERMANY,
        unit_type=UnitType.ARMY,
        origin="MUN",
        order_type=OrderType.MOVE,
        target="RUH",
        is_explicit=True,
    )
    g1_state.finalized_powers = []
    refresh_diagnostics_and_simulation(g1_state)
    GAMES[g1_id] = g1_state
    SANDBOX_CHECKPOINTS[g1_id] = None
    GAME_HISTORY[g1_id] = []
    GAME_SUMMARIES[g1_id] = MultiplayerGameSummary(
        game_id=g1_id,
        name="Concert of Europe — Match #104",
        status="active",
        season=g1_state.season,
        year=g1_state.year,
        phase=g1_state.phase,
        created_by="bismarck@diplomacy.eu",
        creator_id="bot_bismarck",
        created_at=now_iso,
        participants={
            "GERMANY": GameParticipant(
                user_id="bot_bismarck",
                email="bismarck@diplomacy.eu",
                display_name="Otto von B.",
                power=Power.GERMANY,
                joined_at=now_iso,
            ),
            "RUSSIA": GameParticipant(
                user_id="bot_romanov",
                email="tsar@diplomacy.eu",
                display_name="Tsar Nicholas",
                power=Power.RUSSIA,
                joined_at=now_iso,
            ),
        },
        finalized_powers=g1_state.finalized_powers,
        is_sandbox=False,
    )

    # Seed Game 2: Mediterranean Crisis 1901
    g2_id = "mp_med_crisis"
    g2_state = build_scenario("standard_1901", Power.ENGLAND, g2_id)
    GAMES[g2_id] = g2_state
    SANDBOX_CHECKPOINTS[g2_id] = None
    GAME_HISTORY[g2_id] = []
    GAME_SUMMARIES[g2_id] = MultiplayerGameSummary(
        game_id=g2_id,
        name="Mediterranean Crisis 1901",
        status="waiting",
        season=g2_state.season,
        year=g2_state.year,
        phase=g2_state.phase,
        created_by="cavour@diplomacy.it",
        creator_id="bot_cavour",
        created_at=now_iso,
        participants={
            "ITALY": GameParticipant(
                user_id="bot_cavour",
                email="cavour@diplomacy.it",
                display_name="Count Cavour",
                power=Power.ITALY,
                joined_at=now_iso,
            ),
        },
        finalized_powers=[],
        is_sandbox=False,
    )


# seed_initial_multiplayer_lobbies()  # Disabled by default so no fake/ghost games clutter the lobby




def evict_game(game_id: str) -> None:
    """Forget everything held in memory for a game, including any private sandboxes of it."""
    if game_id == DEFAULT_GAME_ID:
        return
    GAMES.pop(game_id, None)
    GAME_SUMMARIES.pop(game_id, None)
    GAME_HISTORY.pop(game_id, None)
    GAME_PASSCODES.pop(game_id, None)
    SANDBOX_CHECKPOINTS.pop(game_id, None)
    UNSAVED_GAMES.discard(game_id)
    HISTORY_UNSAVED.discard(game_id)
    PRIVATE_SANDBOXES.pop(game_id, None)
    for sandbox_id, (match_id, _) in list(PRIVATE_SANDBOXES.items()):
        if match_id == game_id:
            evict_game(sandbox_id)


async def persist_game(game_id: str) -> None:
    """
    Persist the specified game to Supabase PostgreSQL if configured.

    Only one save runs per game, so an older write can never land after a newer one. A change
    made during a save is written when that save repeats with the newest state.
    """
    if not is_persistence_enabled():
        return
    if game_id in (DEFAULT_GAME_ID, "proto_1901") or game_id in PRIVATE_SANDBOXES:
        return
    if game_id not in GAMES:
        return

    UNSAVED_GAMES.add(game_id)
    if game_id in SAVES_RUNNING:
        SAVES_RUNNING[game_id] = True
        return

    saved = False
    try:
        repeat = True
        while repeat:
            SAVES_RUNNING[game_id] = False
            state = GAMES.get(game_id)
            if not state:
                return
            sync_summary(game_id)
            # Cleared first so that a turn resolved during this save is sent by the next one.
            send_history = game_id in HISTORY_UNSAVED
            HISTORY_UNSAVED.discard(game_id)
            saved = await save_game_to_db(
                game_id=game_id,
                state=state,
                summary=GAME_SUMMARIES.get(game_id),
                history=GAME_HISTORY.get(game_id, []) if send_history else None,
                passcode=GAME_PASSCODES.get(game_id),
            )
            if send_history and not saved:
                HISTORY_UNSAVED.add(game_id)
            repeat = SAVES_RUNNING[game_id]
    finally:
        SAVES_RUNNING.pop(game_id, None)
    if saved:
        UNSAVED_GAMES.discard(game_id)


@app.on_event("startup")
async def startup_event() -> None:
    if is_persistence_enabled():
        logger.info("Supabase database persistence enabled. Synchronizing active games...")
        try:
            summaries = await load_all_summaries_from_db()
            for gid, summary in summaries.items():
                if gid not in GAME_SUMMARIES:
                    GAME_SUMMARIES[gid] = summary
            logger.info("Loaded %d game summaries from Supabase on startup.", len(summaries))
        except Exception as ex:
            logger.warning("Could not synchronize games on startup: %s", ex)


async def load_saved_game(game_id: str) -> Optional[tuple]:
    """Read a game from Supabase, answering 503 rather than treating a failed read as no game."""
    try:
        return await load_game_from_db(game_id)
    except SupabaseUnavailable as ex:
        raise HTTPException(
            status_code=503,
            detail="Saved games are unavailable right now. Please try again shortly.",
        ) from ex


def cache_loaded_game(game_id: str, loaded: tuple) -> GameState:
    """
    Hold a game read from Supabase in memory and return the copy every request must share.

    Requests overlap on a cold start, so the first copy wins: replacing it would leave a request
    changing a state object that nothing reads any more.
    """
    if game_id in GAMES:
        return GAMES[game_id]
    state, summary, history, passcode = loaded
    GAMES[game_id] = state
    if summary:
        GAME_SUMMARIES[game_id] = summary
    if history:
        GAME_HISTORY[game_id] = history
        # Older rows keep history inside game_state, which the next save replaces.
        HISTORY_UNSAVED.add(game_id)
    if passcode:
        GAME_PASSCODES[game_id] = passcode
    SANDBOX_CHECKPOINTS[game_id] = None
    return state


async def resolve_game(game_id: Optional[str] = None) -> GameState:
    gid = game_id or DEFAULT_GAME_ID
    if gid in GAMES:
        return GAMES[gid]

    if is_persistence_enabled():
        loaded = await load_saved_game(gid)
        if loaded is not None:
            return cache_loaded_game(gid, loaded)

    raise HTTPException(status_code=404, detail=f"Game '{gid}' not found.")


def sync_summary(game_id: str) -> None:
    if game_id in GAME_SUMMARIES and game_id in GAMES:
        st = GAMES[game_id]
        summary = GAME_SUMMARIES[game_id]
        summary.season = st.season
        summary.year = st.year
        summary.phase = st.phase
        summary.finalized_powers = list(st.finalized_powers)
        summary.surrendered_powers = list(st.surrendered_powers)
        if st.winner:
            summary.status = "completed"
        elif summary.status == "completed":
            # A rollback or scenario reset reopened a finished game.
            summary.status = "active" if len(summary.participants) >= 2 else "waiting"


def verify_admin_access(
    game_id: str,
    user: Optional[AuthUser] = None,
) -> None:
    """Verify that the caller has game creator / administrator permissions for this game."""
    gid = game_id or DEFAULT_GAME_ID
    if gid == DEFAULT_GAME_ID:
        # Solo default sandbox has open admin control
        return

    summary = GAME_SUMMARIES.get(gid)
    if not summary or summary.is_sandbox:
        # Standalone or sandbox games allow local play
        return

    # Multiplayer game: require authenticated creator
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required: Provide a valid Supabase Bearer token to modify multiplayer games.",
        )

    is_creator = False
    if summary.creator_id and summary.creator_id == user.user_id:
        is_creator = True
    elif summary.created_by and user.email and summary.created_by.lower() == user.email.lower():
        is_creator = True

    if not is_creator:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Administrator access denied: Only the game creator ({summary.created_by}) can modify game state.",
        )


class ConnectionManager:
    """Manages active WebSocket connections for game rooms and lobby."""

    def __init__(self) -> None:
        self.game_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        self.lobby_connections: Set[WebSocket] = set()

    async def connect_game(self, game_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.game_connections[game_id].add(websocket)

    def disconnect_game(self, game_id: str, websocket: WebSocket) -> None:
        self.game_connections[game_id].discard(websocket)
        if not self.game_connections[game_id]:
            self.game_connections.pop(game_id, None)

    async def connect_lobby(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.lobby_connections.add(websocket)

    def disconnect_lobby(self, websocket: WebSocket) -> None:
        self.lobby_connections.discard(websocket)

    async def broadcast_game(
        self,
        game_id: str,
        state: Optional[GameState] = None,
        summary: Optional[MultiplayerGameSummary] = None,
    ) -> None:
        connections = self.game_connections.get(game_id)
        if not connections:
            return

        if state is None and game_id in GAMES:
            state = GAMES[game_id]
        if summary is None and game_id in GAME_SUMMARIES:
            summary = GAME_SUMMARIES[game_id]
        if state is None:
            return

        payload = {
            "type": "game_update",
            "game_id": game_id,
            "state": state.model_dump(mode="json"),
            "summary": summary.model_dump(mode="json") if summary else None,
        }

        dead: List[WebSocket] = []
        for ws in list(connections):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect_game(game_id, ws)

    async def broadcast_lobby(self) -> None:
        if not self.lobby_connections:
            return

        for gid in list(GAME_SUMMARIES.keys()):
            sync_summary(gid)

        payload = {
            "type": "lobby_update",
            "games": [s.model_dump(mode="json") for s in GAME_SUMMARIES.values()],
        }

        dead: List[WebSocket] = []
        for ws in list(self.lobby_connections):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect_lobby(ws)


manager = ConnectionManager()


async def broadcast_game_update(
    game_id: str,
    state: Optional[GameState] = None,
    summary: Optional[MultiplayerGameSummary] = None,
) -> None:
    sync_summary(game_id)
    await manager.broadcast_game(game_id, state=state, summary=summary)


async def broadcast_lobby_update() -> None:
    await manager.broadcast_lobby()


class GameBootstrapResponse(BaseModel):
    state: GameState
    provinces: Dict[str, ProvinceInfo]
    summary: Optional[MultiplayerGameSummary] = None


class SetPowerRequest(BaseModel):
    power: Power


async def sync_lobby_with_db() -> None:
    """
    Pick up games this process has not loaded and drop games deleted from Supabase.

    Memory holds the newest state of a loaded game, so a database copy never replaces it here.
    A game is only taken as deleted when the read succeeded and the game was already saved.
    """
    # A first save can finish while this read runs, so also spare games unsaved when it began.
    unsaved_at_read = set(UNSAVED_GAMES)
    try:
        db_summaries = await load_all_summaries_from_db()
    except SupabaseUnavailable as ex:
        logger.warning("Showing the lobby from memory: %s", ex)
        return

    evicted = False
    for gid in list(GAME_SUMMARIES.keys()):
        if gid not in db_summaries and gid not in unsaved_at_read and gid not in UNSAVED_GAMES:
            evict_game(gid)
            evicted = True

    for gid, summary in db_summaries.items():
        if gid not in GAMES:
            GAME_SUMMARIES[gid] = summary

    if evicted:
        await manager.broadcast_lobby()


@app.get("/api/games", response_model=List[MultiplayerGameSummary])
async def list_games():
    """Return all multiplayer games and saved sessions."""
    GAME_SUMMARIES.pop(DEFAULT_GAME_ID, None)
    GAME_SUMMARIES.pop("proto_1901", None)
    if is_persistence_enabled():
        await sync_lobby_with_db()

    for gid in list(GAME_SUMMARIES.keys()):
        if gid not in (DEFAULT_GAME_ID, "proto_1901"):
            sync_summary(gid)
    return [s for gid, s in GAME_SUMMARIES.items() if gid not in (DEFAULT_GAME_ID, "proto_1901")]


@app.get("/api/games/{game_id}", response_model=MultiplayerGameSummary)
async def get_game_details(game_id: str):
    """Retrieve details for a single game lobby by its Game ID."""
    if is_persistence_enabled():
        unsaved_at_read = game_id in UNSAVED_GAMES
        try:
            loaded = await load_game_from_db(game_id)
        except SupabaseUnavailable:
            # Whatever is in memory is still good; only a game known nowhere is unanswerable.
            if game_id not in GAME_SUMMARIES:
                raise HTTPException(
                    status_code=503,
                    detail="Saved games are unavailable right now. Please try again shortly.",
                )
        else:
            if loaded is not None:
                cache_loaded_game(game_id, loaded)
            elif not unsaved_at_read and game_id not in UNSAVED_GAMES:
                evict_game(game_id)

    sync_summary(game_id)
    summary = GAME_SUMMARIES.get(game_id)
    if not summary:
        raise HTTPException(status_code=404, detail=f"Game lobby '{game_id}' not found.")
    return summary


@app.delete("/api/games/{game_id}")
async def delete_game(
    game_id: str,
    user: Optional[AuthUser] = Depends(get_current_user),
):
    """Delete a game lobby and its persisted state in Supabase."""
    if game_id == DEFAULT_GAME_ID:
        raise HTTPException(status_code=403, detail="The shared sandbox board cannot be deleted.")

    summary = GAME_SUMMARIES.get(game_id)
    if not summary and is_persistence_enabled():
        loaded = await load_saved_game(game_id)
        if loaded:
            _, summary, _, _ = loaded

    if not summary and game_id not in GAMES:
        return {"status": "deleted", "game_id": game_id}

    if summary and not summary.is_sandbox:
        if summary.creator_id and summary.creator_id != "guest":
            if not user or (user.user_id != summary.creator_id and user.email != summary.created_by):
                raise HTTPException(status_code=403, detail="Only the host can delete this campaign.")

    evict_game(game_id)
    if is_persistence_enabled():
        await delete_game_from_db(game_id)

    await manager.broadcast_lobby()
    return {"status": "deleted", "game_id": game_id}


@app.post("/api/games", response_model=MultiplayerGameSummary)
async def create_multiplayer_game(req: CreateGameRequest):
    """Create a new multiplayer game and assign creator_power to the user."""
    gid = f"mp_{uuid.uuid4().hex[:6]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    game_state = build_scenario("standard_1901", req.creator_power, gid)
    GAMES[gid] = game_state
    SANDBOX_CHECKPOINTS[gid] = None
    GAME_HISTORY[gid] = []

    is_priv = bool(req.is_private)
    clean_passcode = req.passcode.strip() if req.passcode else None
    has_pw = bool(is_priv and clean_passcode)
    if has_pw:
        GAME_PASSCODES[gid] = clean_passcode

    display_name = req.display_name or req.email.split("@")[0]
    participant = GameParticipant(
        user_id=req.user_id,
        email=req.email,
        display_name=display_name,
        power=req.creator_power,
        joined_at=now_iso,
    )
    summary = MultiplayerGameSummary(
        game_id=gid,
        name=req.name.strip() or "1901 Diplomatic Theater",
        status="waiting",
        season=game_state.season,
        year=game_state.year,
        phase=game_state.phase,
        created_by=req.email,
        creator_id=req.user_id,
        created_at=now_iso,
        participants={req.creator_power.value: participant},
        finalized_powers=[],
        is_sandbox=False,
        is_private=is_priv,
        has_passcode=has_pw,
    )
    GAME_SUMMARIES[gid] = summary
    await persist_game(gid)
    await broadcast_lobby_update()
    return summary


@app.post("/api/games/{game_id}/join", response_model=GameBootstrapResponse)
async def join_multiplayer_game(game_id: str, req: JoinGameRequest):
    """Claim a power in a multiplayer match (or re-enter if already claimed by this user)."""
    game_state = await resolve_game(game_id)
    summary = GAME_SUMMARIES.get(game_id)
    if not summary:
        raise HTTPException(status_code=404, detail=f"Game lobby '{game_id}' not found.")

    # Passcode verification for private lobbies
    if summary.has_passcode:
        is_already_participant = any(p.user_id == req.user_id for p in summary.participants.values())
        if not is_already_participant:
            expected_pw = GAME_PASSCODES.get(game_id)
            provided_pw = (req.passcode or "").strip()
            if not expected_pw or provided_pw != expected_pw:
                raise HTTPException(
                    status_code=403,
                    detail="Passcode required or incorrect for this private campaign.",
                )

    existing = summary.participants.get(req.power.value)
    if existing and existing.user_id != req.user_id:
        raise HTTPException(
            status_code=409,
            detail=f"{req.power.value} is already claimed by {existing.display_name}.",
        )

    # Remove previous power claim by this same user in this game so 1 user = 1 power per multiplayer match
    for p_key, part in list(summary.participants.items()):
        if part.user_id == req.user_id and p_key != req.power.value:
            del summary.participants[p_key]

    now_iso = datetime.now(timezone.utc).isoformat()
    display_name = req.display_name or req.email.split("@")[0]
    summary.participants[req.power.value] = GameParticipant(
        user_id=req.user_id,
        email=req.email,
        display_name=display_name,
        power=req.power,
        joined_at=now_iso,
    )
    if len(summary.participants) >= 2 and summary.status == "waiting":
        summary.status = "active"

    if req.power in game_state.surrendered_powers:
        game_state.surrendered_powers.remove(req.power)
        game_state.turn_history.append(
            f"Envoy {display_name} has assumed sovereign command of {req.power.value} from Civil Disorder."
        )

    # Everyone in a multiplayer game shares this state, so claiming a seat must not change it:
    # only the joiner's own response reports their power. A saved sandbox has a single player.
    if summary.is_sandbox:
        game_state.active_power = req.power
    refresh_diagnostics_and_simulation(game_state)
    sync_summary(game_id)
    await persist_game(game_id)
    await broadcast_game_update(game_id, game_state, summary)
    await broadcast_lobby_update()
    return GameBootstrapResponse(
        state=game_state.model_copy(update={"active_power": req.power}),
        provinces=PROVINCES,
        summary=summary,
    )


@app.post("/api/games/{game_id}/leave", response_model=GameBootstrapResponse)
async def leave_game(game_id: str, req: LeaveGameRequest):
    """Leave a multiplayer match (vacating claimed power) or remove a saved sandbox scenario."""
    game_state = await resolve_game(game_id)
    summary = GAME_SUMMARIES.get(game_id)
    if not summary:
        raise HTTPException(status_code=404, detail=f"Game lobby '{game_id}' not found.")

    # Saved sandbox scenario deletion
    if summary.is_sandbox:
        if summary.creator_id == req.user_id or summary.created_by == req.email:
            evict_game(game_id)
            if is_persistence_enabled():
                await delete_game_from_db(game_id)
            await broadcast_lobby_update()
            return GameBootstrapResponse(
                state=game_state,
                provinces=PROVINCES,
                summary=None,
            )

    # Locate participant entries for this user
    leaving_powers: List[Power] = []
    for p_key, part in list(summary.participants.items()):
        if part.user_id == req.user_id and (req.power is None or part.power == req.power):
            leaving_powers.append(part.power)
            del summary.participants[p_key]

    if not leaving_powers and req.power:
        p_val = req.power.value if hasattr(req.power, "value") else str(req.power)
        if p_val in summary.participants and summary.participants[p_val].user_id == req.user_id:
            leaving_powers.append(summary.participants[p_val].power)
            del summary.participants[p_val]

    if not leaving_powers:
        raise HTTPException(status_code=400, detail="User is not an active participant in this game.")

    for pwr in leaving_powers:
        if pwr in game_state.finalized_powers:
            game_state.finalized_powers.remove(pwr)

        put_into_civil_disorder(game_state, pwr)

        power_label = pwr.value if hasattr(pwr, "value") else str(pwr)
        game_state.turn_history.append(
            f"The envoy of {power_label} has vacated their seat and left the campaign. Imperial units stand in Civil Disorder."
        )

    # If all participants left or waiting lobby emptied, delete match
    if len(summary.participants) == 0:
        evict_game(game_id)
        if is_persistence_enabled():
            await delete_game_from_db(game_id)
        await broadcast_lobby_update()
        return GameBootstrapResponse(
            state=game_state,
            provinces=PROVINCES,
            summary=None,
        )

    # If game status was active and fewer than 2 participants remain, revert to waiting
    if len(summary.participants) < 2 and summary.status == "active":
        summary.status = "waiting"

    refresh_diagnostics_and_simulation(game_state)
    sync_summary(game_id)
    await persist_game(game_id)
    await broadcast_game_update(game_id, game_state, summary)
    await broadcast_lobby_update()
    # The player leaving may have been the last one everybody was waiting for.
    if everyone_is_ready(game_state):
        await _execute_adjudication(game_state)
    return GameBootstrapResponse(
        state=game_state,
        provinces=PROVINCES,
        summary=summary,
    )


@app.post("/api/games/{game_id}/surrender", response_model=GameBootstrapResponse)
async def surrender_power(game_id: str, req: SurrenderRequest):
    """Concede defeat/surrender sovereign command of a Great Power into Civil Disorder."""
    game_state = await resolve_game(game_id)
    summary = GAME_SUMMARIES.get(game_id)
    if not summary:
        raise HTTPException(status_code=404, detail=f"Game lobby '{game_id}' not found.")

    p_val = req.power.value if hasattr(req.power, "value") else str(req.power)
    part = summary.participants.get(p_val)
    if part and part.user_id != req.user_id:
        raise HTTPException(
            status_code=403,
            detail=f"You do not command {p_val} in this campaign.",
        )

    if req.power not in game_state.surrendered_powers:
        game_state.surrendered_powers.append(req.power)

    put_into_civil_disorder(game_state, req.power)

    if req.power in game_state.finalized_powers:
        game_state.finalized_powers.remove(req.power)

    disp = part.display_name if part else "Envoy"
    game_state.turn_history.append(
        f"{p_val} ({disp}) has formally surrendered! Sovereign forces have entered Civil Disorder."
    )

    if req.leave:
        if p_val in summary.participants:
            del summary.participants[p_val]
        if len(summary.participants) < 2 and summary.status == "active":
            summary.status = "waiting"
    else:
        if part:
            part.surrendered = True
            part.surrendered_at = datetime.now(timezone.utc).isoformat()

    refresh_diagnostics_and_simulation(game_state)
    sync_summary(game_id)
    await persist_game(game_id)
    await broadcast_game_update(game_id, game_state, summary)
    await broadcast_lobby_update()
    # The player leaving may have been the last one everybody was waiting for.
    if everyone_is_ready(game_state):
        await _execute_adjudication(game_state)
    return GameBootstrapResponse(
        state=game_state,
        provinces=PROVINCES,
        summary=summary,
    )


@app.post("/api/games/save-sandbox", response_model=MultiplayerGameSummary)
async def save_sandbox_to_account(req: SaveSandboxRequest, game_id: Optional[str] = Query(default=None)):
    """Save the current sandbox game state into the authenticated user's personal games."""
    source_game = await resolve_game(game_id)
    new_gid = f"saved_{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    cloned_state = source_game.model_copy(deep=True)
    cloned_state.game_id = new_gid
    GAMES[new_gid] = cloned_state
    SANDBOX_CHECKPOINTS[new_gid] = None
    GAME_HISTORY[new_gid] = []

    display_name = req.display_name or req.email.split("@")[0]
    summary = MultiplayerGameSummary(
        game_id=new_gid,
        name=req.name.strip() or f"Saved Tactical Sandbox ({cloned_state.season} {cloned_state.year})",
        status="active",
        season=cloned_state.season,
        year=cloned_state.year,
        phase=cloned_state.phase,
        created_by=req.email,
        creator_id=req.user_id,
        created_at=now_iso,
        participants={
            cloned_state.active_power.value: GameParticipant(
                user_id=req.user_id,
                email=req.email,
                display_name=display_name,
                power=cloned_state.active_power,
                joined_at=now_iso,
            )
        },
        finalized_powers=list(cloned_state.finalized_powers),
        is_sandbox=True,
    )
    GAME_SUMMARIES[new_gid] = summary
    await persist_game(new_gid)
    await broadcast_lobby_update()
    return summary


@app.get("/api/game", response_model=GameBootstrapResponse)
async def get_game(game_id: Optional[str] = Query(default=None)):
    game = await resolve_game(game_id)
    refresh_diagnostics_and_simulation(game)
    gid = game.game_id
    sync_summary(gid)
    return GameBootstrapResponse(
        state=game,
        provinces=PROVINCES,
        summary=GAME_SUMMARIES.get(gid),
    )


@app.post("/api/power", response_model=GameState)
async def set_active_power(req: SetPowerRequest, game_id: Optional[str] = Query(default=None)):
    game = await resolve_game(game_id)
    gid = game.game_id
    game.active_power = req.power
    checkpoint = SANDBOX_CHECKPOINTS.get(gid)
    if checkpoint is not None:
        checkpoint.active_power = req.power
    refresh_diagnostics_and_simulation(game)
    await broadcast_game_update(gid, game)
    return game


def put_into_civil_disorder(game: GameState, power: Power) -> None:
    """Drop a power's orders for what it does with nobody in command, including any chosen builds."""
    defaults = create_default_orders(game.units, game.phase, game.builds)
    kept_orders = {ord_id: o for ord_id, o in game.orders.items() if o.power != power}
    own_defaults = {ord_id: o for ord_id, o in defaults.items() if o.power == power}
    game.orders = {**kept_orders, **own_defaults}


def is_multiplayer_match(game_id: str) -> bool:
    """True for a game shared by several players, as opposed to a solo or saved sandbox."""
    summary = GAME_SUMMARIES.get(game_id)
    return bool(summary and not summary.is_sandbox)


def reject_on_multiplayer_match(game_id: str) -> None:
    """Refuse hypothetical work on a shared match: it belongs on a private sandbox copy."""
    if is_multiplayer_match(game_id):
        raise HTTPException(
            status_code=409,
            detail="This is a live match. Hypothetical orders belong in a private sandbox.",
        )


def reset_foreign_orders(game: GameState, power: Power) -> None:
    """Put every power except `power` back on its default orders."""
    defaults = create_default_orders(game.units, game.phase, game.builds)
    own_orders = {ord_id: o for ord_id, o in game.orders.items() if o.power == power}
    foreign_orders = {ord_id: o for ord_id, o in defaults.items() if o.power != power}
    game.orders = {**foreign_orders, **own_orders}


def open_private_sandbox(match: GameState, power: Power) -> GameState:
    """
    Copy a multiplayer match for one player to experiment on.

    The match itself is untouched, and the copy starts with default orders for every other power
    so that opening it cannot reveal what they have planned.
    """
    for sandbox_id, owner in list(PRIVATE_SANDBOXES.items()):
        if owner == (match.game_id, power):
            evict_game(sandbox_id)

    sandbox_id = f"sbx_{uuid.uuid4().hex[:8]}"
    sandbox = match.model_copy(deep=True)
    sandbox.game_id = sandbox_id
    sandbox.active_power = power
    reset_foreign_orders(sandbox, power)
    GAMES[sandbox_id] = sandbox
    SANDBOX_CHECKPOINTS[sandbox_id] = None
    PRIVATE_SANDBOXES[sandbox_id] = (match.game_id, power)
    refresh_diagnostics_and_simulation(sandbox)
    return sandbox


async def close_private_sandbox(sandbox: GameState) -> GameState:
    """
    Discard a private sandbox and return the real match.

    The player's own orders are carried over if the match is still on the same turn and they
    still hold the seat. Nothing else reaches the match, and a player who changed nothing keeps
    their finalization.
    """
    match_id, power = PRIVATE_SANDBOXES[sandbox.game_id]
    evict_game(sandbox.game_id)
    match = await resolve_game(match_id)

    summary = GAME_SUMMARIES.get(match_id)
    holds_seat = bool(
        summary and power.value in summary.participants and power not in match.surrendered_powers
    )
    same_turn = (match.season, match.year, match.phase) == (sandbox.season, sandbox.year, sandbox.phase)
    changed_orders = {
        ord_id: o
        for ord_id, o in sandbox.orders.items()
        if o.power == power and match.orders.get(ord_id) != o
    }
    if not (holds_seat and same_turn and changed_orders):
        return match

    match.orders.update(changed_orders)
    if power in match.finalized_powers:
        match.finalized_powers.remove(power)
    refresh_diagnostics_and_simulation(match)
    sync_summary(match_id)
    await persist_game(match_id)
    await broadcast_game_update(match_id, match)
    await broadcast_lobby_update()
    return match


@app.post("/api/sandbox/enter", response_model=GameState)
async def enter_sandbox_mode(req: SetPowerRequest, game_id: Optional[str] = Query(default=None)):
    """
    Enter Sandbox Pre-Move Mode.

    A multiplayer match is shared, so its player gets a private copy: the returned state carries
    that copy's game_id, which every later sandbox call must use. A solo or saved sandbox has one
    player, so it stays on its own game and a checkpoint of the real state is saved.
    """
    game = await resolve_game(game_id)
    gid = game.game_id
    if is_multiplayer_match(gid):
        return open_private_sandbox(game, req.power)

    game.active_power = req.power
    SANDBOX_CHECKPOINTS[gid] = game.model_copy(deep=True)
    refresh_diagnostics_and_simulation(game)
    await broadcast_game_update(gid, game)
    return game


@app.post("/api/sandbox/exit", response_model=GameState)
async def exit_sandbox_mode(req: SetPowerRequest, game_id: Optional[str] = Query(default=None)):
    """
    Exit Sandbox Pre-Move Mode:
    - A private sandbox of a multiplayer match is discarded and the real match is returned.
    - If the user stepped turns forward in the sandbox, restore the pre-sandbox turn checkpoint.
    - Discard all hypothetical foreign orders so only the active power's own orders remain.
    """
    game = await resolve_game(game_id)
    gid = game.game_id
    if gid in PRIVATE_SANDBOXES:
        return await close_private_sandbox(game)
    reject_on_multiplayer_match(gid)

    checkpoint = SANDBOX_CHECKPOINTS.get(gid)
    if checkpoint is not None:
        same_turn = (
            game.season == checkpoint.season
            and game.year == checkpoint.year
            and game.phase == checkpoint.phase
        )
        saved_own_orders: Dict[str, Order] = {}
        if same_turn:
            for uid, ord_obj in game.orders.items():
                if ord_obj.power == req.power:
                    saved_own_orders[uid] = ord_obj.model_copy(deep=True)

        restored = checkpoint.model_copy(deep=True)
        restored.active_power = req.power
        for uid, ord_obj in saved_own_orders.items():
            restored.orders[uid] = ord_obj
        GAMES[gid] = restored
        game = restored
        SANDBOX_CHECKPOINTS[gid] = None

    reset_foreign_orders(game, req.power)

    refresh_diagnostics_and_simulation(game)
    sync_summary(gid)
    await persist_game(gid)
    await broadcast_game_update(gid, game)
    await broadcast_lobby_update()
    return game


@app.post("/api/sandbox/clear-foreign", response_model=GameState)
async def clear_foreign_pre_moves(req: SetPowerRequest, game_id: Optional[str] = Query(default=None)):
    """Reset all hypothetical orders for powers other than req.power back to default."""
    game = await resolve_game(game_id)
    reject_on_multiplayer_match(game.game_id)
    reset_foreign_orders(game, req.power)
    refresh_diagnostics_and_simulation(game)
    await persist_game(game.game_id)
    await broadcast_game_update(game.game_id, game)
    return game


@app.post("/api/sandbox/ai-orders", response_model=GameState)
async def generate_sandbox_ai_orders(
    req: Optional[GenerateAIOrdersRequest] = None,
    game_id: Optional[str] = Query(default=None),
):
    """Generate intelligent tactical orders for specified Great Powers or all foreign powers."""
    game = await resolve_game(game_id)
    reject_on_multiplayer_match(game.game_id)
    if req and req.powers:
        target_powers = req.powers
    elif req and req.include_active:
        target_powers = list(Power)
    else:
        target_powers = [p for p in Power if p != game.active_power]

    ai_orders = generate_tactical_orders(
        units=game.units,
        ownership=game.ownership,
        season=game.season,
        year=game.year,
        phase=game.phase,
        target_powers=target_powers,
        retreats=game.retreats,
        builds=game.builds,
    )
    for ord_id, ord_obj in ai_orders.items():
        game.orders[ord_id] = ord_obj

    refresh_diagnostics_and_simulation(game)
    sync_summary(game.game_id)
    await persist_game(game.game_id)
    await broadcast_game_update(game.game_id, game)
    return game


@app.post("/api/sandbox/ai-step", response_model=GameState)
async def step_turn_with_ai(game_id: Optional[str] = Query(default=None)):
    """Auto-plan unassigned foreign powers with tactical AI and advance to next phase."""
    game = await resolve_game(game_id)
    reject_on_multiplayer_match(game.game_id)
    # Outside Movement the holds of undisturbed units are explicit by default, so they prove nothing.
    powers_needing_orders = [
        p for p in Power
        if p != game.active_power or not any(
            o.power == p and o.is_explicit and (game.phase == "Movement" or o.order_type != OrderType.HOLD)
            for o in game.orders.values()
        )
    ]
    ai_orders = generate_tactical_orders(
        units=game.units,
        ownership=game.ownership,
        season=game.season,
        year=game.year,
        phase=game.phase,
        target_powers=powers_needing_orders,
        retreats=game.retreats,
        builds=game.builds,
    )
    for ord_id, ord_obj in ai_orders.items():
        game.orders[ord_id] = ord_obj

    return await _execute_adjudication(game)


@app.post("/api/order", response_model=GameState)
async def update_single_order(req: SingleOrderUpdateRequest, game_id: Optional[str] = Query(default=None)):
    game = await resolve_game(game_id)
    validate_order_references(req.order)
    unit_map = {u.id: u for u in game.units}
    if req.order.unit_id in unit_map:
        unit = unit_map[req.order.unit_id]
        updated_order = req.order.model_copy()
        updated_order.power = unit.power
        updated_order.unit_type = unit.unit_type
        updated_order.origin = unit.province
        updated_order.origin_coast = unit.coast
        if unit.unit_type == UnitType.ARMY:
            updated_order.target_coast = None
        game.orders[unit.id] = updated_order

        # In Winter Adjustments when count < 0, cap DISBAND orders to abs(count)
        if (
            game.phase == "Adjustments"
            and updated_order.order_type == OrderType.DISBAND
            and game.builds
        ):
            b_info = game.builds.get(unit.power.value, {})
            max_disbands = abs(b_info.get("count", 0)) if b_info.get("count", 0) < 0 else 0
            if max_disbands > 0:
                other_disbands = [
                    game.orders[u.id]
                    for u in game.units
                    if u.power == unit.power
                    and u.id != unit.id
                    and u.id in game.orders
                    and game.orders[u.id].order_type == OrderType.DISBAND
                ]
                while 1 + len(other_disbands) > max_disbands:
                    to_keep = other_disbands.pop(0)
                    to_keep.order_type = OrderType.HOLD

        if unit.power in game.finalized_powers:
            game.finalized_powers.remove(unit.power)
    elif req.order.unit_id.startswith("BUILD_"):
        updated_build = req.order.model_copy()
        if updated_build.unit_type == UnitType.ARMY:
            updated_build.origin_coast = None
        game.orders[req.order.unit_id] = updated_build

        # If user selects BUILD on a home center when max build slots are already full, auto-waive an excess slot
        if (
            game.phase == "Adjustments"
            and updated_build.order_type == OrderType.BUILD
            and game.builds
        ):
            p_name = updated_build.power.value
            b_info = game.builds.get(p_name, {})
            homes = b_info.get("homes", [])
            max_builds = min(b_info.get("count", 0), len(homes))
            if max_builds > 0:
                other_builds = [
                    game.orders[ f"BUILD_{p_name}_{h}" ]
                    for h in homes
                    if f"BUILD_{p_name}_{h}" != req.order.unit_id
                    and f"BUILD_{p_name}_{h}" in game.orders
                    and game.orders[f"BUILD_{p_name}_{h}"].order_type == OrderType.BUILD
                ]
                # Prefer waiving unconfirmed default builds before explicit builds
                other_builds.sort(key=lambda o: o.is_explicit)
                while 1 + len(other_builds) > max_builds:
                    to_waive = other_builds.pop(0)
                    to_waive.order_type = OrderType.WAIVE

        if req.order.power in game.finalized_powers:
            game.finalized_powers.remove(req.order.power)
    else:
        raise HTTPException(status_code=404, detail=f"Unit or build order {req.order.unit_id} not found.")

    if req.active_power:
        game.active_power = req.active_power

    refresh_diagnostics_and_simulation(game)
    sync_summary(game.game_id)
    await persist_game(game.game_id)
    await broadcast_game_update(game.game_id, game)
    return game


@app.post("/api/orders/batch", response_model=GameState)
async def update_batch_orders(req: OrderSubmissionRequest, game_id: Optional[str] = Query(default=None)):
    game = await resolve_game(game_id)
    # Check the whole batch first so that one bad order cannot leave it half applied.
    for o in req.orders:
        validate_order_references(o)
    unit_map = {u.id: u for u in game.units}
    for o in req.orders:
        if o.unit_id in unit_map:
            u = unit_map[o.unit_id]
            updated = o.model_copy()
            updated.power = u.power
            updated.unit_type = u.unit_type
            updated.origin = u.province
            updated.origin_coast = u.coast
            if u.unit_type == UnitType.ARMY:
                updated.target_coast = None
            game.orders[u.id] = updated
        elif o.unit_id.startswith("BUILD_"):
            updated_b = o.model_copy()
            if updated_b.unit_type == UnitType.ARMY:
                updated_b.origin_coast = None
            game.orders[o.unit_id] = updated_b

    if req.power in game.finalized_powers:
        game.finalized_powers.remove(req.power)

    refresh_diagnostics_and_simulation(game)
    sync_summary(game.game_id)
    await persist_game(game.game_id)
    await broadcast_game_update(game.game_id, game)
    await broadcast_lobby_update()
    return game


@app.post("/api/orders/confirm-all", response_model=GameState)
async def confirm_all_power_orders(req: SetPowerRequest, game_id: Optional[str] = Query(default=None)):
    game = await resolve_game(game_id)
    for ord_id, ord_obj in game.orders.items():
        if ord_obj.power == req.power:
            ord_obj.is_explicit = True
    refresh_diagnostics_and_simulation(game)
    await persist_game(game.game_id)
    await broadcast_game_update(game.game_id, game)
    return game


def get_required_finalizing_powers(game: GameState, summary: Optional[MultiplayerGameSummary] = None) -> List[Power]:
    """Determine which powers must finalize before auto-adjudication occurs in multiplayer."""
    if not summary or summary.is_sandbox:
        return []

    claimed_powers: List[Power] = []
    for p_key, part in summary.participants.items():
        if not part.surrendered and part.power not in game.surrendered_powers:
            claimed_powers.append(part.power)

    if not claimed_powers:
        return []

    if game.phase == "Movement":
        powers_with_units = {u.power for u in game.units}
        return [p for p in claimed_powers if p in powers_with_units]

    elif game.phase == "Retreats":
        dislodged_powers = {u.power for u in game.units if u.is_dislodged}
        if game.retreats:
            for p_str, r_opts in game.retreats.items():
                if r_opts:
                    try:
                        dislodged_powers.add(Power(p_str))
                    except ValueError:
                        pass
        return [p for p in claimed_powers if p in dislodged_powers]

    elif game.phase == "Adjustments":
        adj_powers: Set[Power] = set()
        if game.builds:
            for p_str, b_dict in game.builds.items():
                count = b_dict.get("count", 0) if isinstance(b_dict, dict) else 0
                # A power owed builds with every home center occupied has no decision to make.
                if count < 0 or (count > 0 and b_dict.get("homes")):
                    try:
                        adj_powers.add(Power(p_str))
                    except ValueError:
                        pass
        return [p for p in claimed_powers if p in adj_powers]

    return claimed_powers


@app.post("/api/finalize", response_model=FinalizeResponse)
async def finalize_power_orders(req: FinalizeRequest, game_id: Optional[str] = Query(default=None)):
    game = await resolve_game(game_id)
    power_issues = validate_orders(
        game.units,
        game.orders,
        include_unassigned_warnings=True,
        target_power=req.power,
        phase=game.phase,
        builds=game.builds,
        retreats=game.retreats,
    )

    if power_issues and not req.force:
        refresh_diagnostics_and_simulation(game)
        return FinalizeResponse(
            finalized=False,
            requires_confirmation=True,
            issues=power_issues,
            state=game,
        )

    for ord_id, ord_obj in game.orders.items():
        if ord_obj.power == req.power:
            ord_obj.is_explicit = True

    if req.power not in game.finalized_powers:
        game.finalized_powers.append(req.power)

    refresh_diagnostics_and_simulation(game)
    sync_summary(game.game_id)
    await broadcast_game_update(game.game_id, game)
    await broadcast_lobby_update()

    # In active multiplayer matches, auto-adjudicate if all required participants have finalized
    if everyone_is_ready(game):
        await _execute_adjudication(game)
    else:
        await persist_game(game.game_id)
    return FinalizeResponse(
        finalized=True,
        requires_confirmation=False,
        issues=power_issues,
        state=game,
    )


@app.post("/api/unfinalize", response_model=GameState)
async def unfinalize_power_orders(req: SetPowerRequest, game_id: Optional[str] = Query(default=None)):
    game = await resolve_game(game_id)
    if req.power in game.finalized_powers:
        game.finalized_powers.remove(req.power)
    refresh_diagnostics_and_simulation(game)
    sync_summary(game.game_id)
    await persist_game(game.game_id)
    await broadcast_game_update(game.game_id, game)
    await broadcast_lobby_update()
    return game


@app.post("/api/simulate", response_model=SimulationResult)
async def simulate_current_orders(game_id: Optional[str] = Query(default=None)):
    game = await resolve_game(game_id)
    refresh_diagnostics_and_simulation(game)
    assert game.last_resolution is not None
    return game.last_resolution


def everyone_is_ready(game: GameState) -> bool:
    """True when a live multiplayer match has nobody left to wait for."""
    summary = GAME_SUMMARIES.get(game.game_id)
    if not summary or summary.is_sandbox or summary.status != "active" or game.winner:
        return False
    required = get_required_finalizing_powers(game, summary)
    if required:
        return all(p in game.finalized_powers for p in required)
    # Retreats and adjustments with no player involved just play out. A movement phase waits, or
    # a match whose players have all been eliminated or surrendered would run on by itself.
    return game.phase != "Movement"


async def _execute_adjudication(game: GameState) -> GameState:
    gid = game.game_id

    if game.winner:
        raise HTTPException(status_code=409, detail=f"Game over: {game.winner.value} has already won.")

    # Save deep copy snapshot to history before adjudicating so creator can roll back.
    # Rollback recomputes the previews and diagnostics, so the snapshot does not carry them.
    if gid not in GAME_HISTORY:
        GAME_HISTORY[gid] = []
    GAME_HISTORY[gid].append(game.model_copy(deep=True, update={"last_resolution": None, "issues": []}))
    if len(GAME_HISTORY[gid]) > 30:
        GAME_HISTORY[gid].pop(0)
    HISTORY_UNSAVED.add(gid)

    result = adjudicate_turn(
        game.units,
        game.orders,
        game.ownership,
        game.season,
        game.year,
        game.phase,
        retreats=game.retreats,
    )
    prev_label = f"{game.season} {game.year} {game.phase}"
    next_season = result.next_season or ("Fall" if game.season == "Spring" else "Spring")
    next_year = result.next_year or (game.year if game.season == "Spring" else game.year + 1)
    next_phase = result.next_phase or "Movement"

    new_orders = create_default_orders(result.new_units, next_phase, result.builds)
    history_entry = f"Resolved {prev_label}: {len(result.summary)} tactical actions processed."
    game.season = next_season
    game.year = next_year
    game.phase = next_phase
    game.units = result.new_units
    game.orders = new_orders
    game.ownership = result.new_ownership
    game.builds = result.builds
    game.retreats = result.retreats
    game.finalized_powers = []
    game.turn_history.insert(0, history_entry)
    if result.winner:
        game.winner = result.winner
        game.last_resolution = result
        game.turn_history.insert(0, f"{result.winner.value} has won the game in {prev_label}.")
    refresh_diagnostics_and_simulation(game)
    sync_summary(game.game_id)
    await persist_game(game.game_id)
    await broadcast_game_update(game.game_id, game)
    await broadcast_lobby_update()
    # At most a retreat and an adjustment phase can pass this way before a movement phase stops it.
    if everyone_is_ready(game):
        return await _execute_adjudication(game)
    return game


@app.post("/api/adjudicate", response_model=GameState)
async def adjudicate_and_advance(
    game_id: Optional[str] = Query(default=None),
    current_user: Optional[AuthUser] = Depends(get_current_user),
    x_user_id: Optional[str] = Header(default=None),
    x_user_email: Optional[str] = Header(default=None),
):
    game = await resolve_game(game_id)
    gid = game.game_id

    # In multiplayer matches, verify that the caller is the game creator
    if gid != DEFAULT_GAME_ID:
        summary = GAME_SUMMARIES.get(gid)
        if summary and not summary.is_sandbox:
            verify_admin_access(gid, current_user)

    return await _execute_adjudication(game)


@app.post("/api/scenario", response_model=GameState)
async def load_scenario(
    req: ScenarioRequest,
    game_id: Optional[str] = Query(default=None),
    current_user: Optional[AuthUser] = Depends(get_current_user),
):
    if req.scenario_id not in SCENARIO_IDS:
        raise HTTPException(status_code=400, detail=f"Unknown scenario '{req.scenario_id}'.")
    current = await resolve_game(game_id)
    gid = current.game_id
    verify_admin_access(gid, current_user)
    SANDBOX_CHECKPOINTS[gid] = None
    GAME_HISTORY[gid] = []
    HISTORY_UNSAVED.add(gid)
    power = req.active_power or current.active_power
    GAMES[gid] = build_scenario(req.scenario_id, power, gid)
    sync_summary(gid)
    await persist_game(gid)
    await broadcast_game_update(gid, GAMES[gid])
    await broadcast_lobby_update()
    return GAMES[gid]


# ==========================================
# ADMINISTRATOR / GAME CREATOR ENDPOINTS
# ==========================================
@app.get("/api/admin/status", response_model=AdminStatusResponse)
def get_admin_status(
    game_id: Optional[str] = Query(default=None),
    current_user: Optional[AuthUser] = Depends(get_current_user),
    x_user_id: Optional[str] = Header(default=None),
    x_user_email: Optional[str] = Header(default=None),
):
    """Check creator/admin privileges and rollback history depth for the given game."""
    gid = game_id or DEFAULT_GAME_ID
    summary = GAME_SUMMARIES.get(gid)
    history_stack = GAME_HISTORY.get(gid, [])

    if gid == DEFAULT_GAME_ID or not summary or summary.is_sandbox:
        return AdminStatusResponse(
            is_creator=True,
            can_rollback=len(history_stack) > 0,
            history_count=len(history_stack),
            creator_email=summary.created_by if summary else "commander@diplomacy.local",
            creator_id=summary.creator_id if summary else "guest",
        )

    user_id = current_user.user_id if current_user else x_user_id
    email = current_user.email if current_user else x_user_email

    is_creator = False
    if user_id and summary.creator_id and summary.creator_id == user_id:
        is_creator = True
    elif email and summary.created_by and summary.created_by.lower() == email.lower():
        is_creator = True

    return AdminStatusResponse(
        is_creator=is_creator,
        can_rollback=len(history_stack) > 0,
        history_count=len(history_stack),
        creator_email=summary.created_by,
        creator_id=summary.creator_id,
    )


@app.post("/api/admin/rollback", response_model=GameState)
async def admin_rollback_turn(
    req: Optional[AdminRollbackRequest] = None,
    game_id: Optional[str] = Query(default=None),
    current_user: Optional[AuthUser] = Depends(get_current_user),
    x_user_id: Optional[str] = Header(default=None),
    x_user_email: Optional[str] = Header(default=None),
):
    """Roll back to the previous turn snapshot in history (Creator Only)."""
    gid = game_id or DEFAULT_GAME_ID
    verify_admin_access(gid, current_user)

    history_stack = GAME_HISTORY.get(gid, [])
    if not history_stack:
        raise HTTPException(status_code=400, detail="No previous turn snapshots in history to roll back to.")

    prev_state = history_stack.pop()
    HISTORY_UNSAVED.add(gid)
    # The snapshot was taken at the moment of resolving, when everyone had finalized. Rolling back
    # exists so that the turn can be replayed, so every player gets their orders back to edit.
    prev_state.finalized_powers = []
    prev_state.turn_history.insert(
        0, f"[ADMIN OVERRIDE] Rolled back turn to {prev_state.season} {prev_state.year} {prev_state.phase} Phase."
    )
    GAMES[gid] = prev_state
    refresh_diagnostics_and_simulation(prev_state)
    sync_summary(gid)
    await persist_game(gid)
    await broadcast_game_update(gid, prev_state)
    await broadcast_lobby_update()
    return prev_state


@app.post("/api/admin/set-turn", response_model=GameState)
async def admin_set_turn(
    req: AdminSetTurnRequest,
    game_id: Optional[str] = Query(default=None),
    current_user: Optional[AuthUser] = Depends(get_current_user),
    x_user_id: Optional[str] = Header(default=None),
    x_user_email: Optional[str] = Header(default=None),
):
    """Arbitrarily adjust season, year, or phase (Creator Only)."""
    gid = game_id or DEFAULT_GAME_ID
    verify_admin_access(gid, current_user)
    game = await resolve_game(gid)

    valid_seasons = ["Spring", "Fall", "Winter"]
    valid_phases = ["Movement", "Retreats", "Adjustments"]
    if req.season not in valid_seasons:
        raise HTTPException(status_code=400, detail=f"Invalid season '{req.season}'. Must be one of {valid_seasons}.")
    if req.phase not in valid_phases:
        raise HTTPException(status_code=400, detail=f"Invalid phase '{req.phase}'. Must be one of {valid_phases}.")
    if req.phase not in PHASES_BY_SEASON[req.season]:
        raise HTTPException(status_code=400, detail=f"{req.season} has no {req.phase} phase.")
    if req.year < FIRST_YEAR:
        raise HTTPException(status_code=400, detail=f"Year must be {FIRST_YEAR} or later.")

    game.season = req.season
    game.year = req.year
    game.phase = req.phase
    game.turn_history.insert(0, f"[ADMIN OVERRIDE] Adjusted game clock to {req.season} {req.year} {req.phase} Phase.")
    refresh_diagnostics_and_simulation(game)
    sync_summary(gid)
    await persist_game(gid)
    await broadcast_game_update(gid, game)
    await broadcast_lobby_update()
    return game


@app.post("/api/admin/unit/move", response_model=GameState)
async def admin_move_unit(
    req: AdminMoveUnitRequest,
    game_id: Optional[str] = Query(default=None),
    current_user: Optional[AuthUser] = Depends(get_current_user),
    x_user_id: Optional[str] = Header(default=None),
    x_user_email: Optional[str] = Header(default=None),
):
    """Arbitrarily teleport/move any unit to any valid province on the map (Creator Only)."""
    gid = game_id or DEFAULT_GAME_ID
    verify_admin_access(gid, current_user)
    game = await resolve_game(gid)

    target_unit = next((u for u in game.units if u.id == req.unit_id), None)
    if not target_unit:
        raise HTTPException(status_code=404, detail=f"Unit '{req.unit_id}' not found.")

    prov_id = req.new_province.upper()
    prov_info = PROVINCES.get(prov_id)
    if not prov_info:
        raise HTTPException(status_code=400, detail=f"Province '{req.new_province}' does not exist.")

    if prov_info.type == ProvinceType.IMPASSABLE:
        raise HTTPException(status_code=400, detail=f"Cannot place units in impassable province {prov_info.name}.")

    if target_unit.unit_type == UnitType.ARMY and prov_info.type == ProvinceType.SEA:
        raise HTTPException(status_code=400, detail=f"Armies cannot be placed in sea province {prov_info.name}.")

    if target_unit.unit_type == UnitType.FLEET and prov_info.type == ProvinceType.LAND:
        raise HTTPException(status_code=400, detail=f"Fleets cannot be placed in inland province {prov_info.name}.")

    coast = fleet_coast(target_unit.unit_type, prov_info, req.new_coast)

    old_prov = target_unit.province
    # Remove any other unit already occupying the target province
    game.units = [u for u in game.units if u.id == target_unit.id or u.province != prov_id]

    target_unit.province = prov_id
    target_unit.coast = coast

    # Reset unit order to hold in its new location
    game.orders[target_unit.id] = Order(
        unit_id=target_unit.id,
        power=target_unit.power,
        unit_type=target_unit.unit_type,
        origin=prov_id,
        origin_coast=coast,
        order_type=OrderType.HOLD,
        is_explicit=False,
    )

    game.turn_history.insert(
        0, f"[ADMIN OVERRIDE] Relocated {target_unit.power.value} {target_unit.unit_type.value} from {old_prov} to {prov_id}."
    )
    refresh_diagnostics_and_simulation(game)
    sync_summary(gid)
    await persist_game(gid)
    await broadcast_game_update(gid, game)
    await broadcast_lobby_update()
    return game


@app.post("/api/admin/unit/spawn", response_model=GameState)
async def admin_spawn_unit(
    req: AdminSpawnUnitRequest,
    game_id: Optional[str] = Query(default=None),
    current_user: Optional[AuthUser] = Depends(get_current_user),
    x_user_id: Optional[str] = Header(default=None),
    x_user_email: Optional[str] = Header(default=None),
):
    """Arbitrarily spawn a unit anywhere on the board (Creator Only)."""
    gid = game_id or DEFAULT_GAME_ID
    verify_admin_access(gid, current_user)
    game = await resolve_game(gid)

    prov_id = req.province.upper()
    prov_info = PROVINCES.get(prov_id)
    if not prov_info:
        raise HTTPException(status_code=400, detail=f"Province '{req.province}' does not exist.")

    if prov_info.type == ProvinceType.IMPASSABLE:
        raise HTTPException(status_code=400, detail=f"Cannot place units in impassable province {prov_info.name}.")

    if req.unit_type == UnitType.ARMY and prov_info.type == ProvinceType.SEA:
        raise HTTPException(status_code=400, detail=f"Armies cannot be placed in sea province {prov_info.name}.")

    if req.unit_type == UnitType.FLEET and prov_info.type == ProvinceType.LAND:
        raise HTTPException(status_code=400, detail=f"Fleets cannot be placed in inland province {prov_info.name}.")

    coast = fleet_coast(req.unit_type, prov_info, req.coast)

    # Remove any existing unit in that province
    game.units = [u for u in game.units if u.province != prov_id]

    base_id = f"{req.power.value[:3]}_{req.unit_type.value}_{prov_id}"
    if coast:
        base_id += f"_{coast}"
    unit_id = base_id
    existing_ids = {u.id for u in game.units}
    counter = 1
    while unit_id in existing_ids:
        unit_id = f"{base_id}_{counter}"
        counter += 1

    new_unit = Unit(
        id=unit_id,
        power=req.power,
        unit_type=req.unit_type,
        province=prov_id,
        coast=coast,
    )
    game.units.append(new_unit)
    game.orders[unit_id] = Order(
        unit_id=unit_id,
        power=req.power,
        unit_type=req.unit_type,
        origin=prov_id,
        origin_coast=coast,
        order_type=OrderType.HOLD,
        is_explicit=False,
    )

    game.turn_history.insert(
        0, f"[ADMIN OVERRIDE] Spawned {req.power.value} {req.unit_type.value} at {prov_id}."
    )
    refresh_diagnostics_and_simulation(game)
    sync_summary(gid)
    await persist_game(gid)
    await broadcast_game_update(gid, game)
    await broadcast_lobby_update()
    return game


@app.post("/api/admin/unit/destroy", response_model=GameState)
async def admin_destroy_unit(
    req: AdminDestroyUnitRequest,
    game_id: Optional[str] = Query(default=None),
    current_user: Optional[AuthUser] = Depends(get_current_user),
    x_user_id: Optional[str] = Header(default=None),
    x_user_email: Optional[str] = Header(default=None),
):
    """Arbitrarily destroy/disband any unit on the board (Creator Only)."""
    gid = game_id or DEFAULT_GAME_ID
    verify_admin_access(gid, current_user)
    game = await resolve_game(gid)

    target_unit = next((u for u in game.units if u.id == req.unit_id), None)
    if not target_unit:
        raise HTTPException(status_code=404, detail=f"Unit '{req.unit_id}' not found.")

    game.units = [u for u in game.units if u.id != req.unit_id]
    game.orders.pop(req.unit_id, None)

    game.turn_history.insert(
        0, f"[ADMIN OVERRIDE] Destroyed {target_unit.power.value} {target_unit.unit_type.value} in {target_unit.province}."
    )
    refresh_diagnostics_and_simulation(game)
    sync_summary(gid)
    await persist_game(gid)
    await broadcast_game_update(gid, game)
    await broadcast_lobby_update()
    return game


@app.post("/api/admin/ownership", response_model=GameState)
async def admin_set_ownership(
    req: AdminSetOwnershipRequest,
    game_id: Optional[str] = Query(default=None),
    current_user: Optional[AuthUser] = Depends(get_current_user),
    x_user_id: Optional[str] = Header(default=None),
    x_user_email: Optional[str] = Header(default=None),
):
    """Arbitrarily reassign province/supply center ownership (Creator Only)."""
    gid = game_id or DEFAULT_GAME_ID
    verify_admin_access(gid, current_user)
    game = await resolve_game(gid)

    prov_id = req.province.upper()
    if prov_id not in PROVINCES:
        raise HTTPException(status_code=400, detail=f"Province '{req.province}' does not exist.")
    if not PROVINCES[prov_id].is_supply_center:
        raise HTTPException(status_code=400, detail=f"{PROVINCES[prov_id].name} is not a supply center.")

    if req.power is not None:
        game.ownership[prov_id] = req.power
        game.turn_history.insert(0, f"[ADMIN OVERRIDE] Set ownership of {prov_id} to {req.power.value}.")
    else:
        game.ownership.pop(prov_id, None)
        game.turn_history.insert(0, f"[ADMIN OVERRIDE] Reset ownership of {prov_id} to Neutral.")

    refresh_diagnostics_and_simulation(game)
    sync_summary(gid)
    await persist_game(gid)
    await broadcast_game_update(gid, game)
    await broadcast_lobby_update()
    return game


@app.post("/api/admin/unfinalize-all", response_model=GameState)
async def admin_unfinalize_all(
    game_id: Optional[str] = Query(default=None),
    current_user: Optional[AuthUser] = Depends(get_current_user),
    x_user_id: Optional[str] = Header(default=None),
    x_user_email: Optional[str] = Header(default=None),
):
    """Unlock and unfinalize orders for all Great Powers (Creator Only)."""
    gid = game_id or DEFAULT_GAME_ID
    verify_admin_access(gid, current_user)
    game = await resolve_game(gid)
    game.finalized_powers = []
    game.turn_history.insert(0, "[ADMIN OVERRIDE] Unlocked orders for all Great Powers.")
    refresh_diagnostics_and_simulation(game)
    sync_summary(gid)
    await persist_game(gid)
    await broadcast_game_update(gid, game)
    await broadcast_lobby_update()
    return game


@app.websocket("/ws/games/{game_id}")
async def ws_game_endpoint(websocket: WebSocket, game_id: str):
    if game_id not in GAMES and is_persistence_enabled():
        try:
            loaded = await load_game_from_db(game_id)
        except SupabaseUnavailable:
            await websocket.close(code=1013)  # Try again later: the client reconnects by itself
            return
        if loaded is not None:
            cache_loaded_game(game_id, loaded)

    if game_id not in GAMES:
        await websocket.close(code=4004)
        return

    await manager.connect_game(game_id, websocket)
    sync_summary(game_id)
    game = GAMES[game_id]
    summary = GAME_SUMMARIES.get(game_id)
    try:
        await websocket.send_json({
            "type": "game_update",
            "game_id": game_id,
            "state": game.model_dump(mode="json"),
            "summary": summary.model_dump(mode="json") if summary else None,
        })
        while True:
            data = await websocket.receive_json()
            if isinstance(data, dict):
                msg_type = data.get("type")
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg_type == "refresh":
                    g = GAMES.get(game_id)
                    s = GAME_SUMMARIES.get(game_id)
                    if g:
                        await websocket.send_json({
                            "type": "game_update",
                            "game_id": game_id,
                            "state": g.model_dump(mode="json"),
                            "summary": s.model_dump(mode="json") if s else None,
                        })
    except WebSocketDisconnect:
        manager.disconnect_game(game_id, websocket)
    except Exception:
        manager.disconnect_game(game_id, websocket)


@app.websocket("/ws/lobby")
async def ws_lobby_endpoint(websocket: WebSocket):
    await manager.connect_lobby(websocket)
    try:
        for gid in list(GAME_SUMMARIES.keys()):
            sync_summary(gid)
        await websocket.send_json({
            "type": "lobby_update",
            "games": [s.model_dump(mode="json") for s in GAME_SUMMARIES.values()],
        })
        while True:
            data = await websocket.receive_json()
            if isinstance(data, dict):
                msg_type = data.get("type")
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg_type == "refresh":
                    for gid in list(GAME_SUMMARIES.keys()):
                        sync_summary(gid)
                    await websocket.send_json({
                        "type": "lobby_update",
                        "games": [s.model_dump(mode="json") for s in GAME_SUMMARIES.values()],
                    })
    except WebSocketDisconnect:
        manager.disconnect_lobby(websocket)
    except Exception:
        manager.disconnect_lobby(websocket)


# Mount static frontend build when running in production container
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("ws/") or full_path in ("docs", "openapi.json", "redoc"):
            raise HTTPException(status_code=404, detail="Not Found")
        file_path = resolve_static_path(STATIC_DIR, full_path)
        if file_path:
            return FileResponse(file_path)
        index_file = os.path.join(STATIC_DIR, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend index.html not found")

