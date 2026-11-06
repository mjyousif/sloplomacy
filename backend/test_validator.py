from map_data import get_initial_1901_units
from models import IssueCode, IssueSeverity, Order, OrderType, Power, Unit, UnitType
from validator import has_active_convoy_chain, validate_orders


def test_validator_friendly_fire():
    """Supporting an opponent attack against your own holding unit triggers FRIENDLY_FIRE."""
    units = [
        Unit(id="FRA_A_BUR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="BUR"),
        Unit(id="FRA_A_MAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="MAR"),
        Unit(id="GER_A_MUN", power=Power.GERMANY, unit_type=UnitType.ARMY, province="MUN"),
    ]
    orders = {
        "FRA_A_BUR": Order(
            unit_id="FRA_A_BUR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="BUR",
            order_type=OrderType.HOLD,
            is_explicit=True,
        ),
        "GER_A_MUN": Order(
            unit_id="GER_A_MUN",
            power=Power.GERMANY,
            unit_type=UnitType.ARMY,
            origin="MUN",
            order_type=OrderType.MOVE,
            target="BUR",
            is_explicit=True,
        ),
        # France orders A MAR to support Germany's attack into French-held Burgundy!
        "FRA_A_MAR": Order(
            unit_id="FRA_A_MAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="MAR",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="MUN",
            target="BUR",
            is_explicit=True,
        ),
    }

    issues = validate_orders(units, orders, target_power=Power.FRANCE)
    codes = {i.code for i in issues}
    assert IssueCode.FRIENDLY_FIRE in codes
    ff_issue = next(i for i in issues if i.code == IssueCode.FRIENDLY_FIRE)
    assert "Burgundy" in ff_issue.message
    assert "FRA_A_BUR" in ff_issue.unit_ids


def test_validator_self_occupied_bounce_and_direct_swap():
    """Moving into a friendly occupied province without vacation triggers SELF_OCCUPIED_BOUNCE."""
    units = [
        Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PAR"),
        Unit(id="FRA_A_MAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="MAR"),
    ]
    orders = {
        "FRA_A_PAR": Order(
            unit_id="FRA_A_PAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PAR",
            order_type=OrderType.HOLD,
            is_explicit=True,
        ),
        "FRA_A_MAR": Order(
            unit_id="FRA_A_MAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="MAR",
            order_type=OrderType.MOVE,
            target="PAR",
            is_explicit=True,
        ),
    }

    issues = validate_orders(units, orders)
    codes = {i.code for i in issues}
    assert IssueCode.SELF_OCCUPIED_BOUNCE in codes

    # Test direct head-to-head swap without a convoy
    units_swap = [
        Unit(id="FRA_A_BUR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="BUR"),
        Unit(id="FRA_A_MAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="MAR"),
    ]
    orders_swap = {
        "FRA_A_BUR": Order(
            unit_id="FRA_A_BUR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="BUR",
            order_type=OrderType.MOVE,
            target="MAR",
            is_explicit=True,
        ),
        "FRA_A_MAR": Order(
            unit_id="FRA_A_MAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="MAR",
            order_type=OrderType.MOVE,
            target="BUR",
            is_explicit=True,
        ),
    }
    issues_swap = validate_orders(units_swap, orders_swap)
    swap_issues = [i for i in issues_swap if "Direct Swap" in i.title]
    assert len(swap_issues) == 1
    assert swap_issues[0].code == IssueCode.SELF_BOUNCE


def test_validator_convoy_validation_and_chain():
    """Verify convoy chain BFS and BROKEN_CONVOY detection."""
    units = [
        Unit(id="ENG_A_LON", power=Power.ENGLAND, unit_type=UnitType.ARMY, province="LON"),
        Unit(id="ENG_F_NTH", power=Power.ENGLAND, unit_type=UnitType.FLEET, province="NTH"),
    ]

    # Case 1: Army attempts to move across sea to BEL with no convoy order
    orders_no_convoy = {
        "ENG_A_LON": Order(
            unit_id="ENG_A_LON",
            power=Power.ENGLAND,
            unit_type=UnitType.ARMY,
            origin="LON",
            order_type=OrderType.MOVE,
            target="BEL",
            is_explicit=True,
        ),
        "ENG_F_NTH": Order(
            unit_id="ENG_F_NTH",
            power=Power.ENGLAND,
            unit_type=UnitType.FLEET,
            origin="NTH",
            order_type=OrderType.HOLD,
            is_explicit=True,
        ),
    }
    assert has_active_convoy_chain("LON", "BEL", units, orders_no_convoy) is False
    issues1 = validate_orders(units, orders_no_convoy)
    assert any(i.code == IssueCode.BROKEN_CONVOY for i in issues1)

    # Case 2: Matching convoy orders form an active chain
    orders_valid_convoy = {
        "ENG_A_LON": Order(
            unit_id="ENG_A_LON",
            power=Power.ENGLAND,
            unit_type=UnitType.ARMY,
            origin="LON",
            order_type=OrderType.MOVE,
            target="BEL",
            via_convoy=True,
            is_explicit=True,
        ),
        "ENG_F_NTH": Order(
            unit_id="ENG_F_NTH",
            power=Power.ENGLAND,
            unit_type=UnitType.FLEET,
            origin="NTH",
            order_type=OrderType.CONVOY,
            aux_unit_origin="LON",
            target="BEL",
            is_explicit=True,
        ),
    }
    assert has_active_convoy_chain("LON", "BEL", units, orders_valid_convoy) is True
    issues2 = validate_orders(units, orders_valid_convoy)
    assert not any(i.code == IssueCode.BROKEN_CONVOY for i in issues2)

    # Case 3: Fleet ordered to convoy an army that is holding in place
    orders_convoy_non_moving = {
        "ENG_A_LON": Order(
            unit_id="ENG_A_LON",
            power=Power.ENGLAND,
            unit_type=UnitType.ARMY,
            origin="LON",
            order_type=OrderType.HOLD,
            is_explicit=True,
        ),
        "ENG_F_NTH": Order(
            unit_id="ENG_F_NTH",
            power=Power.ENGLAND,
            unit_type=UnitType.FLEET,
            origin="NTH",
            order_type=OrderType.CONVOY,
            aux_unit_origin="LON",
            target="BEL",
            is_explicit=True,
        ),
    }
    issues3 = validate_orders(units, orders_convoy_non_moving)
    assert any(i.code == IssueCode.BROKEN_CONVOY for i in issues3)


def test_validator_illegal_moves_and_support_boundaries():
    """Detect illegal moves and out-of-reach supports."""
    units = [
        Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PAR"),
        Unit(id="FRA_F_BRE", power=Power.FRANCE, unit_type=UnitType.FLEET, province="BRE"),
    ]

    orders = {
        # Army cannot move into the English Channel (sea)
        "FRA_A_PAR": Order(
            unit_id="FRA_A_PAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PAR",
            order_type=OrderType.MOVE,
            target="ENG",
            is_explicit=True,
        ),
        # Fleet in Brest cannot move inland to Paris
        "FRA_F_BRE": Order(
            unit_id="FRA_F_BRE",
            power=Power.FRANCE,
            unit_type=UnitType.FLEET,
            origin="BRE",
            order_type=OrderType.MOVE,
            target="PAR",
            is_explicit=True,
        ),
    }
    issues = validate_orders(units, orders)
    error_codes = [i.code for i in issues if i.severity == IssueSeverity.ERROR]
    assert error_codes.count(IssueCode.ILLEGAL_MOVE) == 2

    # Support out of reach: Army in Paris cannot support into Rome
    orders_support = {
        "FRA_A_PAR": Order(
            unit_id="FRA_A_PAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PAR",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="BRE",
            target="ROM",
            is_explicit=True,
        ),
        "FRA_F_BRE": Order(
            unit_id="FRA_F_BRE",
            power=Power.FRANCE,
            unit_type=UnitType.FLEET,
            origin="BRE",
            order_type=OrderType.HOLD,
            is_explicit=True,
        ),
    }
    issues_sup = validate_orders(units, orders_support)
    assert any(i.code == IssueCode.ILLEGAL_SUPPORT for i in issues_sup)

    # Unit cannot support itself
    orders_self_sup = {
        "FRA_A_PAR": Order(
            unit_id="FRA_A_PAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PAR",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="PAR",
            target="PAR",
            is_explicit=True,
        ),
    }
    issues_self = validate_orders(units[:1], orders_self_sup)
    assert any(i.code == IssueCode.VOID_SUPPORT_SELF for i in issues_self)


def test_validator_unassigned_unit_warnings():
    """Unassigned units generate warnings only when requested."""
    units = get_initial_1901_units()[:2]
    orders = {
        u.id: Order(
            unit_id=u.id,
            power=u.power,
            unit_type=u.unit_type,
            origin=u.province,
            order_type=OrderType.HOLD,
            is_explicit=False,
        )
        for u in units
    }

    no_warn = validate_orders(units, orders, include_unassigned_warnings=False)
    assert not any(i.code == IssueCode.UNASSIGNED_UNIT for i in no_warn)

    with_warn = validate_orders(units, orders, include_unassigned_warnings=True)
    assert sum(1 for i in with_warn if i.code == IssueCode.UNASSIGNED_UNIT) == 2


def _french_build_slot(home, order_type, is_explicit):
    return Order(
        unit_id=f"BUILD_FRANCE_{home}",
        power=Power.FRANCE,
        unit_type=UnitType.ARMY,
        origin=home,
        order_type=order_type,
        is_explicit=is_explicit,
    )


def _build_warnings(orders, count=2):
    issues = validate_orders(
        [],
        {o.unit_id: o for o in orders},
        include_unassigned_warnings=True,
        phase="Adjustments",
        builds={"FRANCE": {"count": count, "homes": ["PAR", "MAR", "BRE"]}},
    )
    return [i for i in issues if i.code == IssueCode.UNASSIGNED_UNIT]


def test_validator_warns_about_builds_that_would_be_lost():
    orders = [
        _french_build_slot("PAR", OrderType.BUILD, True),
        _french_build_slot("MAR", OrderType.WAIVE, False),
        _french_build_slot("BRE", OrderType.WAIVE, False),
    ]

    warnings = _build_warnings(orders)

    assert len(warnings) == 1
    assert warnings[0].title == "1 Unused Build"
    assert warnings[0].provinces == ["MAR", "BRE"]


def test_validator_is_quiet_once_every_build_is_decided():
    all_used = [
        _french_build_slot("PAR", OrderType.BUILD, True),
        _french_build_slot("MAR", OrderType.BUILD, True),
        _french_build_slot("BRE", OrderType.WAIVE, False),
    ]
    waived_on_purpose = [
        _french_build_slot("PAR", OrderType.WAIVE, True),
        _french_build_slot("MAR", OrderType.WAIVE, True),
        _french_build_slot("BRE", OrderType.WAIVE, True),
    ]

    assert _build_warnings(all_used) == []
    assert _build_warnings(waived_on_purpose) == []


def test_validator_warns_that_an_unordered_retreat_disbands():
    unit = Unit(id="FRA_A_BUR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="BUR", is_dislodged=True)
    order = Order(
        unit_id=unit.id,
        power=Power.FRANCE,
        unit_type=UnitType.ARMY,
        origin="BUR",
        order_type=OrderType.DISBAND,
        is_explicit=False,
    )

    issues = validate_orders([unit], {unit.id: order}, include_unassigned_warnings=True, phase="Retreats")

    assert any("will disband" in i.message for i in issues)
