"""Civil disorder: a surrendered or abandoned power's units hold, retreat nowhere and build nothing,
and a power short of supply centers still loses units."""

from domain.board import Power, Unit, UnitType
from domain.game_state import GameState
from domain.orders import Order, OrderType
from engine.adjudicator.resolver import adjudicate_turn
from engine.order_utils import put_into_civil_disorder
from engine.topology.provinces import get_initial_1901_units, get_initial_ownership


def game(phase: str = "Movement", season: str = "Spring", units=None, orders=None) -> GameState:
    return GameState(
        game_id="cd_test",
        season=season,
        year=1901,
        phase=phase,
        units=units if units is not None else get_initial_1901_units(),
        orders=orders or {},
        ownership=get_initial_ownership(),
    )


def move(unit: Unit, target: str) -> Order:
    return Order(
        unit_id=unit.id,
        power=unit.power,
        unit_type=unit.unit_type,
        origin=unit.province,
        order_type=OrderType.MOVE,
        target=target,
        is_explicit=True,
    )


def test_every_unit_of_the_power_holds_and_other_powers_keep_their_orders():
    units = get_initial_1901_units()
    by_id = {u.id: u for u in units}
    g = game(
        units=units,
        orders={
            "FRA_A_PAR": move(by_id["FRA_A_PAR"], "BUR"),
            "FRA_F_BRE": move(by_id["FRA_F_BRE"], "MAO"),
            "GER_A_MUN": move(by_id["GER_A_MUN"], "BUR"),
        },
    )

    put_into_civil_disorder(g, Power.FRANCE)

    french = [u for u in units if u.power == Power.FRANCE]
    for u in french:
        assert g.orders[u.id].order_type == OrderType.HOLD
        assert g.orders[u.id].is_explicit is False
    assert g.orders["GER_A_MUN"].order_type == OrderType.MOVE
    assert g.orders["GER_A_MUN"].target == "BUR"


def test_a_dislodged_unit_in_civil_disorder_disbands():
    units = [
        Unit(
            id="FRA_A_BUR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            province="BUR",
            is_dislodged=True,
        ),
        Unit(id="GER_A_BUR", power=Power.GERMANY, unit_type=UnitType.ARMY, province="BUR"),
    ]
    retreat = Order(
        unit_id="FRA_A_BUR",
        power=Power.FRANCE,
        unit_type=UnitType.ARMY,
        origin="BUR",
        order_type=OrderType.RETREAT,
        target="GAS",
        is_explicit=True,
    )
    g = game(phase="Retreats", units=units, orders={"FRA_A_BUR": retreat})

    put_into_civil_disorder(g, Power.FRANCE)

    assert g.orders["FRA_A_BUR"].order_type == OrderType.DISBAND
    assert g.orders["FRA_A_BUR"].target is None


def test_builds_already_chosen_are_waived_and_other_powers_builds_stay():
    def slot(power: Power, home: str) -> Order:
        return Order(
            unit_id=f"BUILD_{power.value}_{home}",
            power=power,
            unit_type=UnitType.ARMY,
            origin=home,
            order_type=OrderType.BUILD,
            is_explicit=True,
        )

    g = game(phase="Adjustments", season="Winter", units=[])
    g.orders = {
        "BUILD_FRANCE_PAR": slot(Power.FRANCE, "PAR"),
        "BUILD_GERMANY_BER": slot(Power.GERMANY, "BER"),
    }

    put_into_civil_disorder(g, Power.FRANCE)

    assert g.orders["BUILD_FRANCE_PAR"].order_type == OrderType.WAIVE
    assert g.orders["BUILD_FRANCE_PAR"].is_explicit is False
    assert g.orders["BUILD_GERMANY_BER"].order_type == OrderType.BUILD


def test_a_holding_power_in_disorder_gives_no_support():
    # France supports Germany into Belgium, so the English army there is dislodged. In civil
    # disorder France only holds, and the German attack bounces off Belgium.
    units = [
        Unit(id="GER_A_RUH", power=Power.GERMANY, unit_type=UnitType.ARMY, province="RUH"),
        Unit(id="ENG_A_BEL", power=Power.ENGLAND, unit_type=UnitType.ARMY, province="BEL"),
        Unit(id="FRA_A_PIC", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PIC"),
    ]
    support = Order(
        unit_id="FRA_A_PIC",
        power=Power.FRANCE,
        unit_type=UnitType.ARMY,
        origin="PIC",
        order_type=OrderType.SUPPORT,
        aux_unit_origin="RUH",
        target="BEL",
        is_explicit=True,
    )
    g = game(units=units, orders={"GER_A_RUH": move(units[0], "BEL"), "FRA_A_PIC": support})

    with_support = adjudicate_turn(g.units, g.orders, g.ownership)
    assert with_support.resolutions["GER_A_RUH"].succeeded

    put_into_civil_disorder(g, Power.FRANCE)
    without = adjudicate_turn(g.units, g.orders, g.ownership)
    assert not without.resolutions["GER_A_RUH"].succeeded
    assert any(u.id == "ENG_A_BEL" and u.province == "BEL" for u in without.new_units)


def test_a_power_short_of_centers_loses_units_without_ordering_disbands():
    # France keeps its three starting units but owns only Paris and Marseilles.
    ownership = get_initial_ownership()
    del ownership["BRE"]
    units = [u for u in get_initial_1901_units() if u.power == Power.FRANCE]

    result = adjudicate_turn(units, {}, ownership, "Winter", 1901, "Adjustments")

    french_left = [u for u in result.new_units if u.power == Power.FRANCE]
    assert len(french_left) == 2
    disbanded = [r for r in result.resolutions.values() if r.order_type == OrderType.DISBAND]
    assert len(disbanded) == 1
    assert "civil disorder" in disbanded[0].reason
