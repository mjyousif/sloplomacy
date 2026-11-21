"""Who may read a press message, and whether its author is shown."""

from domain.board import Power
from domain.press import PressMessage, number_messages
from security.press import can_read, feed_for, spectator_feed, spectator_view, view_of


def message(seq=1, sender=Power.FRANCE, recipients=(), anonymous=False) -> PressMessage:
    return PressMessage(
        id=f"m{seq}",
        seq=seq,
        sender=sender,
        anonymous=anonymous,
        recipients=list(recipients),
        body="hello",
        sent_at="2026-11-13T00:00:00+00:00",
        season="Spring",
        year=1901,
        phase="Movement",
    )


def test_public_press_is_read_by_everyone():
    public = message()
    assert all(can_read(public, power, revealed=False) for power in Power)


def test_private_message_is_read_only_by_its_sender_and_recipients():
    private = message(recipients=[Power.GERMANY, Power.ITALY])
    readers = {power for power in Power if can_read(private, power, revealed=False)}
    assert readers == {Power.FRANCE, Power.GERMANY, Power.ITALY}


def test_anonymous_author_is_hidden_from_everyone_but_themself():
    note = message(recipients=[Power.GERMANY, Power.ITALY], anonymous=True)
    assert view_of(note, Power.GERMANY, revealed=False).sender is None
    assert view_of(note, Power.FRANCE, revealed=False).sender == Power.FRANCE


def test_anonymous_public_press_hides_its_author():
    post = message(anonymous=True)
    view = view_of(post, Power.ENGLAND, revealed=False)
    assert view.sender is None and view.recipients == []
    assert "FRANCE" not in view.model_dump_json()


def test_a_hidden_author_cannot_be_told_from_the_other_thread_members():
    # France and Italy writing anonymously in the France-Germany-Italy thread look the same to
    # Germany: both list the whole thread, so the power missing from the list names nobody.
    by_france = message(recipients=[Power.GERMANY, Power.ITALY], anonymous=True)
    by_italy = message(sender=Power.ITALY, recipients=[Power.FRANCE, Power.GERMANY], anonymous=True)
    seen = [view_of(m, Power.GERMANY, revealed=False).model_dump() for m in (by_france, by_italy)]
    assert seen[0] == seen[1]
    assert seen[0]["recipients"] == [Power.FRANCE, Power.GERMANY, Power.ITALY]


def test_the_author_and_the_reveal_see_the_real_recipients():
    note = message(recipients=[Power.GERMANY, Power.ITALY], anonymous=True)
    assert view_of(note, Power.FRANCE, revealed=False).recipients == [Power.GERMANY, Power.ITALY]
    assert view_of(note, Power.GERMANY, revealed=True).recipients == [Power.GERMANY, Power.ITALY]


def test_a_one_to_one_anonymous_message_keeps_only_the_recipient():
    dm = message(sender=Power.FRANCE, recipients=[Power.GERMANY], anonymous=True)
    to_germany = view_of(dm, Power.GERMANY, revealed=False)
    assert to_germany.sender is None
    assert to_germany.recipients == [Power.GERMANY]
    assert "FRANCE" not in to_germany.model_dump_json()

    to_france = view_of(dm, Power.FRANCE, revealed=False)
    assert to_france.sender == Power.FRANCE
    assert to_france.recipients == [Power.GERMANY]

    revealed = view_of(dm, Power.GERMANY, revealed=True)
    assert revealed.sender == Power.FRANCE
    assert revealed.recipients == [Power.GERMANY]


def test_game_over_reveals_every_message_and_author():
    note = message(recipients=[Power.GERMANY, Power.ITALY], anonymous=True)
    assert can_read(note, Power.TURKEY, revealed=True)
    assert view_of(note, Power.TURKEY, revealed=True).sender == Power.FRANCE


def test_feed_keeps_order_and_skips_what_was_already_seen():
    messages = [
        message(1),
        message(2, recipients=[Power.GERMANY]),
        message(3, sender=Power.GERMANY, recipients=[Power.FRANCE]),
        message(4),
    ]
    number_messages(messages)
    assert [m.id for m in feed_for(messages, Power.ENGLAND, revealed=False)] == ["m1", "m4"]
    later = feed_for(messages, Power.GERMANY, revealed=False, after=2)
    assert [m.id for m in later] == ["m3", "m4"]


def test_each_player_numbers_only_what_they_read():
    # The private messages between France and Germany leave no gap in England's numbers.
    messages = [
        message(1),
        message(2, recipients=[Power.GERMANY]),
        message(3, sender=Power.GERMANY, recipients=[Power.FRANCE], anonymous=True),
        message(4),
    ]
    number_messages(messages)
    assert [m.seq for m in feed_for(messages, Power.ENGLAND, revealed=False)] == [1, 2]
    assert [m.seq for m in feed_for(messages, Power.GERMANY, revealed=False)] == [1, 2, 3, 4]
    # Nobody is sent the game-wide count or anyone else's numbers.
    view = view_of(messages[3], Power.ENGLAND, revealed=False).model_dump()
    assert "numbers" not in view
    assert view["seq"] == 2


def test_numbers_stay_put_when_the_oldest_press_is_dropped():
    messages = [message(1), message(2, recipients=[Power.GERMANY]), message(3)]
    number_messages(messages)
    del messages[0]
    messages.append(message(4))
    number_messages(messages)
    assert [m.seq for m in feed_for(messages, Power.ENGLAND, revealed=False)] == [2, 3]


def test_press_saved_before_numbering_is_numbered_in_order():
    messages = [message(5), message(9, recipients=[Power.GERMANY]), message(12)]
    number_messages(messages)
    assert [m.numbers[Power.ITALY] for m in (messages[0], messages[2])] == [1, 2]
    assert messages[1].numbers == {Power.FRANCE: 2, Power.GERMANY: 2}


def test_revealed_press_is_numbered_for_the_whole_game():
    messages = [message(1), message(2, recipients=[Power.GERMANY]), message(3)]
    number_messages(messages)
    assert [m.seq for m in feed_for(messages, Power.ENGLAND, revealed=True)] == [1, 2, 3]


def test_a_view_carries_the_suggested_orders_as_a_copy():
    from domain.board import UnitType
    from domain.orders import Order, OrderType

    suggestion = message(recipients=[Power.GERMANY])
    suggestion.orders = [
        Order(
            unit_id="GER_A_MUN",
            power=Power.GERMANY,
            unit_type=UnitType.ARMY,
            origin="MUN",
            order_type=OrderType.MOVE,
            target="BUR",
        )
    ]
    view = view_of(suggestion, Power.GERMANY, revealed=False)
    assert [o.target for o in view.orders] == ["BUR"]
    view.orders[0].target = "RUH"
    assert suggestion.orders[0].target == "BUR"


def test_a_spectator_reads_public_press_alone_numbered_without_gaps():
    messages = [
        message(1),
        message(2, recipients=[Power.GERMANY]),
        message(3, sender=Power.GERMANY, anonymous=True),
        message(4, sender=Power.GERMANY, recipients=[Power.FRANCE, Power.ITALY]),
        message(5),
    ]
    number_messages(messages)
    feed = spectator_feed(messages, revealed=False)
    assert [(m.id, m.seq) for m in feed] == [("m1", 1), ("m3", 2), ("m5", 3)]
    assert [m.sender for m in feed] == [Power.FRANCE, None, Power.FRANCE]
    assert all(m.recipients == [] and m.orders == [] for m in feed)
    assert [m.seq for m in spectator_feed(messages, revealed=False, after=2)] == [3]
    # Once the game is over the anonymous public author is shown; private press never is.
    revealed = spectator_feed(messages, revealed=True)
    assert [(m.id, m.sender) for m in revealed] == [
        ("m1", Power.FRANCE),
        ("m3", Power.GERMANY),
        ("m5", Power.FRANCE),
    ]


def test_spectator_numbers_stay_put_when_the_oldest_press_is_dropped():
    messages = [message(1), message(2, recipients=[Power.GERMANY]), message(3)]
    number_messages(messages)
    del messages[0]
    messages.append(message(4))
    number_messages(messages)
    assert [m.seq for m in spectator_feed(messages, revealed=False)] == [2, 3]


def test_press_saved_before_public_numbering_is_numbered_on_load():
    messages = [message(5), message(9, recipients=[Power.GERMANY]), message(12)]
    number_messages(messages)
    # Press saved with reader numbers but no public numbers yet.
    for m in messages:
        m.public_number = 0
    number_messages(messages)
    assert [m.public_number for m in messages] == [1, 0, 2]


def test_a_private_message_has_no_spectator_view():
    import pytest

    with pytest.raises(ValueError):
        spectator_view(message(1, recipients=[Power.GERMANY]), revealed=True)


def test_spectator_view_carries_public_suggested_orders_as_a_copy():
    from domain.board import UnitType
    from domain.orders import Order, OrderType

    public = message(1, sender=Power.FRANCE, anonymous=True)
    public.orders = [
        Order(
            unit_id="GER_A_MUN",
            power=Power.GERMANY,
            unit_type=UnitType.ARMY,
            origin="MUN",
            order_type=OrderType.MOVE,
            target="BUR",
        )
    ]
    view = spectator_view(public, revealed=False)
    assert view.sender is None
    assert [o.target for o in view.orders] == ["BUR"]
    view.orders[0].target = "RUH"
    assert public.orders[0].target == "BUR"
