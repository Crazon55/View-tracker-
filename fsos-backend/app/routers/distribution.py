"""Distribution: the calendar, the repetition rule, and confirming what went live.

Nothing here allocates automatically — COC places every item by hand, which is the
point of the area. Two rules are enforced rather than merely displayed:

* one live placement per version (the partial unique index does the real work), so
  "placing" something already placed is a move, not a second slot;
* the repetition rule — two versions of the *same idea* on the same calendar day need
  an authorised exception. The API reports the conflict; a caller with the right to
  authorise may override it, and the override is recorded with who and why.
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db, events, shape
from ..access import require
from ..auth import Caller, current_caller
from .ideas import get_idea, get_version, ip_code

router = APIRouter(prefix="/api/distribution", tags=["distribution"])


class Place(BaseModel):
    versionId: str
    date: str
    time: str | None = None
    order: int = 1
    force: bool = False           # place anyway, recording the conflict
    exception: bool = False       # place as an authorised exception
    reason: str | None = None


class BulkPlace(BaseModel):
    proposals: list[Place] = Field(default_factory=list)


class Move(BaseModel):
    date: str


class Cancel(BaseModel):
    reason: str | None = None


class Exception_(BaseModel):
    reason: str | None = None


class Displacement(BaseModel):
    boVersionId: str
    hpnVersionId: str
    ipId: str
    date: str
    boAction: str = "return"      # 'reschedule' | 'return'
    newDate: str | None = None
    reason: str | None = None


class Publish(BaseModel):
    versionId: str
    url: str | None = None
    publishedAt: str


class Collab(BaseModel):
    versionId: str


async def live_placement(version_id: str) -> dict | None:
    return await db.select_one("placements", {
        "version_id": f"eq.{version_id}", "state": "neq.cancelled", "select": "*"})


async def _conflict(version: dict, date: str) -> bool:
    """True when another version of the same idea is already live on that calendar day.

    BO only. The rule exists so a follower who sees two of our pages does not get the
    same evergreen post twice in a day. HPN is news: when something happens it goes out
    across the pages that cover it, that day, and holding one back to tomorrow means
    publishing it after it stopped being true. Same idea, different reason for existing.
    """
    idea = await db.select_one("ideas", {"id": f"eq.{version['idea_id']}", "select": "stream"})
    if (idea or {}).get("stream") == "HPN":
        return False
    same_day = await db.select("placements", {
        "date": f"eq.{date}", "state": "neq.cancelled", "select": "version_id"})
    others = [p["version_id"] for p in same_day if p["version_id"] != version["id"]]
    if not others:
        return False
    siblings = await db.select("versions", {
        "idea_id": f"eq.{version['idea_id']}", "select": "id"})
    return bool({v["id"] for v in siblings} & set(others))


def _entry(action: str, by: str) -> dict:
    return {"at": events.now_iso(), "by": by, "action": action}


async def _place_one(body: Place, caller: Caller) -> dict:
    v = await get_version(body.versionId)
    existing = await live_placement(body.versionId)
    if existing:
        history = (existing.get("history") or []) + [_entry(f"Moved to {body.date}", caller.id)]
        patch = {"date": body.date, "time": body.time, "history": history}
        if body.exception:
            patch |= {"exception_reason": body.reason or "Authorised exception",
                      "exception_by": caller.id, "exception_at": events.now_iso()}
        rows = await db.update("placements", {"id": f"eq.{existing['id']}"}, patch)
        placement = rows[0] if rows else existing
    else:
        placement = await db.insert("placements", {
            "version_id": body.versionId, "ip_id": v["ip_id"], "date": body.date, "time": body.time,
            "sort_order": body.order, "state": "pending",
            "history": [_entry("Placed", caller.id)],
            "exception_reason": (body.reason or "Authorised exception") if body.exception else None,
            "exception_by": caller.id if body.exception else None,
            "exception_at": events.now_iso() if body.exception else None,
        })
    await events.log(v["idea_id"], "placed", f"Placed on {await ip_code(v['ip_id'])} — {body.date}", caller.id)
    return placement


@router.post("/place")
async def place(body: Place, caller: Caller = Depends(current_caller)):
    """Place or move a version. Returns `conflict` instead of placing when the
    repetition rule bites and the caller hasn't asked to override it."""
    require(caller.access, "distribution", "edit")
    v = await get_version(body.versionId)
    conflict = None
    if not body.exception and await _conflict(v, body.date):
        conflict = "same_day_repetition"
        if not body.force:
            return {"conflict": conflict, "placement": None}
    placement = await _place_one(body, caller)
    return {"conflict": conflict, "placement": shape.to_placement(placement)}


@router.post("/bulk-place")
async def bulk_place(body: BulkPlace, caller: Caller = Depends(current_caller)):
    require(caller.access, "distribution", "edit")
    placed = []
    for p in body.proposals:
        placed.append(shape.to_placement(await _place_one(p, caller)))
    return {"placements": placed}


@router.patch("/placements/{placement_id}")
async def move_placement(placement_id: str, body: Move, caller: Caller = Depends(current_caller)):
    require(caller.access, "distribution", "edit")
    p = await db.select_one("placements", {"id": f"eq.{placement_id}", "select": "*"})
    if not p:
        raise HTTPException(status_code=404, detail="Placement not found")
    history = (p.get("history") or []) + [_entry(f"Moved {p['date']} → {body.date}", caller.id)]
    rows = await db.update("placements", {"id": f"eq.{placement_id}"}, {"date": body.date, "history": history})
    return shape.to_placement(rows[0])


@router.post("/placements/{placement_id}/cancel")
async def cancel_placement(placement_id: str, body: Cancel, caller: Caller = Depends(current_caller)):
    require(caller.access, "distribution", "edit")
    p = await db.select_one("placements", {"id": f"eq.{placement_id}", "select": "*"})
    if not p:
        raise HTTPException(status_code=404, detail="Placement not found")
    history = (p.get("history") or []) + [_entry(f"Cancelled: {body.reason or ''}", caller.id)]
    rows = await db.update("placements", {"id": f"eq.{placement_id}"}, {
        "state": "cancelled", "exception_reason": body.reason or p.get("exception_reason"), "history": history})
    return shape.to_placement(rows[0])


@router.post("/versions/{version_id}/unallocate")
async def unallocate(version_id: str, body: Cancel, caller: Caller = Depends(current_caller)):
    """Back to the bank. The version keeps its age and approval — it isn't new work."""
    require(caller.access, "distribution", "edit")
    live = await live_placement(version_id)
    if not live:
        return {"placement": None}
    history = (live.get("history") or []) + [_entry("Returned to bank", caller.id)]
    rows = await db.update("placements", {"id": f"eq.{live['id']}"}, {
        "state": "cancelled", "exception_reason": body.reason or "Returned to unallocated", "history": history})
    return {"placement": shape.to_placement(rows[0])}


@router.post("/placements/{placement_id}/authorize-exception")
async def authorize_exception(placement_id: str, body: Exception_, caller: Caller = Depends(current_caller)):
    """Record who allowed a same-day repetition, and why. Founder/Admin or the people
    named in Settings as exception approvers."""
    require(caller.access, "distribution", "edit")
    p = await db.select_one("placements", {"id": f"eq.{placement_id}", "select": "*"})
    if not p:
        raise HTTPException(status_code=404, detail="Placement not found")

    settings = ((await db.select_one("app_settings", {"select": "settings"})) or {}).get("settings") or {}
    approvers = settings.get("exceptionApproverIds") or []
    if approvers and caller.id not in approvers and "Founder/Admin" not in caller.roles:
        raise HTTPException(status_code=403, detail="You aren't listed as an exception approver in Settings.")

    reason = body.reason or "Authorised exception"
    history = (p.get("history") or []) + [_entry(f"Authorised same-day exception: {body.reason or ''}", caller.id)]
    rows = await db.update("placements", {"id": f"eq.{placement_id}"}, {
        "exception_reason": reason, "exception_by": caller.id,
        "exception_at": events.now_iso(), "history": history})
    v = await get_version(p["version_id"])
    await events.log(v["idea_id"], "exception",
                     f"Same-day repetition exception authorised by {caller.person['name']}", caller.id)
    return shape.to_placement(rows[0])


@router.post("/displace")
async def displace(body: Displacement, caller: Caller = Depends(current_caller)):
    """HPN takes a BO slot. The BO version is rescheduled or returned to the bank —
    never dropped, which is the whole reason this has its own endpoint."""
    require(caller.access, "distribution", "edit")
    hv = await get_version(body.hpnVersionId)
    existing = await live_placement(body.hpnVersionId)
    if existing:
        history = (existing.get("history") or []) + [_entry(f"Moved into displaced BO slot {body.date}", caller.id)]
        await db.update("placements", {"id": f"eq.{existing['id']}"},
                        {"date": body.date, "ip_id": body.ipId, "history": history})
    else:
        await db.insert("placements", {
            "version_id": body.hpnVersionId, "ip_id": body.ipId, "date": body.date,
            "sort_order": 1, "state": "pending",
            "history": [_entry("Placed (HPN displacement)", caller.id)]})
    await events.log(hv["idea_id"], "placed", f"HPN placed into BO slot on {body.date}", caller.id)

    bo_live = await live_placement(body.boVersionId)
    if bo_live:
        bv = await get_version(body.boVersionId)
        if body.boAction == "reschedule" and body.newDate:
            history = (bo_live.get("history") or []) + [
                _entry(f"Displaced by HPN: rescheduled {bo_live['date']} → {body.newDate}", caller.id)]
            await db.update("placements", {"id": f"eq.{bo_live['id']}"},
                            {"date": body.newDate, "history": history})
            await events.log(bv["idea_id"], "displaced",
                             f"Displaced by HPN — rescheduled to {body.newDate}", caller.id)
        else:
            history = (bo_live.get("history") or []) + [
                _entry("Displaced by HPN → returned to bank (age & approval intact)", caller.id)]
            await db.update("placements", {"id": f"eq.{bo_live['id']}"}, {
                "state": "cancelled",
                "exception_reason": body.reason or "Displaced by HPN — returned to unallocated bank",
                "history": history})
            await events.log(bv["idea_id"], "displaced",
                             "Displaced by HPN — returned to unallocated bank", caller.id)
    return {"ok": True}


@router.post("/publish")
async def publish(body: Publish, caller: Caller = Depends(current_caller)):
    """Confirm something went live, and open its 24-hour capture window."""
    require(caller.access, "distribution", "edit")
    v = await get_version(body.versionId)

    dup = bool(body.url) and bool(await db.select_one("publications", {"url": f"eq.{body.url}", "select": "id"}))
    live = await live_placement(body.versionId)
    if live:
        await db.update("placements", {"id": f"eq.{live['id']}"}, {"state": "confirmed"})

    pub = await db.insert("publications", {
        "url": body.url, "published_at": body.publishedAt, "is_collab": False})
    await db.insert("publication_versions", {
        "publication_id": pub["id"], "version_id": body.versionId,
        "ip_id": v["ip_id"], "placement_id": live["id"] if live else None})

    # 24 hours from publication — missing is not zero, so views start NULL.
    published = datetime.fromisoformat(body.publishedAt.replace("Z", "+00:00"))
    await db.insert("snapshots", {
        "publication_id": pub["id"], "views": None,
        "due_at": (published + timedelta(hours=24)).isoformat()})

    await events.log(v["idea_id"], "published", f"Published to {await ip_code(v['ip_id'])}", caller.id)
    return {"dupUrl": dup, "publicationId": pub["id"]}


@router.post("/publications/{publication_id}/collab")
async def link_collab(publication_id: str, body: Collab, caller: Caller = Depends(current_caller)):
    """One post, several IPs — a deliberate collaboration, not a repetition breach."""
    require(caller.access, "distribution", "edit")
    pub = await db.select_one("publications", {"id": f"eq.{publication_id}", "select": "*"})
    if not pub:
        raise HTTPException(status_code=404, detail="Publication not found")
    v = await get_version(body.versionId)
    already = await db.select_one("publication_versions", {
        "publication_id": f"eq.{publication_id}", "version_id": f"eq.{body.versionId}", "select": "version_id"})
    if already:
        return {"ok": True}
    live = await live_placement(body.versionId)
    await db.insert("publication_versions", {
        "publication_id": publication_id, "version_id": body.versionId,
        "ip_id": v["ip_id"], "placement_id": live["id"] if live else None})
    await db.update("publications", {"id": f"eq.{publication_id}"}, {"is_collab": True})
    await events.log(v["idea_id"], "collab", "Linked as collaboration", caller.id)
    return {"ok": True}


@router.post("/versions/{version_id}/report-pending")
async def report_pending(version_id: str, caller: Caller = Depends(current_caller)):
    """Live, but the link hasn't been pasted yet — keeps Today honest."""
    require(caller.access, "distribution", "edit")
    live = await live_placement(version_id)
    if not live:
        raise HTTPException(status_code=404, detail="That version isn't placed.")
    history = (live.get("history") or []) + [_entry("Reported live, link pending", caller.id)]
    rows = await db.update("placements", {"id": f"eq.{live['id']}"},
                           {"reported_pending": True, "history": history})
    return shape.to_placement(rows[0])
