"""Who may read a press message, and whether its author is shown."""

from domain.board import Power
from domain.press import PressMessage
from security.press import can_read, feed_for, view_of


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
    note = message(recipients=[Power.GERMANY], anonymous=True)
    assert view_of(note, Power.GERMANY, revealed=False).sender is None
    assert view_of(note, Power.FRANCE, revealed=False).sender == Power.FRANCE
    public = message(anonymous=True)
    assert view_of(public, Power.ENGLAND, revealed=False).sender is None


def test_a_hidden_author_appears_nowhere_in_the_view():
    note = message(recipients=[Power.GERMANY], anonymous=True)
    assert "FRANCE" not in view_of(note, Power.GERMANY, revealed=False).model_dump_json()


def test_game_over_reveals_every_message_and_author():
    note = message(recipients=[Power.GERMANY], anonymous=True)
    assert can_read(note, Power.TURKEY, revealed=True)
    assert view_of(note, Power.TURKEY, revealed=True).sender == Power.FRANCE


def test_feed_keeps_order_and_skips_what_was_already_seen():
    messages = [
        message(1),
        message(2, recipients=[Power.GERMANY]),
        message(3, sender=Power.GERMANY, recipients=[Power.FRANCE]),
        message(4),
    ]
    assert [m.seq for m in feed_for(messages, Power.ENGLAND, revealed=False)] == [1, 4]
    assert [m.seq for m in feed_for(messages, Power.GERMANY, revealed=False, after=2)] == [3, 4]
