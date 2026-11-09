"""has_active_convoy_chain: ordered fleets must link the army's coast to its target's, sea by sea."""

from domain.board import Power, Unit, UnitType
from domain.orders import Order, OrderType
from engine.validator.convoys import has_active_convoy_chain

ARMY = Unit(id="ENG_A_LON", power=Power.ENGLAND, unit_type=UnitType.ARMY, province="LON")


def fleet(province: str, power: Power = Power.ENGLAND) -> Unit:
    return Unit(
        id=f"{power.value[:3]}_F_{province}",
        power=power,
        unit_type=UnitType.FLEET,
        province=province,
    )


def convoy(unit: Unit, army_origin: str = "LON", target: str = "TUN") -> Order:
    return Order(
        unit_id=unit.id,
        power=unit.power,
        unit_type=unit.unit_type,
        origin=unit.province,
        order_type=OrderType.CONVOY,
        aux_unit_origin=army_origin,
        target=target,
    )


def chain(*provinces: str, target: str = "TUN", army_origin: str = "LON"):
    fleets = [fleet(p) for p in provinces]
    return [ARMY, *fleets], {f.id: convoy(f, army_origin, target) for f in fleets}


def test_one_fleet_touching_both_coasts_is_a_chain():
    units, orders = chain("NTH", target="BEL")
    assert has_active_convoy_chain("LON", "BEL", units, orders)


def test_three_fleets_linked_sea_by_sea_are_a_chain():
    units, orders = chain("ENG", "MAO", "WES")
    assert has_active_convoy_chain("LON", "TUN", units, orders)


def test_a_missing_middle_fleet_breaks_the_chain():
    units, orders = chain("ENG", "WES")
    assert not has_active_convoy_chain("LON", "TUN", units, orders)


def test_fleets_that_never_reach_the_target_coast_are_no_chain():
    units, orders = chain("ENG", "MAO")
    assert not has_active_convoy_chain("LON", "TUN", units, orders)


def test_fleets_convoying_a_different_army_or_target_do_not_count():
    units, orders = chain("ENG", "MAO", "WES")
    orders["ENG_F_MAO"] = convoy(units[2], army_origin="WAL")
    assert not has_active_convoy_chain("LON", "TUN", units, orders)

    units, orders = chain("ENG", "MAO", "WES")
    orders["ENG_F_WES"] = convoy(units[3], target="NAF")
    assert not has_active_convoy_chain("LON", "TUN", units, orders)


def test_a_fleet_ordered_to_hold_does_not_count():
    units, orders = chain("ENG", "MAO", "WES")
    orders["ENG_F_MAO"] = orders["ENG_F_MAO"].model_copy(update={"order_type": OrderType.HOLD})
    assert not has_active_convoy_chain("LON", "TUN", units, orders)


def test_a_fleet_in_a_coastal_province_cannot_carry_a_convoy():
    # Through the Mid-Atlantic the Channel reaches Gascony; through Brest it would too, but only
    # fleets at sea can carry an army.
    units, orders = chain("ENG", "MAO", target="GAS")
    assert has_active_convoy_chain("LON", "GAS", units, orders)

    units, orders = chain("ENG", "BRE", target="GAS")
    assert not has_active_convoy_chain("LON", "GAS", units, orders)


def test_another_powers_fleets_can_carry_the_army():
    units, orders = chain("ENG", "WES")
    french = fleet("MAO", Power.FRANCE)
    units.append(french)
    orders[french.id] = convoy(french)
    assert has_active_convoy_chain("LON", "TUN", units, orders)


def test_no_convoy_orders_at_all_is_no_chain():
    assert not has_active_convoy_chain("LON", "TUN", [ARMY, fleet("ENG")], {})
