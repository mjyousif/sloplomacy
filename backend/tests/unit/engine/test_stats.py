"""Unit tests for the pure War Ledger statistics engine (`engine/stats.py`)."""

from domain.board import Power, Unit, UnitType
from domain.game_state import GameState
from domain.orders import Order, OrderType
from engine.adjudicator.resolver import adjudicate_turn
from engine.stats import compute_campaign_stats


def _state(
    *,
    season: str = "Spring",
    year: int = 1901,
    phase: str = "Movement",
    units: list[Unit] | None = None,
    orders: dict[str, Order] | None = None,
    ownership: dict[str, Power] | None = None,
    builds: dict | None = None,
    retreats: dict | None = None,
    surrendered_powers: list[Power] | None = None,
    winner: Power | None = None,
) -> GameState:
    return GameState(
        game_id="test_stats",
        season=season,
        year=year,
        phase=phase,
        units=units or [],
        orders=orders or {},
        ownership=ownership or {},
        builds=builds,
        retreats=retreats,
        surrendered_powers=surrendered_powers or [],
        winner=winner,
    )


def test_movement_moves_self_bounce_support_cut_and_foreign_support():
    units = [
        # France self-bounces in BUR
        Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PAR"),
        Unit(id="FRA_A_MAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="MAR"),
        # England supports Germany's move MUN -> SIL
        Unit(id="GER_A_MUN", power=Power.GERMANY, unit_type=UnitType.ARMY, province="MUN"),
        Unit(id="ENG_A_PRU", power=Power.ENGLAND, unit_type=UnitType.ARMY, province="PRU"),
        # Austria cuts Italy's foreign support of Germany (BOH borders SIL and GAL)
        Unit(id="ITA_A_BOH", power=Power.ITALY, unit_type=UnitType.ARMY, province="BOH"),
        Unit(id="AUS_A_GAL", power=Power.AUSTRIA, unit_type=UnitType.ARMY, province="GAL"),
    ]
    ownership = {
        "PAR": Power.FRANCE,
        "MAR": Power.FRANCE,
        "MUN": Power.GERMANY,
        "LON": Power.ENGLAND,
        "ROM": Power.ITALY,
        "TRI": Power.AUSTRIA,
    }
    orders = {
        "FRA_A_PAR": Order(
            unit_id="FRA_A_PAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PAR",
            order_type=OrderType.MOVE,
            target="BUR",
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
        "GER_A_MUN": Order(
            unit_id="GER_A_MUN",
            power=Power.GERMANY,
            unit_type=UnitType.ARMY,
            origin="MUN",
            order_type=OrderType.MOVE,
            target="SIL",
            is_explicit=True,
        ),
        "ENG_A_PRU": Order(
            unit_id="ENG_A_PRU",
            power=Power.ENGLAND,
            unit_type=UnitType.ARMY,
            origin="PRU",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="MUN",
            target="SIL",
            is_explicit=True,
        ),
        "ITA_A_BOH": Order(
            unit_id="ITA_A_BOH",
            power=Power.ITALY,
            unit_type=UnitType.ARMY,
            origin="BOH",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="MUN",
            target="SIL",
            is_explicit=True,
        ),
        "AUS_A_GAL": Order(
            unit_id="AUS_A_GAL",
            power=Power.AUSTRIA,
            unit_type=UnitType.ARMY,
            origin="GAL",
            order_type=OrderType.MOVE,
            target="BOH",
            is_explicit=True,
        ),
    }

    snap = _state(units=units, orders=orders, ownership=ownership)
    res = adjudicate_turn(snap.units, snap.orders, snap.ownership, "Spring", 1901, "Movement")
    current = _state(
        season="Fall",
        year=1901,
        phase="Movement",
        units=res.new_units,
        ownership=res.new_ownership,
    )

    ledger = compute_campaign_stats([snap], current, player_names={Power.FRANCE: "Alice"})
    assert ledger.turns_resolved == 1

    fra = ledger.powers[Power.FRANCE]
    assert fra.player_name == "Alice"
    assert fra.moves_bounced == 2
    assert fra.moves_succeeded == 0
    assert fra.move_success_rate == 0.0
    assert fra.self_bounces == 1

    eng = ledger.powers[Power.ENGLAND]
    assert eng.foreign_supports_given == 1
    assert eng.foreign_supports_effective == 1
    assert ledger.support_matrix[Power.ENGLAND][Power.GERMANY] == 1

    ita = ledger.powers[Power.ITALY]
    assert ita.foreign_supports_given == 1
    assert ita.foreign_supports_effective == 0

    ger = ledger.powers[Power.GERMANY]
    assert ger.foreign_supports_received == 2
    assert ger.moves_succeeded == 1
    assert ger.move_success_rate == 100.0

    aus = ledger.powers[Power.AUSTRIA]
    assert aus.supports_cut == 1
    assert ledger.attack_matrix[Power.AUSTRIA][Power.ITALY] == 1


def test_foreign_convoy_dislodgement_and_retreat_lifecycle():
    # Movement: England convoys France A YOR -> NWY; Germany dislodges Austria A BOH (with retreat to GAL)
    # and France dislodges Italy A VEN (with zero retreat options -> immediate destruction).
    units = [
        Unit(id="ENG_F_NTH", power=Power.ENGLAND, unit_type=UnitType.FLEET, province="NTH"),
        Unit(id="FRA_A_YOR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="YOR"),
        Unit(id="GER_A_MUN", power=Power.GERMANY, unit_type=UnitType.ARMY, province="MUN"),
        Unit(id="GER_A_SIL", power=Power.GERMANY, unit_type=UnitType.ARMY, province="SIL"),
        Unit(id="AUS_A_BOH", power=Power.AUSTRIA, unit_type=UnitType.ARMY, province="BOH"),
        Unit(id="FRA_A_TYR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="TYR"),
        Unit(id="FRA_A_PIE", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PIE"),
        Unit(id="FRA_F_ADR", power=Power.FRANCE, unit_type=UnitType.FLEET, province="ADR"),
        Unit(id="FRA_A_ROM", power=Power.FRANCE, unit_type=UnitType.ARMY, province="ROM"),
        Unit(id="FRA_A_TRI", power=Power.FRANCE, unit_type=UnitType.ARMY, province="TRI"),
        Unit(id="FRA_A_APU", power=Power.FRANCE, unit_type=UnitType.ARMY, province="APU"),
        Unit(id="FRA_A_TUS", power=Power.FRANCE, unit_type=UnitType.ARMY, province="TUS"),
        Unit(id="ITA_A_VEN", power=Power.ITALY, unit_type=UnitType.ARMY, province="VEN"),
    ]
    ownership = {
        "LON": Power.ENGLAND,
        "PAR": Power.FRANCE,
        "MUN": Power.GERMANY,
        "VIE": Power.AUSTRIA,
        "VEN": Power.ITALY,
    }
    move_orders = {
        "ENG_F_NTH": Order(
            unit_id="ENG_F_NTH",
            power=Power.ENGLAND,
            unit_type=UnitType.FLEET,
            origin="NTH",
            order_type=OrderType.CONVOY,
            aux_unit_origin="YOR",
            target="NWY",
            is_explicit=True,
        ),
        "FRA_A_YOR": Order(
            unit_id="FRA_A_YOR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="YOR",
            order_type=OrderType.MOVE,
            target="NWY",
            via_convoy=True,
            is_explicit=True,
        ),
        "GER_A_MUN": Order(
            unit_id="GER_A_MUN",
            power=Power.GERMANY,
            unit_type=UnitType.ARMY,
            origin="MUN",
            order_type=OrderType.MOVE,
            target="BOH",
            is_explicit=True,
        ),
        "GER_A_SIL": Order(
            unit_id="GER_A_SIL",
            power=Power.GERMANY,
            unit_type=UnitType.ARMY,
            origin="SIL",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="MUN",
            target="BOH",
            is_explicit=True,
        ),
        "FRA_A_TYR": Order(
            unit_id="FRA_A_TYR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="TYR",
            order_type=OrderType.MOVE,
            target="VEN",
            is_explicit=True,
        ),
        "FRA_A_PIE": Order(
            unit_id="FRA_A_PIE",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PIE",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="TYR",
            target="VEN",
            is_explicit=True,
        ),
    }

    snap1 = _state(units=units, orders=move_orders, ownership=ownership)
    res1 = adjudicate_turn(snap1.units, snap1.orders, snap1.ownership, "Spring", 1901, "Movement")
    assert res1.next_phase == "Retreats"

    # Retreats: Austria A BOH chooses DISBAND (could have retreated to GAL/VIE)
    retreat_orders = {
        "AUS_A_BOH": Order(
            unit_id="AUS_A_BOH",
            power=Power.AUSTRIA,
            unit_type=UnitType.ARMY,
            origin="BOH",
            order_type=OrderType.DISBAND,
            is_explicit=True,
        ),
    }
    snap2 = _state(
        season="Spring",
        year=1901,
        phase="Retreats",
        units=res1.new_units,
        orders=retreat_orders,
        ownership=res1.new_ownership,
        retreats=res1.retreats,
    )
    res2 = adjudicate_turn(
        snap2.units,
        snap2.orders,
        snap2.ownership,
        "Spring",
        1901,
        "Retreats",
        retreats=snap2.retreats,
    )
    current = _state(
        season="Fall",
        year=1901,
        phase="Movement",
        units=res2.new_units,
        ownership=res2.new_ownership,
    )

    ledger = compute_campaign_stats([snap1, snap2], current)
    assert ledger.turns_resolved == 2
    assert ledger.powers[Power.ENGLAND].convoys_executed == 1
    assert ledger.powers[Power.ENGLAND].foreign_convoys == 1
    assert ledger.powers[Power.FRANCE].foreign_convoys == 1
    assert ledger.powers[Power.GERMANY].enemies_dislodged == 1
    assert ledger.powers[Power.FRANCE].enemies_dislodged == 1
    # Italy VEN had all neighbors occupied/blocked -> destroyed immediately in Movement (0 disbanded)
    assert ledger.powers[Power.ITALY].units_destroyed == 1
    assert ledger.powers[Power.ITALY].units_disbanded == 0
    # Austria BOH dislodged and disbanded in Retreats (counted under units_destroyed, not units_disbanded)
    assert ledger.powers[Power.AUSTRIA].units_destroyed == 1
    assert ledger.powers[Power.AUSTRIA].units_disbanded == 0


def test_winter_adjustments_builds_disbands_and_waives():
    units = [
        Unit(id="FRA_A_BUR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="BUR"),
        Unit(id="ITA_A_TYR", power=Power.ITALY, unit_type=UnitType.ARMY, province="TYR"),
        Unit(id="ENG_F_EDI", power=Power.ENGLAND, unit_type=UnitType.FLEET, province="EDI"),
        Unit(id="ENG_F_LVP", power=Power.ENGLAND, unit_type=UnitType.FLEET, province="LVP"),
    ]
    ownership = {
        "PAR": Power.FRANCE,
        "BRE": Power.FRANCE,
        "MAR": Power.FRANCE,
        "NAP": Power.ITALY,
        "ROM": Power.ITALY,
        "LON": Power.ENGLAND,
    }
    orders = {
        "BUILD_FRANCE_PAR": Order(
            unit_id="BUILD_FRANCE_PAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PAR",
            order_type=OrderType.BUILD,
            is_explicit=True,
        ),
        "BUILD_FRANCE_BRE": Order(
            unit_id="BUILD_FRANCE_BRE",
            power=Power.FRANCE,
            unit_type=UnitType.FLEET,
            origin="BRE",
            order_type=OrderType.WAIVE,
            is_explicit=True,
        ),
        "BUILD_ITALY_NAP": Order(
            unit_id="BUILD_ITALY_NAP",
            power=Power.ITALY,
            unit_type=UnitType.FLEET,
            origin="NAP",
            order_type=OrderType.BUILD,
            is_explicit=True,
        ),
        "ENG_F_LVP": Order(
            unit_id="ENG_F_LVP",
            power=Power.ENGLAND,
            unit_type=UnitType.FLEET,
            origin="LVP",
            order_type=OrderType.DISBAND,
            is_explicit=True,
        ),
    }

    snap = _state(
        season="Winter",
        year=1901,
        phase="Adjustments",
        units=units,
        orders=orders,
        ownership=ownership,
    )
    res = adjudicate_turn(snap.units, snap.orders, snap.ownership, "Winter", 1901, "Adjustments")
    current = _state(
        season="Spring",
        year=1902,
        phase="Movement",
        units=res.new_units,
        ownership=res.new_ownership,
    )

    ledger = compute_campaign_stats([snap], current)
    fra = ledger.powers[Power.FRANCE]
    assert fra.units_built == 1
    assert fra.armies_built == 1
    assert fra.fleets_built == 0
    assert fra.builds_waived == 1

    ita = ledger.powers[Power.ITALY]
    assert ita.units_built == 1
    assert ita.fleets_built == 1
    assert ita.armies_built == 0

    eng = ledger.powers[Power.ENGLAND]
    assert eng.units_disbanded == 1


def test_sc_timeline_captures_losses_elimination_surrender_and_awards():
    # Fall 1901 Movement: France takes BEL (from Germany) and TUN (neutral).
    units = [
        Unit(id="FRA_A_PIC", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PIC"),
        Unit(id="FRA_F_ION", power=Power.FRANCE, unit_type=UnitType.FLEET, province="ION"),
        Unit(id="ENG_F_NTH", power=Power.ENGLAND, unit_type=UnitType.FLEET, province="NTH"),
    ]
    ownership = {
        "PAR": Power.FRANCE,
        "BEL": Power.GERMANY,
        "LON": Power.ENGLAND,
    }
    orders = {
        "FRA_A_PIC": Order(
            unit_id="FRA_A_PIC",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PIC",
            order_type=OrderType.MOVE,
            target="BEL",
            is_explicit=True,
        ),
        "ENG_F_NTH": Order(
            unit_id="ENG_F_NTH",
            power=Power.ENGLAND,
            unit_type=UnitType.FLEET,
            origin="NTH",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="PIC",
            target="BEL",
            is_explicit=True,
        ),
        "FRA_F_ION": Order(
            unit_id="FRA_F_ION",
            power=Power.FRANCE,
            unit_type=UnitType.FLEET,
            origin="ION",
            order_type=OrderType.MOVE,
            target="TUN",
            is_explicit=True,
        ),
    }
    snap = _state(
        season="Fall", year=1901, phase="Movement", units=units, orders=orders, ownership=ownership
    )
    res = adjudicate_turn(snap.units, snap.orders, snap.ownership, "Fall", 1901, "Movement")
    current = _state(
        season="Winter",
        year=1901,
        phase="Adjustments",
        units=res.new_units,
        ownership=res.new_ownership,
        surrendered_powers=[Power.ITALY],
    )

    ledger = compute_campaign_stats([snap], current)
    fra = ledger.powers[Power.FRANCE]
    assert fra.current_scs == 3
    assert fra.peak_scs == 3
    assert fra.scs_captured == 2

    ger = ledger.powers[Power.GERMANY]
    assert ger.current_scs == 0
    assert ger.peak_scs == 1
    assert ger.scs_lost == 1
    assert ger.is_eliminated is True

    ita = ledger.powers[Power.ITALY]
    assert ita.is_surrendered is True

    assert len(ledger.sc_timeline) == 2
    assert ledger.sc_timeline[0].counts[Power.FRANCE] == 1
    assert ledger.sc_timeline[1].counts[Power.FRANCE] == 3

    award_ids = {a.id for a in ledger.awards}
    assert "kingmaker" in award_ids
    kingmaker = next(a for a in ledger.awards if a.id == "kingmaker")
    assert kingmaker.power == Power.ENGLAND
    assert kingmaker.count == 1


def test_secrecy_invariant_ignores_live_unresolved_orders():
    units = [
        Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PAR"),
        Unit(id="GER_A_MUN", power=Power.GERMANY, unit_type=UnitType.ARMY, province="MUN"),
    ]
    ownership = {"PAR": Power.FRANCE, "MUN": Power.GERMANY}
    secret_live_orders = {
        "FRA_A_PAR": Order(
            unit_id="FRA_A_PAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PAR",
            order_type=OrderType.MOVE,
            target="BUR",
            is_explicit=True,
        ),
        "GER_A_MUN": Order(
            unit_id="GER_A_MUN",
            power=Power.GERMANY,
            unit_type=UnitType.ARMY,
            origin="MUN",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="PAR",
            target="BUR",
            is_explicit=True,
        ),
    }
    current = _state(units=units, orders=secret_live_orders, ownership=ownership)

    ledger = compute_campaign_stats([], current)
    assert ledger.turns_resolved == 0
    assert ledger.powers[Power.FRANCE].moves_succeeded == 0
    assert ledger.powers[Power.FRANCE].moves_bounced == 0
    assert ledger.powers[Power.GERMANY].foreign_supports_given == 0
    assert ledger.support_matrix[Power.GERMANY][Power.FRANCE] == 0
    assert ledger.attack_matrix[Power.FRANCE][Power.GERMANY] == 0


def test_press_messages_award_counts_all_types_only_after_game_over():
    from domain.press import PressMessage

    messages = [
        PressMessage(
            id="p1",
            seq=1,
            sender=Power.FRANCE,
            anonymous=False,
            recipients=[],
            body="Public",
            sent_at="2026-11-15T00:00:00+00:00",
            season="Spring",
            year=1901,
            phase="Movement",
        ),
        PressMessage(
            id="p2",
            seq=2,
            sender=Power.GERMANY,
            anonymous=False,
            recipients=[Power.FRANCE],
            body="Private",
            sent_at="2026-11-15T00:01:00+00:00",
            season="Spring",
            year=1901,
            phase="Movement",
        ),
        PressMessage(
            id="p3",
            seq=3,
            sender=Power.GERMANY,
            anonymous=True,
            recipients=[],
            body="Anon public",
            sent_at="2026-11-15T00:02:00+00:00",
            season="Spring",
            year=1901,
            phase="Movement",
        ),
        PressMessage(
            id="p4",
            seq=4,
            sender=Power.GERMANY,
            anonymous=True,
            recipients=[Power.ENGLAND],
            body="Anon private",
            sent_at="2026-11-15T00:03:00+00:00",
            season="Spring",
            year=1901,
            phase="Movement",
        ),
    ]

    # Mid-game (winner is None): press counts stay 0 and award is omitted.
    midgame = compute_campaign_stats([], _state(), press_messages=messages)
    assert midgame.powers[Power.FRANCE].press_messages_sent == 0
    assert midgame.powers[Power.GERMANY].press_messages_sent == 0
    assert all(a.id != "silver_tongue" for a in midgame.awards)

    # Game over (winner is set): public + private + anonymous messages are all counted.
    finished_state = _state().model_copy(update={"winner": Power.FRANCE})
    finished = compute_campaign_stats([], finished_state, press_messages=messages)
    assert finished.powers[Power.FRANCE].press_messages_sent == 1
    assert finished.powers[Power.GERMANY].press_messages_sent == 3
    award = next((a for a in finished.awards if a.id == "silver_tongue"), None)
    assert award is not None
    assert award.power == Power.GERMANY
    assert award.count == 3
    assert award.value == "3 messages"
