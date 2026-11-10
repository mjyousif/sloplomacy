"""Movement checks one unit at a time: illegal moves and supports, unconfirmed orders."""

from domain.board import Power, Unit, UnitType
from domain.issues import IssueCode, IssueSeverity
from domain.orders import Order, OrderType
from engine.topology.provinces import get_initial_1901_units
from engine.validator.orchestrator import validate_orders


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


def test_foreign_support_does_not_leak_orders():
    """Supporting a foreign unit must emit INFO and never leak the foreign unit's actual order."""
    units = [
        Unit(id="ITA_F_WES", power=Power.ITALY, unit_type=UnitType.FLEET, province="WES"),
        Unit(id="FRA_F_POR", power=Power.FRANCE, unit_type=UnitType.FLEET, province="POR"),
    ]
    # France secretly orders Portugal to move to Spain
    orders = {
        "ITA_F_WES": Order(
            unit_id="ITA_F_WES",
            power=Power.ITALY,
            unit_type=UnitType.FLEET,
            origin="WES",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="POR",
            target="MAO",
            is_explicit=True,
        ),
        "FRA_F_POR": Order(
            unit_id="FRA_F_POR",
            power=Power.FRANCE,
            unit_type=UnitType.FLEET,
            origin="POR",
            order_type=OrderType.MOVE,
            target="SPA",
            target_coast="SC",
            is_explicit=True,
        ),
    }
    issues = validate_orders(units, orders)
    ita_issues = [i for i in issues if i.power == Power.ITALY]
    assert len(ita_issues) == 1
    issue = ita_issues[0]
    assert issue.severity == IssueSeverity.INFO
    assert issue.code == IssueCode.UNMATCHED_SUPPORT
    assert "Foreign Support" in issue.title
    # Must NOT reveal France's true move to Spain or that it's holding
    assert "Spain" not in issue.message
    assert "SPA" not in issue.message
    assert "currently" not in issue.message


def test_foreign_convoy_does_not_leak_orders():
    """Convoying a foreign army must emit INFO and never leak the foreign unit's actual order."""
    units = [
        Unit(id="ENG_F_NTH", power=Power.ENGLAND, unit_type=UnitType.FLEET, province="NTH"),
        Unit(id="FRA_A_BEL", power=Power.FRANCE, unit_type=UnitType.ARMY, province="BEL"),
    ]
    # France secretly orders Belgium to Burgundy
    orders = {
        "ENG_F_NTH": Order(
            unit_id="ENG_F_NTH",
            power=Power.ENGLAND,
            unit_type=UnitType.FLEET,
            origin="NTH",
            order_type=OrderType.CONVOY,
            aux_unit_origin="BEL",
            target="LON",
            is_explicit=True,
        ),
        "FRA_A_BEL": Order(
            unit_id="FRA_A_BEL",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="BEL",
            order_type=OrderType.MOVE,
            target="BUR",
            is_explicit=True,
        ),
    }
    issues = validate_orders(units, orders)
    eng_issues = [i for i in issues if i.power == Power.ENGLAND]
    assert len(eng_issues) == 1
    issue = eng_issues[0]
    assert issue.severity == IssueSeverity.INFO
    assert issue.code == IssueCode.BROKEN_CONVOY
    assert "Foreign Convoy" in issue.title
    assert "Burgundy" not in issue.message
    assert "BUR" not in issue.message
    assert "not ordered to move" not in issue.message


def test_army_convoy_across_water_with_foreign_fleet_emits_info_not_warning():
    """An army moving across water with a foreign fleet present emits INFO rather than leaking."""
    units = [
        Unit(id="ENG_A_LON", power=Power.ENGLAND, unit_type=UnitType.ARMY, province="LON"),
        Unit(id="FRA_F_ENG", power=Power.FRANCE, unit_type=UnitType.FLEET, province="ENG"),
    ]
    # France orders fleet to HOLD
    orders = {
        "ENG_A_LON": Order(
            unit_id="ENG_A_LON",
            power=Power.ENGLAND,
            unit_type=UnitType.ARMY,
            origin="LON",
            order_type=OrderType.MOVE,
            target="BEL",
            is_explicit=True,
        ),
        "FRA_F_ENG": Order(
            unit_id="FRA_F_ENG",
            power=Power.FRANCE,
            unit_type=UnitType.FLEET,
            origin="ENG",
            order_type=OrderType.HOLD,
            is_explicit=True,
        ),
    }
    issues = validate_orders(units, orders)
    eng_issues = [i for i in issues if i.power == Power.ENGLAND]
    assert len(eng_issues) == 1
    assert eng_issues[0].severity == IssueSeverity.INFO
    assert "Foreign Convoy Required" in eng_issues[0].title
