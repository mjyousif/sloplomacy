"""Land that is not a supply center is claimed by the unit standing in it (issue #258)."""

from domain.board import Power, UnitType
from domain.orders import OrderType
from engine.adjudicator.resolver import adjudicate_turn, compute_current_builds
from engine.adjudicator.territory import supply_center_owners
from engine.topology.provinces import get_initial_ownership
from tests.unit.engine.adjudicator.helpers import _order, _unit


def test_spring_move_claims_land_but_not_a_supply_center():
    """A Spring move claims a plain province at once; supply centers still wait for Fall."""
    a_vie = _unit("A_VIE", Power.AUSTRIA, UnitType.ARMY, "VIE")
    a_mun = _unit("A_MUN", Power.GERMANY, UnitType.ARMY, "MUN")
    a_ber = _unit("A_BER", Power.GERMANY, UnitType.ARMY, "BER")
    orders = {
        "A_VIE": _order(a_vie, OrderType.MOVE, "BOH"),
        "A_MUN": _order(a_mun, OrderType.MOVE, "TYR"),
        "A_BER": _order(a_ber, OrderType.MOVE, "KIE"),
    }
    ownership = get_initial_ownership()
    ownership.pop("KIE")

    res = adjudicate_turn([a_vie, a_mun, a_ber], orders, ownership, "Spring", 1901, "Movement")

    assert res.new_ownership["BOH"] == Power.AUSTRIA
    assert res.new_ownership["TYR"] == Power.GERMANY
    assert "KIE" not in res.new_ownership  # a supply center: only Fall captures it
    # The provinces the units left are not claimed by anyone new.
    assert "MUN" in res.new_ownership and res.new_ownership["MUN"] == Power.GERMANY


def test_claimed_land_is_kept_after_the_unit_leaves_until_another_power_arrives():
    a_tyr = _unit("A_TYR", Power.GERMANY, UnitType.ARMY, "TYR")
    ownership = {**get_initial_ownership(), "TYR": Power.GERMANY}

    left = adjudicate_turn(
        [a_tyr], {"A_TYR": _order(a_tyr, OrderType.MOVE, "BOH")}, ownership, "Fall", 1901
    )
    assert left.new_ownership["TYR"] == Power.GERMANY
    assert left.new_ownership["BOH"] == Power.GERMANY

    a_ven = _unit("A_VEN", Power.ITALY, UnitType.ARMY, "VEN")
    taken = adjudicate_turn(
        [a_ven], {"A_VEN": _order(a_ven, OrderType.MOVE, "TYR")}, left.new_ownership, "Spring", 1902
    )
    assert taken.new_ownership["TYR"] == Power.ITALY


def test_a_bounce_or_a_dislodged_unit_claims_nothing():
    a_boh = _unit("A_BOH", Power.AUSTRIA, UnitType.ARMY, "BOH")
    a_mun = _unit("A_MUN", Power.GERMANY, UnitType.ARMY, "MUN")
    a_sil = _unit("A_SIL", Power.GERMANY, UnitType.ARMY, "SIL")
    a_vie = _unit("A_VIE", Power.AUSTRIA, UnitType.ARMY, "VIE")
    orders = {
        # Germany dislodges Austria from Bohemia; Austria's Vienna bounces nowhere useful.
        "A_MUN": _order(a_mun, OrderType.MOVE, "BOH"),
        "A_SIL": _order(a_sil, OrderType.SUPPORT, "BOH", aux="MUN"),
        "A_BOH": _order(a_boh),
        "A_VIE": _order(a_vie, OrderType.MOVE, "GAL"),
    }
    ownership = {**get_initial_ownership(), "BOH": Power.AUSTRIA}

    res = adjudicate_turn([a_boh, a_mun, a_sil, a_vie], orders, ownership, "Spring", 1901)

    assert res.new_ownership["BOH"] == Power.GERMANY
    assert res.new_ownership["GAL"] == Power.AUSTRIA


def test_a_retreat_claims_the_province_it_retreats_to():
    a_boh = _unit("A_BOH", Power.AUSTRIA, UnitType.ARMY, "BOH")
    a_mun = _unit("A_MUN", Power.GERMANY, UnitType.ARMY, "MUN")
    a_sil = _unit("A_SIL", Power.GERMANY, UnitType.ARMY, "SIL")
    moved = adjudicate_turn(
        [a_boh, a_mun, a_sil],
        {
            "A_MUN": _order(a_mun, OrderType.MOVE, "BOH"),
            "A_SIL": _order(a_sil, OrderType.SUPPORT, "BOH", aux="MUN"),
            "A_BOH": _order(a_boh),
        },
        get_initial_ownership(),
        "Spring",
        1901,
    )
    assert moved.next_phase == "Retreats"
    out = next(u for u in moved.new_units if u.is_dislodged)

    res = adjudicate_turn(
        moved.new_units,
        {out.id: _order(out, OrderType.RETREAT, "GAL")},
        moved.new_ownership,
        "Spring",
        1901,
        "Retreats",
        retreats=moved.retreats,
    )
    assert res.new_ownership["GAL"] == Power.AUSTRIA
    assert res.new_ownership["BOH"] == Power.GERMANY


def test_claimed_land_never_counts_toward_builds():
    """Owning plain land must not give a power extra builds or keep it in the game."""
    ownership = {**get_initial_ownership(), "BOH": Power.AUSTRIA, "TYR": Power.AUSTRIA}
    units = [_unit("A_VIE", Power.AUSTRIA, UnitType.ARMY, "VIE")]
    builds = compute_current_builds(units, ownership, 1901)
    assert builds["AUSTRIA"]["count"] == 2  # three home centers, one unit
    assert "BOH" not in supply_center_owners(ownership)
