"""The domain models: a game survives a JSON round trip, and bad values are refused."""

import json
import time

import pytest
from domain.board import Power, Unit, UnitType
from domain.game_state import GameState, PhaseTimer, TimerChoice, TimerStage
from domain.issues import IssueCode, IssueSeverity, ValidationIssue
from domain.orders import Order, OrderType
from engine.adjudicator.resolver import adjudicate_turn
from engine.order_utils import create_default_orders
from engine.topology.provinces import get_initial_1901_units, get_initial_ownership
from pydantic import ValidationError


def full_game() -> GameState:
    units = get_initial_1901_units()
    orders = create_default_orders(units)
    ownership = get_initial_ownership()
    return GameState(
        game_id="roundtrip",
        season="Spring",
        year=1901,
        phase="Movement",
        units=units,
        orders=orders,
        ownership=ownership,
        finalized_powers=[Power.FRANCE],
        issues=[
            ValidationIssue(
                id="issue_1_SELF_BOUNCE",
                severity=IssueSeverity.WARNING,
                code=IssueCode.SELF_BOUNCE,
                title="t",
                message="m",
                unit_ids=["FRA_A_PAR"],
                provinces=["PAR"],
                power=Power.FRANCE,
            )
        ],
        last_resolution=adjudicate_turn(units, orders, ownership),
        timer=PhaseTimer(
            stage=TimerStage.VOTING,
            players=[Power.FRANCE, Power.ENGLAND],
            votes={Power.FRANCE: TimerChoice.MIN_15},
            deadline=time.time() + 60,
        ),
    )


def test_a_game_survives_a_json_round_trip():
    game = full_game()
    restored = GameState.model_validate_json(game.model_dump_json())
    assert restored.model_dump(exclude={"timer"}) == game.model_dump(exclude={"timer"})
    assert restored.timer.votes == game.timer.votes
    assert restored.timer.deadline == game.timer.deadline


def test_enums_serialise_as_their_plain_values():
    data = json.loads(full_game().model_dump_json())
    assert data["active_power"] == "FRANCE"
    assert data["units"][0]["unit_type"] in ("A", "F")
    assert data["orders"]["FRA_A_PAR"]["order_type"] == "HOLD"
    assert data["issues"][0]["severity"] == "warning"


def test_a_running_clock_reports_its_time_left_and_extension_bar():
    data = json.loads(full_game().model_dump_json())
    assert 0 < data["timer"]["remaining_seconds"] <= 60
    assert data["timer"]["extensions_needed"] == 2


@pytest.mark.parametrize(
    "build",
    [
        lambda: Unit(id="x", power="ATLANTIS", unit_type=UnitType.ARMY, province="PAR"),
        lambda: Unit(id="x", power=Power.FRANCE, unit_type="TANK", province="PAR"),
        lambda: Order(
            unit_id="x",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PAR",
            order_type="TELEPORT",
        ),
        lambda: Unit(id="x", power=Power.FRANCE, unit_type=UnitType.ARMY),
        lambda: GameState.model_validate(
            {
                "game_id": "g",
                "season": "Spring",
                "year": "soon",
                "phase": "Movement",
                "units": [],
                "orders": {},
                "ownership": {},
            }
        ),
    ],
)
def test_unknown_values_and_missing_fields_are_refused(build):
    with pytest.raises(ValidationError):
        build()


def test_an_order_defaults_to_an_unconfirmed_hold():
    o = Order(unit_id="x", power=Power.FRANCE, unit_type=UnitType.ARMY, origin="PAR")
    assert o.order_type == OrderType.HOLD
    assert o.is_explicit is False
    assert o.via_convoy is False
