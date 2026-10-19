"""The 6-Day calendar feed: pure date maths and the feed text. No database."""
from datetime import date

from app.routers.calendar import build_feed, cycle_ends


def test_cycle_ends_are_last_day_of_each_fixed_cycle():
    assert [d.day for _, d in cycle_ends(2026, 10)] == [6, 12, 18, 24, 31]
    assert [d.day for _, d in cycle_ends(2026, 2)] == [6, 12, 18, 24, 28]
    assert [d.day for _, d in cycle_ends(2028, 2)][-1] == 29
    assert cycle_ends(2026, 12)[-1][1] == date(2026, 12, 31)


def test_feed_has_an_all_day_event_per_cycle_end():
    feed = build_feed(date(2026, 10, 19))
    assert feed.startswith("BEGIN:VCALENDAR") and feed.rstrip().endswith("END:VCALENDAR")
    assert "DTSTART;VALUE=DATE:20261018" in feed and "DTEND;VALUE=DATE:20261019" in feed
    assert "DTSTART;VALUE=DATE:20261031" in feed
    assert feed.count("BEGIN:VEVENT") == 8 * 5
    uids = [l for l in feed.splitlines() if l.startswith("UID:")]
    assert len(uids) == len(set(uids))
