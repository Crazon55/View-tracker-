"""The emailed 6-Day invite: which days send, and what the invite says. No email is sent."""
from datetime import date

from app.routers.calendar import cycle_starting, invite_ics


def test_invite_is_sent_only_on_the_first_day_of_a_cycle():
    assert cycle_starting(date(2026, 10, 1)) == (1, date(2026, 10, 6))
    assert cycle_starting(date(2026, 10, 7)) == (2, date(2026, 10, 12))
    assert cycle_starting(date(2026, 10, 25)) == (5, date(2026, 10, 31))
    assert cycle_starting(date(2026, 2, 25)) == (5, date(2026, 2, 28))
    for day in (2, 6, 8, 12, 14, 24, 26, 31):
        assert cycle_starting(date(2026, 10, day)) is None


def test_invite_is_dated_for_the_last_day_and_reminds_at_11am():
    ics = invite_ics(2, date(2026, 10, 12), "a@x.com", "f@x.com", date(2026, 10, 7))
    assert "METHOD:REQUEST" in ics
    assert "DTSTART;VALUE=DATE:20261012" in ics and "DTEND;VALUE=DATE:20261013" in ics
    assert "TRIGGER:PT11H" in ics
    assert "mailto:a@x.com" in ics and "ORGANIZER:mailto:f@x.com" in ics
    assert "UID:fsos-six-day-202610-c2@fsos" in ics
