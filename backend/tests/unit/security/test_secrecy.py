"""Fog of war, called directly: what sanitize_game_state_for_viewer and viewer_power_for let through.

Two players, Alice (France) and Bob (Germany), each try to see the other's plans.
"""

import pytest
from domain.board import Power
from domain.game_state import GameParticipant, GameState, MultiplayerGameSummary
from domain.issues import IssueCode, IssueSeverity, ValidationIssue
from domain.orders import Order, OrderType
from domain.requests import AuthUser
from engine.adjudicator.resolver import adjudicate_turn
from engine.order_utils import create_default_orders
from engine.topology.provinces import get_initial_1901_units, get_initial_ownership
from security.secrecy import caller_holds_seat, sanitize_game_state_for_viewer, viewer_power_for
from storage.store import GAME_SUMMARIES

GID = "mp_secrecy_unit"
ALICE = AuthUser(user_id="00000000-0000-0000-0000-00000000a11c", email="alice@test.com")
BOB = AuthUser(user_id="00000000-0000-0000-0000-000000000b0b", email="bob@test.com")


def seat(user: AuthUser, power: Power) -> GameParticipant:
    return GameParticipant(
        user_id=user.user_id, email=user.email, display_name=user.email, power=power, joined_at="t"
    )


def summary(*seats: GameParticipant, is_sandbox: bool = False) -> MultiplayerGameSummary:
    return MultiplayerGameSummary(
        game_id=GID,
        name="Secrecy",
        status="active" if len(seats) > 1 else "waiting",
        created_by="alice@test.com",
        created_at="t",
        participants={s.power.value: s for s in seats},
        is_sandbox=is_sandbox,
    )


def plan(power: Power, unit_id: str, origin: str, target: str) -> Order:
    return Order(
        unit_id=unit_id,
        power=power,
        unit_type="A",
        origin=origin,
        order_type=OrderType.MOVE,
        target=target,
        is_explicit=True,
    )


def issue(power: Power) -> ValidationIssue:
    return ValidationIssue(
        id=f"issue_{power.value}",
        severity=IssueSeverity.WARNING,
        code=IssueCode.SELF_BOUNCE,
        title="t",
        message="m",
        unit_ids=[],
        provinces=[],
        power=power,
    )


@pytest.fixture
def game():
    units = get_initial_1901_units()
    orders = create_default_orders(units)
    orders["FRA_A_PAR"] = plan(Power.FRANCE, "FRA_A_PAR", "PAR", "BUR")
    orders["GER_A_MUN"] = plan(Power.GERMANY, "GER_A_MUN", "MUN", "BUR")
    ownership = get_initial_ownership()
    g = GameState(
        game_id=GID,
        season="Spring",
        year=1901,
        phase="Movement",
        units=units,
        orders=orders,
        ownership=ownership,
        issues=[issue(Power.FRANCE), issue(Power.GERMANY)],
        last_resolution=adjudicate_turn(units, orders, ownership),
    )
    GAME_SUMMARIES[GID] = summary(seat(ALICE, Power.FRANCE), seat(BOB, Power.GERMANY))
    yield g
    GAME_SUMMARIES.pop(GID, None)


def test_each_player_sees_their_own_plan_and_only_holds_for_the_other(game):
    for viewer, mine, theirs in (
        (Power.FRANCE, "FRA_A_PAR", "GER_A_MUN"),
        (Power.GERMANY, "GER_A_MUN", "FRA_A_PAR"),
    ):
        seen = sanitize_game_state_for_viewer(game, viewer)
        assert seen.orders[mine].target == "BUR"
        assert seen.orders[theirs].order_type == OrderType.HOLD
        assert seen.orders[theirs].is_explicit is False
        assert [i.power for i in seen.issues] == [viewer]


def test_a_spectator_sees_no_plans_and_no_issues(game):
    seen = sanitize_game_state_for_viewer(game, None)
    assert all(o.order_type == OrderType.HOLD for o in seen.orders.values())
    assert seen.issues == []


def test_the_turn_preview_is_rebuilt_from_what_the_viewer_may_see(game):
    # The real preview has the two armies bouncing in Burgundy. France's preview must not, or it
    # would give away that Germany is moving there.
    assert game.last_resolution.resolutions["FRA_A_PAR"].bounced
    seen = sanitize_game_state_for_viewer(game, Power.FRANCE)
    assert not seen.last_resolution.resolutions["FRA_A_PAR"].bounced
    assert seen.last_resolution.resolutions["GER_A_MUN"].order_type == OrderType.HOLD


def test_masking_leaves_the_real_game_untouched(game):
    sanitize_game_state_for_viewer(game, Power.FRANCE)
    assert game.orders["GER_A_MUN"].target == "BUR"
    assert len(game.issues) == 2


def test_a_lone_player_in_a_waiting_match_is_still_masked(game):
    GAME_SUMMARIES[GID] = summary(seat(ALICE, Power.FRANCE))
    seen = sanitize_game_state_for_viewer(game, None)
    assert seen.orders["FRA_A_PAR"].order_type == OrderType.HOLD


def test_orders_are_public_once_the_game_is_won(game):
    game.winner = Power.FRANCE
    assert sanitize_game_state_for_viewer(game, None) is game


def test_solo_and_saved_sandboxes_are_not_masked(game):
    GAME_SUMMARIES.pop(GID)
    assert sanitize_game_state_for_viewer(game, None) is game
    GAME_SUMMARIES[GID] = summary(seat(ALICE, Power.FRANCE), is_sandbox=True)
    assert sanitize_game_state_for_viewer(game, None) is game


def test_a_player_can_only_claim_their_own_seat(game):
    assert viewer_power_for(GID, ALICE) == Power.FRANCE
    assert viewer_power_for(GID, BOB) == Power.GERMANY
    # Naming the other seat gets you nothing more than your own.
    assert viewer_power_for(GID, BOB, Power.FRANCE) == Power.GERMANY
    assert viewer_power_for(GID, ALICE, Power.GERMANY) == Power.FRANCE
    stranger = AuthUser(user_id="00000000-0000-0000-0000-0000000ca201", email="carol@test.com")
    assert viewer_power_for(GID, stranger, Power.FRANCE) is None
    # A signed-out caller cannot claim an account's seat.
    assert viewer_power_for(GID, None, Power.FRANCE) is None


def test_a_guest_seat_is_open_to_a_signed_out_caller():
    guest = GameParticipant(
        user_id="guest_123", email="g@test.com", display_name="g", power=Power.ITALY, joined_at="t"
    )
    s = summary(guest)
    assert caller_holds_seat(s, Power.ITALY, None)
    assert not caller_holds_seat(s, Power.FRANCE, None)


def test_the_seat_matches_by_email_whatever_its_case(game):
    same_person = AuthUser(user_id="another-id", email="ALICE@Test.com")
    assert caller_holds_seat(GAME_SUMMARIES[GID], Power.FRANCE, same_person)
    assert not caller_holds_seat(GAME_SUMMARIES[GID], Power.GERMANY, same_person)


def test_secret_foreign_convoy_in_single_or_mixed_chain_never_turns_active(game):
    """Neither a 1-ship nor a mixed 2-ship foreign convoy order may leak into unit_options."""
    from domain.board import Unit, UnitType
    from domain.orders import Order
    from engine.order_utils import refresh_diagnostics_and_simulation

    game.units = [
        Unit(id="FRA_A_PIC", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PIC"),
        Unit(id="FRA_F_MAO", power=Power.FRANCE, unit_type=UnitType.FLEET, province="MAO"),
        Unit(id="GER_F_ENG", power=Power.GERMANY, unit_type=UnitType.FLEET, province="ENG"),
    ]
    game.orders = {
        "FRA_A_PIC": Order(
            unit_id="FRA_A_PIC",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PIC",
            order_type=OrderType.HOLD,
        ),
        "FRA_F_MAO": Order(
            unit_id="FRA_F_MAO",
            power=Power.FRANCE,
            unit_type=UnitType.FLEET,
            origin="MAO",
            order_type=OrderType.CONVOY,
            aux_unit_origin="PIC",
            target="SPA",
            is_explicit=True,
        ),
        "GER_F_ENG": Order(
            unit_id="GER_F_ENG",
            power=Power.GERMANY,
            unit_type=UnitType.FLEET,
            origin="ENG",
            order_type=OrderType.CONVOY,
            aux_unit_origin="PIC",
            target="SPA",
            is_explicit=True,
        ),
    }
    refresh_diagnostics_and_simulation(game)
    # Even on the raw board, a mixed France + Germany convoy keeps SPA potential (own-power scoped)
    assert game.unit_options["FRA_A_PIC"].active_convoys == []
    assert "SPA" in game.unit_options["FRA_A_PIC"].potential_convoys

    # Masked for France: Germany's secret F ENG C A PIC -> SPA stays hidden and SPA stays potential
    seen_fra = sanitize_game_state_for_viewer(game, Power.FRANCE)
    assert seen_fra.unit_options["FRA_A_PIC"].active_convoys == []
    assert "SPA" in seen_fra.unit_options["FRA_A_PIC"].potential_convoys
    assert "SPA" in seen_fra.unit_options["FRA_F_MAO"].convoy_targets["PIC"].chained
    assert seen_fra.unit_options["FRA_F_MAO"].convoy_targets["PIC"].direct == []
