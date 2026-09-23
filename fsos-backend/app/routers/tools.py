"""6-Day Tracker and Growth — the two Cops/Growth tools, on real imported history.

The 6-Day month is split into five fixed calendar cycles (1–6, 7–12, 13–18, 19–24,
25–end), which is why `cycle` is a small integer rather than a date range: the cycles
don't move, and the whole tool is built on comparing the same slot month to month.

Growth reads `growth_monthly`. Where a month has 6-Day cycle data, the cycle sums win;
`growth_monthly.views` only fills the months from before the tracker existed. That's the
same rule snoboard's Growth page used, kept so the numbers match what the team knows.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import db, shape
from ..access import require
from ..auth import Caller, current_caller

router = APIRouter(prefix="/api/six-day", tags=["six-day"])
growth_router = APIRouter(prefix="/api/growth", tags=["growth"])

MONTH_RE = r"^\d{4}-\d{2}$"


def _month(ym: str) -> str:
    import re
    if not re.fullmatch(MONTH_RE, ym or ""):
        raise HTTPException(status_code=400, detail=f"Month must look like 2026-09, got: {ym}")
    return shape.month_to_col(ym)


def _cycle(c: int) -> int:
    if c not in (1, 2, 3, 4, 5):
        raise HTTPException(status_code=400, detail="Cycle must be 1–5.")
    return c


class Entry(BaseModel):
    month: str
    cycle: int
    ipId: str
    views: int | None = None
    reelPct: int | None = None
    postPct: int | None = None
    reelPerf: float | None = None
    postPerf: float | None = None


class TopContent(BaseModel):
    month: str
    cycle: int
    ipId: str
    link: str
    views: int = 0
    type: str = "reel"


class TopContentPatch(BaseModel):
    link: str | None = None
    views: int | None = None
    type: str | None = None


class Actual(BaseModel):
    month: str
    ipId: str
    actualViews: int


class Assignee(BaseModel):
    userId: str | None = None


class Followers(BaseModel):
    month: str
    ipId: str
    followersGained: int


@router.put("/entries")
async def upsert_entry(body: Entry, caller: Caller = Depends(current_caller)):
    """One IP's numbers for one cycle. Upserted on (month, cycle, ip) so editing a
    cell twice doesn't create a second row."""
    require(caller.access, "six_day", "edit")
    row = {
        "month": _month(body.month), "cycle": _cycle(body.cycle), "ip_id": body.ipId,
        "filled_by": caller.id,
    }
    given = body.model_dump(exclude_unset=True)
    for key, col in (("views", "views"), ("reelPct", "reel_pct"), ("postPct", "post_pct"),
                     ("reelPerf", "reel_perf"), ("postPerf", "post_perf")):
        if key in given:
            row[col] = given[key]
    return shape.to_six_day_entry(await db.insert("six_day_entries", row, upsert_on="month,cycle,ip_id"))


@router.post("/top-content")
async def add_top_content(body: TopContent, caller: Caller = Depends(current_caller)):
    require(caller.access, "six_day", "edit")
    if not body.link.strip():
        raise HTTPException(status_code=400, detail="Top content needs a link.")
    if body.type not in ("reel", "post"):
        raise HTTPException(status_code=400, detail="Type must be reel or post.")
    return shape.to_top_content(await db.insert("six_day_top_content", {
        "month": _month(body.month), "cycle": _cycle(body.cycle), "ip_id": body.ipId,
        "link": body.link.strip(), "views": body.views, "content_type": body.type,
    }))


@router.patch("/top-content/{item_id}")
async def update_top_content(item_id: str, body: TopContentPatch, caller: Caller = Depends(current_caller)):
    require(caller.access, "six_day", "edit")
    given = body.model_dump(exclude_unset=True)
    cols = {}
    if "link" in given:
        cols["link"] = given["link"]
    if "views" in given:
        cols["views"] = given["views"]
    if "type" in given:
        cols["content_type"] = given["type"]
    if not cols:
        raise HTTPException(status_code=400, detail="Nothing to update.")
    rows = await db.update("six_day_top_content", {"id": f"eq.{item_id}"}, cols)
    if not rows:
        raise HTTPException(status_code=404, detail="Top content not found")
    return shape.to_top_content(rows[0])


@router.delete("/top-content/{item_id}")
async def delete_top_content(item_id: str, caller: Caller = Depends(current_caller)):
    require(caller.access, "six_day", "edit")
    await db.delete("six_day_top_content", {"id": f"eq.{item_id}"})
    return {"ok": True}


@router.put("/actuals")
async def upsert_actual(body: Actual, caller: Caller = Depends(current_caller)):
    """The month-end number from Instagram, against which the cycle sums are checked."""
    require(caller.access, "six_day", "edit")
    return shape.to_actual(await db.insert("six_day_actuals", {
        "month": _month(body.month), "ip_id": body.ipId,
        "actual_views": body.actualViews, "filled_by": caller.id,
    }, upsert_on="month,ip_id"))


@router.put("/assignee")
async def set_assignee(body: Assignee, caller: Caller = Depends(current_caller)):
    """Who gets chased when a cycle goes unfilled. Lives in app_settings, not a table."""
    require(caller.access, "six_day", "edit")
    row = await db.select_one("app_settings", {"select": "settings"})
    merged = {**((row or {}).get("settings") or {}), "sixDayAssigneeId": body.userId}
    await db.update("app_settings", {"id": "eq.true"}, {"settings": merged})
    return {"assigneeId": body.userId}


@growth_router.put("/followers")
async def set_followers(body: Followers, caller: Caller = Depends(current_caller)):
    """Followers gained in a month. Views on the same row are left alone — they're
    either imported history or derived from 6-Day cycles."""
    require(caller.access, "growth", "edit")
    month = _month(body.month)
    existing = await db.select_one("growth_monthly", {
        "month": f"eq.{month}", "ip_id": f"eq.{body.ipId}", "select": "*"})
    row = {"month": month, "ip_id": body.ipId, "followers_gained": body.followersGained}
    if existing:
        row["views"] = existing.get("views")
    return shape.to_growth(await db.insert("growth_monthly", row, upsert_on="month,ip_id"))
