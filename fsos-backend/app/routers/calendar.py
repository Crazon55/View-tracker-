"""A calendar feed of the 6-Day Tracker's "add views" days, for a teammate to subscribe to.

The tracker's five cycles are fixed calendar days (1–6, 7–12, 13–18, 19–24, 25–end), so
the day views get logged is the last day of each one. There is no Google API in this: the
route serves a private iCalendar feed, and the person adds its URL once in Google
Calendar (Other calendars → From URL). Their calendar then shows an all-day event on each
of those days. Google re-reads a subscribed feed every few hours rather than instantly.

The feed has no login, since a calendar app can't sign in, so it is guarded by a secret
in the URL (FSOS_CALENDAR_TOKEN). Unset, the route is off.
"""
import asyncio
import json
import secrets
import smtplib
from datetime import date, timedelta
from email.message import EmailMessage

from fastapi import APIRouter, HTTPException, Query, Response

from ..config import (
    APP_URL, CALENDAR_TOKEN, ROOT, SIX_DAY_INVITE_TO, SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USER,
)
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


# ───────────────────────── emailed invite ─────────────────────────
# Sent at the START of each cycle but dated for its LAST day, so the invite lands in the
# calendar early and Google pings at 11 AM on the day itself.

CYCLE_STARTS = (1, 7, 13, 19, 25)
SENT_LOG = ROOT / ".six-day-invites-sent.json"
REMIND_AT = "PT11H"  # 11 AM, counted from the all-day event's midnight start


def cycle_starting(today: date) -> tuple[int, date] | None:
    """(cycle, its last day) when `today` is the first day of a cycle, otherwise None."""
    if today.day not in CYCLE_STARTS:
        return None
    cycle = CYCLE_STARTS.index(today.day) + 1
    return cycle, dict(cycle_ends(today.year, today.month))[cycle]


def invite_ics(cycle: int, day: date, to: str, sender: str, today: date) -> str:
    """A calendar invite (METHOD:REQUEST). The fixed UID means re-sending updates the same event."""
    return "\r\n".join([
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FSOS//6-Day Tracker//EN", "METHOD:REQUEST",
        "BEGIN:VEVENT",
        f"UID:fsos-six-day-{day:%Y%m}-c{cycle}@fsos",
        f"DTSTAMP:{today:%Y%m%d}T000000Z",
        f"DTSTART;VALUE=DATE:{day:%Y%m%d}",
        f"DTEND;VALUE=DATE:{day + timedelta(days=1):%Y%m%d}",
        f"SUMMARY:Add 6-Day views: cycle {cycle} ({day:%b %Y})",
        f"DESCRIPTION:Cycle {cycle} ends today. Add each IP's views here: {APP_URL}/six-day-tracker",
        f"ORGANIZER:mailto:{sender}",
        f"ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:{to}",
        "TRANSP:TRANSPARENT", "SEQUENCE:0", "STATUS:CONFIRMED",
        "BEGIN:VALARM", "ACTION:DISPLAY", f"TRIGGER:{REMIND_AT}", "DESCRIPTION:Add 6-Day views", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR", "",
    ])


def _send(msg: EmailMessage) -> None:
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)


def _sent_keys() -> list:
    try:
        return json.loads(SENT_LOG.read_text())
    except (OSError, ValueError):
        return []


@router.post("/send-six-day-invite")
async def send_six_day_invite(token: str = Query(""), dry: bool = Query(False), force: bool = Query(False)):
    """Run once a day (cron). On the first day of a cycle it emails the invite; otherwise it does nothing."""
    if not CALENDAR_TOKEN or not secrets.compare_digest(token.encode(), CALENDAR_TOKEN.encode()):
        raise HTTPException(status_code=404, detail="Not found")
    today = date.fromisoformat(today_ist())
    due = cycle_starting(today)
    if not due:
        return {"sent": False, "reason": "Not the first day of a cycle."}
    cycle, day = due
    key = f"{day:%Y-%m}-c{cycle}"
    if key in _sent_keys() and not force:
        return {"sent": False, "reason": f"Cycle {cycle} invite already sent."}
    if dry:
        return {"sent": False, "dry": True, "would_send": {"cycle": cycle, "event_day": day.isoformat(), "to": SIX_DAY_INVITE_TO}}
    if not (SMTP_HOST and SMTP_USER and SMTP_PASSWORD and SIX_DAY_INVITE_TO):
        raise HTTPException(status_code=503, detail="Email isn't set up: FSOS_SMTP_HOST/USER/PASSWORD and FSOS_SIX_DAY_INVITE_TO are needed.")
    msg = EmailMessage()
    msg["Subject"] = f"Add 6-Day views: cycle {cycle} ({day:%d %b})"
    msg["From"], msg["To"] = SMTP_FROM, SIX_DAY_INVITE_TO
    msg.set_content(f"Cycle {cycle} ends on {day:%d %b}. That is the day to add each IP's views.\n\n{APP_URL}/six-day-tracker\n")
    msg.add_attachment(invite_ics(cycle, day, SIX_DAY_INVITE_TO, SMTP_FROM, today).encode(), maintype="text", subtype="calendar",
                       params={"method": "REQUEST", "charset": "UTF-8"}, filename="invite.ics")
    try:
        await asyncio.to_thread(_send, msg)
    except (smtplib.SMTPException, OSError) as e:
        raise HTTPException(status_code=502, detail=f"The email could not be sent: {e}")
    try:
        SENT_LOG.write_text(json.dumps(_sent_keys() + [key]))
    except OSError:
        pass
    return {"sent": True, "cycle": cycle, "event_day": day.isoformat(), "to": SIX_DAY_INVITE_TO}
