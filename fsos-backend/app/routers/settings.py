"""Settings: the IPs themselves, and the rules the rest of the app reads.

Everything configurable lives here rather than in code, so a new IP appears across the
app without a deploy — and, deliberately, without inventing history for it. `bo_target`
stays NULL until someone sets a quota; the UI shows "Not configured" rather than a zero
that looks like a real target.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db, shape
from ..access import require
from ..auth import Caller, current_caller

router = APIRouter(prefix="/api/ips", tags=["ips"])
settings_router = APIRouter(prefix="/api/settings", tags=["settings"])

# What the app assumes when nobody has chosen yet. These live here rather than in a
# seeded row so a fresh database is usable immediately, and so changing a default
# reaches every install instead of only new ones. Anything an admin sets in Settings
# is stored in `app_settings.settings` and wins over these.
DEFAULT_SETTINGS = {
    "thresholds": {"good": 100, "average": 50},   # % of the IP's view target
    "baselineSample": 5,                          # recent publications per baseline
    "cycleAnchor": None,                          # set from Settings; six-day cycles are calendar-fixed
    "spacingMinutes": None,                       # optional same-IP spacing rule, off by default
    "approverBoId": None,                         # who approves BO ideas
    "shortFormLeadId": None,
    "hpnBypassUserIds": [],                       # may publish HPN without the usual review
    "exceptionApproverIds": [],                   # may authorise a same-day repetition
    "sixDayAssigneeId": None,
}


def with_defaults(stored: dict | None) -> dict:
    """Stored values over the defaults, one level deep — `thresholds` is a dict and
    a half-filled one shouldn't drop the other key."""
    merged = {**DEFAULT_SETTINGS, **(stored or {})}
    if isinstance(merged.get("thresholds"), dict):
        merged["thresholds"] = {**DEFAULT_SETTINGS["thresholds"], **merged["thresholds"]}
    return merged


class NewIP(BaseModel):
    code: str
    name: str
    handle: str | None = None
    hex: str = "#57534E"
    group: str = "none"
    stage: int = 1
    floors: dict = Field(default_factory=lambda: {"posts": 0, "reels": 0})


class IPPatch(BaseModel):
    code: str | None = None
    name: str | None = None
    handle: str | None = None
    hex: str | None = None
    active: bool | None = None
    group: str | None = None
    stage: int | None = None
    floors: dict | None = None
    ranges: dict | None = None
    menu: list[str] | None = None
    boTarget: dict | None = None
    perfTarget: dict | None = None
    spacingMinutes: int | None = None


@router.post("")
async def add_ip(body: NewIP, caller: Caller = Depends(current_caller)):
    require(caller.access, "settings", "edit")
    code = body.code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="An IP needs a code.")
    if await db.select_one("ips", {"code": f"eq.{code}", "select": "id"}):
        raise HTTPException(status_code=409, detail=f"An IP with the code {code} already exists.")
    return shape.to_ip(await db.insert("ips", {
        "code": code, "name": body.name.strip() or code, "handle": body.handle,
        "hex": body.hex, "tracker_group": body.group, "stage": body.stage, "floors": body.floors,
    }))


@router.patch("/{ip_id}")
async def update_ip(ip_id: str, patch: IPPatch, caller: Caller = Depends(current_caller)):
    require(caller.access, "settings", "edit")
    if not await db.select_one("ips", {"id": f"eq.{ip_id}", "select": "id"}):
        raise HTTPException(status_code=404, detail="IP not found")
    cols = shape.from_ip(patch.model_dump(exclude_unset=True))
    if not cols:
        return shape.to_ip(await db.select_one("ips", {"id": f"eq.{ip_id}", "select": "*"}))
    rows = await db.update("ips", {"id": f"eq.{ip_id}"}, cols)
    return shape.to_ip(rows[0])


class SettingsPatch(BaseModel):
    """Merged into the single app_settings row — thresholds, approvers, cycle anchor."""
    settings: dict


@settings_router.patch("")
async def update_settings(body: SettingsPatch, caller: Caller = Depends(current_caller)):
    require(caller.access, "settings", "edit")
    row = await db.select_one("app_settings", {"select": "settings"})
    stored = {**((row or {}).get("settings") or {}), **body.settings}
    await db.update("app_settings", {"id": "eq.true"}, {"settings": stored})
    return {"settings": with_defaults(stored)}
