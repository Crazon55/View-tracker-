"""A calendar feed of the 6-Day Tracker's "add views" days, for a teammate to subscribe to.

The tracker's five cycles are fixed calendar days (1–6, 7–12, 13–18, 19–24, 25–end), so
the day views get logged is the last day of each one. There is no Google API in this: the
route serves a private iCalendar feed, and the person adds its URL once in Google
Calendar (Other calendars → From URL). Their calendar then shows an all-day event on each
of those days. Google re-reads a subscribed feed every few hours rather than instantly.

The feed has no login, since a calendar app can't sign in, so it is guarded by a secret
in the URL (FSOS_CALENDAR_TOKEN). Unset, the route is off.
"""
import secrets
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query, Response

from ..config import CALENDAR_TOKEN
from .workspace import today_ist

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

MONTHS_BEHIND = 1
MONTHS_AHEAD = 6


def cycle_ends(year: int, month: int) -> list[tuple[int, date]]:
    """(cycle, last day) for the five fixed cycles of a month."""
    last = (date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1)).day
    return [(c, date(year, month, d)) for c, d in zip((1, 2, 3, 4, 5), (6, 12, 18, 24, last))]


def _months(today: date):
    y, m = today.year, today.month - MONTHS_BEHIND
    for _ in range(MONTHS_BEHIND + MONTHS_AHEAD + 1):
        yield y + (m - 1) // 12, (m - 1) % 12 + 1
        m += 1


def build_feed(today: date) -> str:
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FSOS//6-Day Tracker//EN", "CALSCALE:GREGORIAN",
             "X-WR-CALNAME:FSOS 6-Day views", "X-WR-CALDESC:Days to add views in the 6-Day Tracker"]
    for year, month in _months(today):
        for cycle, day in cycle_ends(year, month):
            lines += [
                "BEGIN:VEVENT",
                f"UID:fsos-six-day-{year}{month:02d}-c{cycle}@fsos",
                f"DTSTAMP:{today:%Y%m%d}T000000Z",
                f"DTSTART;VALUE=DATE:{day:%Y%m%d}",
                f"DTEND;VALUE=DATE:{day + timedelta(days=1):%Y%m%d}",
                f"SUMMARY:Add 6-Day views: cycle {cycle} ({day:%b %Y})",
                f"DESCRIPTION:Cycle {cycle} ends today. Add each IP's views in the FSOS 6-Day Tracker.",
                "TRANSP:TRANSPARENT",
                "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:PT11H", "DESCRIPTION:Add 6-Day views", "END:VALARM",
                "END:VEVENT",
            ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


@router.get("/six-day.ics")
async def six_day_feed(token: str = Query("")):
    if not CALENDAR_TOKEN or not secrets.compare_digest(token.encode(), CALENDAR_TOKEN.encode()):
        raise HTTPException(status_code=404, detail="Not found")
    return Response(build_feed(date.fromisoformat(today_ist())), media_type="text/calendar; charset=utf-8")
