"""Unit tests for admin action consolidation, diff calculation, and audit logging."""

import pytest
from api.admin_utils import compute_admin_orders, record_admin_history_and_log
from domain.board import Power, Unit, UnitType
from domain.game_state import GameState
from domain.orders import OrderType
from storage.store import GAME_HISTORY, GAMES, HISTORY_UNSAVED


@pytest.fixture
def base_game():
    gid = "test_admin_utils_game"
    st = GameState(
        game_id=gid,
        season="Spring",
        year=1901,
        phase="Movement",
        units=[
            Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PAR"),
            Unit(id="GER_A_BER", power=Power.GERMANY, unit_type=UnitType.ARMY, province="BER"),
            Unit(id="ENG_F_LON", power=Power.ENGLAND, unit_type=UnitType.FLEET, province="LON"),
        ],
        orders={},
        ownership={"PAR": Power.FRANCE, "BER": Power.GERMANY, "LON": Power.ENGLAND},
        admin_log=[],
    )
    GAMES[gid] = st
    GAME_HISTORY[gid] = []
    HISTORY_UNSAVED.discard(gid)
    yield st
    GAMES.pop(gid, None)
    GAME_HISTORY.pop(gid, None)
    HISTORY_UNSAVED.discard(gid)


def test_compute_admin_orders_diff():
    baseline = [
        Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PAR"),
        Unit(id="GER_A_BER", power=Power.GERMANY, unit_type=UnitType.ARMY, province="BER"),
    ]
    # Current: FRA_A_PAR was destroyed; GER_A_BER moved to MUN; RUS_A_MOS was spawned
    current = [
        Unit(id="GER_A_BER", power=Power.GERMANY, unit_type=UnitType.ARMY, province="MUN"),
        Unit(id="RUS_A_MOS", power=Power.RUSSIA, unit_type=UnitType.ARMY, province="MOS"),
    ]

    orders = compute_admin_orders(baseline, current)

    # 1. Destroyed unit has DISBAND
    assert "FRA_A_PAR" in orders
    assert orders["FRA_A_PAR"].order_type == OrderType.DISBAND
    assert orders["FRA_A_PAR"].origin == "PAR"

    # 2. Created unit has BUILD
    build_key = "BUILD_RUSSIA_MOS"
    assert build_key in orders
    assert orders[build_key].order_type == OrderType.BUILD
    assert orders[build_key].origin == "MOS"
    assert orders[build_key].power == Power.RUSSIA

    # 3. Teleported unit has MOVE from BER to MUN
    assert "GER_A_BER" in orders
    assert orders["GER_A_BER"].order_type == OrderType.MOVE
    assert orders["GER_A_BER"].origin == "BER"
    assert orders["GER_A_BER"].target == "MUN"


@pytest.mark.anyio
async def test_record_admin_history_and_log_consolidation(base_game):
    gid = base_game.game_id
    before_1 = base_game.model_copy(deep=True)

    # Action 1: Relocate GER_A_BER -> MUN
    base_game.units[1].province = "MUN"
    await record_admin_history_and_log(
        game_id=gid,
        before_state=before_1,
        after_state=base_game,
        summary_lines=["[ADMIN OVERRIDE] Relocated GER A BER to MUN."],
        actor="commander@diplomacy.eu",
        actor_id="user_admin_1",
    )

    assert len(base_game.admin_log) == 1
    assert "user_admin_1" in base_game.admin_log[0].acknowledged_by
    assert len(GAME_HISTORY[gid]) == 1
    snap1 = GAME_HISTORY[gid][0]
    assert snap1.phase == "Admin"
    assert snap1.season == "Spring"
    assert snap1.year == 1901
    assert len(snap1.last_resolution.summary) == 1
    # Pre-admin baseline is preserved: BER
    assert next(u for u in snap1.units if u.id == "GER_A_BER").province == "BER"
    # Order diff shows MOVE to MUN
    assert snap1.orders["GER_A_BER"].order_type == OrderType.MOVE
    assert snap1.orders["GER_A_BER"].target == "MUN"

    # Action 2: In same turn, destroy ENG_F_LON
    before_2 = base_game.model_copy(deep=True)
    base_game.units = [u for u in base_game.units if u.id != "ENG_F_LON"]
    await record_admin_history_and_log(
        game_id=gid,
        before_state=before_2,
        after_state=base_game,
        summary_lines=["[ADMIN OVERRIDE] Destroyed ENG F in LON."],
        actor="commander@diplomacy.eu",
        actor_id="user_admin_1",
    )

    # Consecutive action in same turn: consolidated into single snapshot!
    assert len(base_game.admin_log) == 2
    assert len(GAME_HISTORY[gid]) == 1
    consolidated = GAME_HISTORY[gid][0]
    # Summary contains both lines
    assert len(consolidated.last_resolution.summary) == 2
    # Baseline still holds initial pre-admin units: BER and LON are in baseline
    assert len(consolidated.units) == 3
    # Net order diff: GER_A_BER is MOVE MUN, ENG_F_LON is DISBAND
    assert consolidated.orders["GER_A_BER"].order_type == OrderType.MOVE
    assert consolidated.orders["ENG_F_LON"].order_type == OrderType.DISBAND
