"""`OrderResolution.dislodged_by` names where the dislodging move came from (#264)."""

from domain.board import Power, UnitType
from domain.orders import OrderType
from engine.adjudicator.resolver import adjudicate_turn
from tests.unit.engine.adjudicator.helpers import _order, _unit

A = UnitType.ARMY


def _attack_on_burgundy(extra_units=()):
    par = _unit("FRA_A_PAR", Power.FRANCE, A, "PAR")
    mar = _unit("FRA_A_MAR", Power.FRANCE, A, "MAR")
    bur = _unit("GER_A_BUR", Power.GERMANY, A, "BUR")
    units = [par, mar, bur, *extra_units]
    orders = {u.id: _order(u) for u in units}
    orders[par.id] = _order(par, OrderType.MOVE, target="BUR")
    orders[mar.id] = _order(mar, OrderType.SUPPORT, target="BUR", aux="PAR")
    ownership = {"PAR": Power.FRANCE, "MAR": Power.FRANCE, "MUN": Power.GERMANY}
    return adjudicate_turn(units, orders, ownership, "Spring", 1901, "Movement")


def test_a_dislodged_unit_names_the_attackers_origin():
    res = _attack_on_burgundy()

    assert res.resolutions["GER_A_BUR"].dislodged
    assert res.resolutions["GER_A_BUR"].dislodged_by == "PAR"
    assert res.resolutions["FRA_A_PAR"].dislodged_by is None
    assert res.resolutions["FRA_A_MAR"].dislodged_by is None


def test_a_unit_destroyed_for_want_of_a_retreat_still_names_its_attacker():
    # Every other neighbour of Burgundy is occupied, so the German army has nowhere to go.
    blockers = [
        _unit(f"ENG_A_{p}", Power.ENGLAND, A, p) for p in ("PIC", "BEL", "RUH", "MUN", "GAS")
    ]
    res = _attack_on_burgundy(blockers)

    assert "destroyed" in res.resolutions["GER_A_BUR"].reason
    assert res.resolutions["GER_A_BUR"].dislodged_by == "PAR"


def test_a_bounce_dislodges_nobody():
    par = _unit("FRA_A_PAR", Power.FRANCE, A, "PAR")
    bur = _unit("GER_A_BUR", Power.GERMANY, A, "BUR")
    orders = {par.id: _order(par, OrderType.MOVE, target="BUR"), bur.id: _order(bur)}

    res = adjudicate_turn([par, bur], orders, {}, "Spring", 1901, "Movement")

    assert not res.resolutions["GER_A_BUR"].dislodged
    assert res.resolutions["GER_A_BUR"].dislodged_by is None
