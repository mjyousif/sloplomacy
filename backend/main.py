from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from adjudicator import adjudicate_turn
from map_data import PROVINCES, get_initial_1901_units, get_initial_ownership
from models import (
    CreateGameRequest,
    FinalizeRequest,
    FinalizeResponse,
    GameParticipant,
    GameState,
    JoinGameRequest,
    MultiplayerGameSummary,
    Order,
    OrderSubmissionRequest,
    OrderType,
    Power,
    ProvinceInfo,
    SaveSandboxRequest,
    ScenarioRequest,
    SimulationResult,
    SingleOrderUpdateRequest,
    Unit,
    UnitType,
)
from validator import validate_orders

app = FastAPI(title="Sloplomacy 1901 Tactical Server", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def create_default_orders(
    units: List[Unit],
    phase: str = "Movement",
    builds: Optional[Dict[str, Any]] = None,
) -> Dict[str, Order]:
    orders: Dict[str, Order] = {}
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
    if phase == "Adjustments" and builds:
        for p_name, b_info in builds.items():
            count = b_info.get("count", 0)
            homes = b_info.get("homes", [])
            pwr = Power(p_name)
            if count > 0:
                for h in homes:
                    b_id = f"BUILD_{p_name}_{h}"
                    prov_info = PROVINCES.get(h)
                    def_ut = UnitType.ARMY
                    def_coast = prov_info.coasts[0] if (prov_info and prov_info.coasts) else None
                    orders[b_id] = Order(
                        unit_id=b_id,
                        power=pwr,
                        unit_type=def_ut,
                        origin=h,
                        origin_coast=def_coast,
                        order_type=OrderType.BUILD,
                        is_explicit=False,
                    )
    return orders


def refresh_diagnostics_and_simulation(game: GameState) -> None:
    """Re-run real-time tactical validation and non-destructive turn simulation."""
    if game.phase == "Movement":
        game.issues = validate_orders(
            game.units, game.orders, include_unassigned_warnings=False
        )
    else:
        game.issues = []
    game.last_resolution = adjudicate_turn(
        game.units,
        game.orders,
        game.ownership,
        game.season,
        game.year,
        game.phase,
    )
    if game.last_resolution:
        game.builds = game.last_resolution.builds
        game.retreats = game.last_resolution.retreats


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
GAME_SUMMARIES: Dict[str, MultiplayerGameSummary] = {}


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
    g1_state.finalized_powers = [Power.GERMANY]
    refresh_diagnostics_and_simulation(g1_state)
    GAMES[g1_id] = g1_state
    SANDBOX_CHECKPOINTS[g1_id] = None
    GAME_SUMMARIES[g1_id] = MultiplayerGameSummary(
        game_id=g1_id,
        name="Concert of Europe — Match #104",
        status="active",
        season=g1_state.season,
        year=g1_state.year,
        phase=g1_state.phase,
        created_by="bismarck@diplomacy.eu",
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
    GAME_SUMMARIES[g2_id] = MultiplayerGameSummary(
        game_id=g2_id,
        name="Mediterranean Crisis 1901",
        status="waiting",
        season=g2_state.season,
        year=g2_state.year,
        phase=g2_state.phase,
        created_by="cavour@diplomacy.it",
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


seed_initial_multiplayer_lobbies()


def resolve_game(game_id: Optional[str] = None) -> GameState:
    gid = game_id or DEFAULT_GAME_ID
    if gid not in GAMES:
        raise HTTPException(status_code=404, detail=f"Game '{gid}' not found.")
    return GAMES[gid]


def sync_summary(game_id: str) -> None:
    if game_id in GAME_SUMMARIES and game_id in GAMES:
        st = GAMES[game_id]
        summary = GAME_SUMMARIES[game_id]
        summary.season = st.season
        summary.year = st.year
        summary.phase = st.phase
        summary.finalized_powers = list(st.finalized_powers)


class GameBootstrapResponse(BaseModel):
    state: GameState
    provinces: Dict[str, ProvinceInfo]
    summary: Optional[MultiplayerGameSummary] = None


class SetPowerRequest(BaseModel):
    power: Power


@app.get("/api/games", response_model=List[MultiplayerGameSummary])
def list_games():
    """Return all multiplayer games and saved sessions."""
    for gid in list(GAME_SUMMARIES.keys()):
        sync_summary(gid)
    return list(GAME_SUMMARIES.values())


@app.post("/api/games", response_model=MultiplayerGameSummary)
def create_multiplayer_game(req: CreateGameRequest):
    """Create a new multiplayer game and assign creator_power to the user."""
    gid = f"mp_{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    game_state = build_scenario("standard_1901", req.creator_power, gid)
    GAMES[gid] = game_state
    SANDBOX_CHECKPOINTS[gid] = None

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
        created_at=now_iso,
        participants={req.creator_power.value: participant},
        finalized_powers=[],
        is_sandbox=False,
    )
    GAME_SUMMARIES[gid] = summary
    return summary


@app.post("/api/games/{game_id}/join", response_model=GameBootstrapResponse)
def join_multiplayer_game(game_id: str, req: JoinGameRequest):
    """Claim a power in a multiplayer match (or re-enter if already claimed by this user)."""
    game_state = resolve_game(game_id)
    summary = GAME_SUMMARIES.get(game_id)
    if not summary:
        raise HTTPException(status_code=404, detail=f"Game lobby '{game_id}' not found.")

    # Check if user already holds a power in this game
    for p_key, part in list(summary.participants.items()):
        if part.user_id == req.user_id and p_key != req.power.value:
            # Allow user to switch only if target power is unclaimed
            pass

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

    game_state.active_power = req.power
    refresh_diagnostics_and_simulation(game_state)
    sync_summary(game_id)
    return GameBootstrapResponse(
        state=game_state,
        provinces=PROVINCES,
        summary=summary,
    )


@app.post("/api/games/save-sandbox", response_model=MultiplayerGameSummary)
def save_sandbox_to_account(req: SaveSandboxRequest, game_id: Optional[str] = Query(default=None)):
    """Save the current sandbox game state into the authenticated user's personal games."""
    source_game = resolve_game(game_id)
    new_gid = f"saved_{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    cloned_state = source_game.model_copy(deep=True)
    cloned_state.game_id = new_gid
    GAMES[new_gid] = cloned_state
    SANDBOX_CHECKPOINTS[new_gid] = None

    display_name = req.display_name or req.email.split("@")[0]
    summary = MultiplayerGameSummary(
        game_id=new_gid,
        name=req.name.strip() or f"Saved Tactical Sandbox ({cloned_state.season} {cloned_state.year})",
        status="active",
        season=cloned_state.season,
        year=cloned_state.year,
        phase=cloned_state.phase,
        created_by=req.email,
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
    return summary


@app.get("/api/game", response_model=GameBootstrapResponse)
def get_game(game_id: Optional[str] = Query(default=None)):
    game = resolve_game(game_id)
    refresh_diagnostics_and_simulation(game)
    gid = game.game_id
    sync_summary(gid)
    return GameBootstrapResponse(
        state=game,
        provinces=PROVINCES,
        summary=GAME_SUMMARIES.get(gid),
    )


@app.post("/api/power", response_model=GameState)
def set_active_power(req: SetPowerRequest, game_id: Optional[str] = Query(default=None)):
    game = resolve_game(game_id)
    gid = game.game_id
    game.active_power = req.power
    checkpoint = SANDBOX_CHECKPOINTS.get(gid)
    if checkpoint is not None:
        checkpoint.active_power = req.power
    refresh_diagnostics_and_simulation(game)
    return game


@app.post("/api/sandbox/enter", response_model=GameState)
def enter_sandbox_mode(req: SetPowerRequest, game_id: Optional[str] = Query(default=None)):
    """Save a checkpoint of the real game state when entering Sandbox Pre-Move Mode."""
    game = resolve_game(game_id)
    gid = game.game_id
    game.active_power = req.power
    SANDBOX_CHECKPOINTS[gid] = game.model_copy(deep=True)
    refresh_diagnostics_and_simulation(game)
    return game


@app.post("/api/sandbox/exit", response_model=GameState)
def exit_sandbox_mode(req: SetPowerRequest, game_id: Optional[str] = Query(default=None)):
    """
    Exit Sandbox Pre-Move Mode:
    - If the user stepped turns forward in the sandbox, restore the pre-sandbox turn checkpoint.
    - Discard all hypothetical foreign orders so only the active power's own orders remain.
    """
    game = resolve_game(game_id)
    gid = game.game_id
    checkpoint = SANDBOX_CHECKPOINTS.get(gid)
    if checkpoint is not None:
        same_turn = (
            game.season == checkpoint.season
            and game.year == checkpoint.year
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

    for u in game.units:
        if u.power != req.power:
            game.orders[u.id] = Order(
                unit_id=u.id,
                power=u.power,
                unit_type=u.unit_type,
                origin=u.province,
                origin_coast=u.coast,
                order_type=OrderType.HOLD,
                is_explicit=False,
            )

    refresh_diagnostics_and_simulation(game)
    sync_summary(gid)
    return game


@app.post("/api/sandbox/clear-foreign", response_model=GameState)
def clear_foreign_pre_moves(req: SetPowerRequest, game_id: Optional[str] = Query(default=None)):
    """Reset all hypothetical orders for powers other than req.power back to default HOLD."""
    game = resolve_game(game_id)
    for u in game.units:
        if u.power != req.power:
            game.orders[u.id] = Order(
                unit_id=u.id,
                power=u.power,
                unit_type=u.unit_type,
                origin=u.province,
                origin_coast=u.coast,
                order_type=OrderType.HOLD,
                is_explicit=False,
            )
    refresh_diagnostics_and_simulation(game)
    return game


@app.post("/api/order", response_model=GameState)
def update_single_order(req: SingleOrderUpdateRequest, game_id: Optional[str] = Query(default=None)):
    game = resolve_game(game_id)
    unit_map = {u.id: u for u in game.units}
    if req.order.unit_id in unit_map:
        unit = unit_map[req.order.unit_id]
        updated_order = req.order.model_copy()
        updated_order.power = unit.power
        updated_order.unit_type = unit.unit_type
        updated_order.origin = unit.province
        updated_order.origin_coast = unit.coast
        game.orders[unit.id] = updated_order
        if unit.power in game.finalized_powers:
            game.finalized_powers.remove(unit.power)
    elif req.order.unit_id.startswith("BUILD_"):
        game.orders[req.order.unit_id] = req.order.model_copy()
        if req.order.power in game.finalized_powers:
            game.finalized_powers.remove(req.order.power)
    else:
        raise HTTPException(status_code=404, detail=f"Unit or build order {req.order.unit_id} not found.")

    if req.active_power:
        game.active_power = req.active_power

    refresh_diagnostics_and_simulation(game)
    sync_summary(game.game_id)
    return game


@app.post("/api/orders/batch", response_model=GameState)
def update_batch_orders(req: OrderSubmissionRequest, game_id: Optional[str] = Query(default=None)):
    game = resolve_game(game_id)
    unit_map = {u.id: u for u in game.units}
    for o in req.orders:
        if o.unit_id in unit_map:
            u = unit_map[o.unit_id]
            updated = o.model_copy()
            updated.power = u.power
            updated.unit_type = u.unit_type
            updated.origin = u.province
            updated.origin_coast = u.coast
            game.orders[u.id] = updated

    if req.power in game.finalized_powers:
        game.finalized_powers.remove(req.power)

    refresh_diagnostics_and_simulation(game)
    sync_summary(game.game_id)
    return game


@app.post("/api/orders/confirm-all", response_model=GameState)
def confirm_all_power_orders(req: SetPowerRequest, game_id: Optional[str] = Query(default=None)):
    game = resolve_game(game_id)
    for u in game.units:
        if u.power == req.power and u.id in game.orders:
            game.orders[u.id].is_explicit = True
    refresh_diagnostics_and_simulation(game)
    return game


@app.post("/api/finalize", response_model=FinalizeResponse)
def finalize_power_orders(req: FinalizeRequest, game_id: Optional[str] = Query(default=None)):
    game = resolve_game(game_id)
    power_issues = validate_orders(
        game.units,
        game.orders,
        include_unassigned_warnings=True,
        target_power=req.power,
    )

    if power_issues and not req.force:
        refresh_diagnostics_and_simulation(game)
        return FinalizeResponse(
            finalized=False,
            requires_confirmation=True,
            issues=power_issues,
            state=game,
        )

    for u in game.units:
        if u.power == req.power and u.id in game.orders:
            game.orders[u.id].is_explicit = True

    if req.power not in game.finalized_powers:
        game.finalized_powers.append(req.power)

    refresh_diagnostics_and_simulation(game)
    sync_summary(game.game_id)
    return FinalizeResponse(
        finalized=True,
        requires_confirmation=False,
        issues=power_issues,
        state=game,
    )


@app.post("/api/unfinalize", response_model=GameState)
def unfinalize_power_orders(req: SetPowerRequest, game_id: Optional[str] = Query(default=None)):
    game = resolve_game(game_id)
    if req.power in game.finalized_powers:
        game.finalized_powers.remove(req.power)
    refresh_diagnostics_and_simulation(game)
    sync_summary(game.game_id)
    return game


@app.post("/api/simulate", response_model=SimulationResult)
def simulate_current_orders(game_id: Optional[str] = Query(default=None)):
    game = resolve_game(game_id)
    refresh_diagnostics_and_simulation(game)
    assert game.last_resolution is not None
    return game.last_resolution


@app.post("/api/adjudicate", response_model=GameState)
def adjudicate_and_advance(game_id: Optional[str] = Query(default=None)):
    game = resolve_game(game_id)
    result = adjudicate_turn(
        game.units,
        game.orders,
        game.ownership,
        game.season,
        game.year,
        game.phase,
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
    refresh_diagnostics_and_simulation(game)
    sync_summary(game.game_id)
    return game


@app.post("/api/scenario", response_model=GameState)
def load_scenario(req: ScenarioRequest, game_id: Optional[str] = Query(default=None)):
    gid = game_id or DEFAULT_GAME_ID
    current = GAMES.get(gid)
    SANDBOX_CHECKPOINTS[gid] = None
    power = req.active_power or (current.active_power if current else Power.FRANCE)
    GAMES[gid] = build_scenario(req.scenario_id, power, gid)
    sync_summary(gid)
    return GAMES[gid]
