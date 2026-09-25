"""Ideas, their per-destination versions, batches and categories.

An idea is the unit of work; a version is that idea aimed at one IP. Adding a
destination creates a version, and every version carries its own hook, caption and
assets. The two streams are gated separately: BO work needs BO Studio, HPN needs HPN Desk.
"""
import asyncio
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db, events, shape
from ..access import require
from ..links import require_asset_link
from ..auth import Caller, current_caller

router = APIRouter(prefix="/api/ideas", tags=["ideas"])
versions_router = APIRouter(prefix="/api/versions", tags=["versions"])
batches_router = APIRouter(prefix="/api/batches", tags=["batches"])
categories_router = APIRouter(prefix="/api/categories", tags=["categories"])

FORMATS = ("Reel", "Carousel", "Static")
STREAMS = ("BO", "HPN")


def area_for(stream: str) -> str:
    return "bo_studio" if stream == "BO" else "hpn_desk"


async def get_idea(idea_id: str) -> dict:
    idea = await db.select_one("ideas", {"id": f"eq.{idea_id}", "select": "*"})
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    return idea


async def get_version(version_id: str) -> dict:
    v = await db.select_one("versions", {"id": f"eq.{version_id}", "select": "*"})
    if not v:
        raise HTTPException(status_code=404, detail="Version not found")
    return v


async def ip_code(ip_id: str) -> str:
    ip = await db.select_one("ips", {"id": f"eq.{ip_id}", "select": "code"})
    return (ip or {}).get("code") or "?"


async def idea_payload(idea_id: str) -> dict:
    """The idea plus its versions — what the browser merges back into its state."""
    idea = await get_idea(idea_id)
    versions = await db.select("versions", {"idea_id": f"eq.{idea_id}", "select": "*"})
    return {"idea": shape.to_idea(idea), "versions": [shape.to_version(v) for v in versions]}


class NewIdea(BaseModel):
    stream: str
    title: str
    format: str
    category: str | None = None
    topic: str | None = None
    sources: list = Field(default_factory=list)
    brief: dict = Field(default_factory=dict)
    destinations: list[str] = Field(default_factory=list)
    versionHooks: dict[str, dict] = Field(default_factory=dict)
    batchId: str | None = None
    priority: str | None = None


class IdeaPatch(BaseModel):
    title: str | None = None
    topic: str | None = None
    format: str | None = None
    category: str | None = None
    sources: list | None = None
    brief: dict | None = None
    deadline: str | None = None
    batchId: str | None = None
    reviewerId: str | None = None
    dropped: list | None = None
    priority: str | None = None


class Destinations(BaseModel):
    ipIds: list[str]


# How urgent the work is, for whoever picks it up. IMPORTANT is what ordinary assigned
# work is; URGENT and AVERAGE are a decision someone took.
PRIORITIES = ("URGENT", "IMPORTANT", "AVERAGE")
DEFAULT_PRIORITY = "IMPORTANT"


def _priority(value: str | None) -> str:
    if value is None:
        return DEFAULT_PRIORITY
    if value not in PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Priority must be one of {', '.join(PRIORITIES)}.")
    return value


@router.post("")
async def create_idea(body: NewIdea, caller: Caller = Depends(current_caller)):
    if body.stream not in STREAMS:
        raise HTTPException(status_code=400, detail=f"Unknown stream: {body.stream}")
    if body.format not in FORMATS:
        raise HTTPException(status_code=400, detail=f"Unknown format: {body.format}")
    require(caller.access, area_for(body.stream), "edit")
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="An idea needs a title.")

    row = {
        "stream": body.stream,
        "title": title,
        "topic": body.topic or " ".join(title.split()[:4]).lower(),
        "format": body.format,
        "category": body.category,
        "creator_id": caller.id,
        "sources": body.sources,
        "brief": body.brief,
        "destinations": body.destinations,
        # HPN moves too fast for an approval gate; BO waits for one.
        "approval_state": "not_required" if body.stream == "HPN" else "pending",
        "batch_id": body.batchId,
    }
    # Only sent when it is not the default, so creating an ordinary idea never mentions
    # the column. That keeps the one flow the whole app depends on working against a
    # database where the priority migration has not been run yet.
    priority = _priority(body.priority)
    if priority != DEFAULT_PRIORITY:
        row["priority"] = priority

    idea = None
    for _ in range(5):
        row["code"] = await events.next_idea_code(body.stream)
        try:
            idea = await db.insert("ideas", row)
            break
        except HTTPException as exc:
            if not events.is_duplicate(exc):
                raise
    if idea is None:
        raise HTTPException(status_code=409, detail="Couldn't allocate an idea code — try again.")

    # The insert returns the rows, and the activity entry is nobody's blocker — so do
    # both together and answer from what we already have. A PostgREST round trip costs
    # ~150ms whatever it carries, so each one skipped is 150ms off the click.
    versions: list[dict] = []
    if body.destinations:
        hooks = body.versionHooks or {}
        versions, _ = await asyncio.gather(
            db.insert("versions", [{
                "idea_id": idea["id"], "ip_id": ip_id,
                "hook_override": (hooks.get(ip_id) or {}).get("hookOverride", ""),
                "sub_hook": (hooks.get(ip_id) or {}).get("subHook", ""),
                "caption": body.brief.get("defaultCaption", "") if body.brief else "",
            } for ip_id in body.destinations]),
            events.log(idea["id"], "created", f"Idea created by {caller.person['name']}", caller.id),
        )
    else:
        await events.log(idea["id"], "created", f"Idea created by {caller.person['name']}", caller.id)

    return {"idea": shape.to_idea(idea), "versions": [shape.to_version(v) for v in versions]}


@router.patch("/{idea_id}")
async def update_idea(idea_id: str, patch: IdeaPatch, caller: Caller = Depends(current_caller)):
    idea = await get_idea(idea_id)
    require(caller.access, area_for(idea["stream"]), "edit")
    body = patch.model_dump(exclude_unset=True)
    # The column has a check constraint, so a bad value would come back as a database
    # error. Refusing it here says which values are allowed.
    if "priority" in body:
        body["priority"] = _priority(body["priority"])
    cols = shape.from_idea(body)
    if cols:
        await db.update("ideas", {"id": f"eq.{idea_id}"}, cols)
    return await idea_payload(idea_id)


@router.put("/{idea_id}/destinations")
async def set_destinations(idea_id: str, body: Destinations, caller: Caller = Depends(current_caller)):
    """Adding an IP creates its version. Removing one only drops the destination:
    the version keeps its assets and history in case it comes back."""
    idea = await get_idea(idea_id)
    require(caller.access, area_for(idea["stream"]), "edit")
    existing = await db.select("versions", {"idea_id": f"eq.{idea_id}", "select": "ip_id"})
    have = {v["ip_id"] for v in existing}
    fresh = [ip for ip in body.ipIds if ip not in have]
    if fresh:
        await db.insert("versions", [{"idea_id": idea_id, "ip_id": ip} for ip in fresh])
        for ip in fresh:
            await events.log(idea_id, "destination_added", f"Destination added: {await ip_code(ip)}", caller.id)
    await db.update("ideas", {"id": f"eq.{idea_id}"}, {"destinations": body.ipIds})
    return await idea_payload(idea_id)


@router.delete("/{idea_id}")
async def delete_idea(idea_id: str, caller: Caller = Depends(current_caller)):
    """Delete an idea and everything hanging off it.

    Versions, placements, comments, activity and notifications all cascade from the
    idea. Publications don't — they're their own record — so any left with nothing
    attached go too, and their snapshots with them; a publication of nothing is not a
    thing anyone can act on.

    This is for mistakes: a duplicate, a typo, a test. An idea that has been published
    is real history, so the caller is told what they're about to lose and has to say
    yes to it.
    """
    idea = await get_idea(idea_id)
    require(caller.access, area_for(idea["stream"]), "edit")

    versions = await db.select("versions", {"idea_id": f"eq.{idea_id}", "select": "id"})
    version_ids = [v["id"] for v in versions]
    pub_ids: set[str] = set()
    if version_ids:
        links = await db.select("publication_versions", {
            "version_id": f"in.({','.join(version_ids)})", "select": "publication_id"})
        pub_ids = {l["publication_id"] for l in links}

    await db.delete("ideas", {"id": f"eq.{idea_id}"})   # versions, comments, activity cascade

    # Publications whose last version just went with the idea.
    orphaned = 0
    for pub_id in pub_ids:
        remaining = await db.select("publication_versions", {
            "publication_id": f"eq.{pub_id}", "select": "version_id", "limit": 1})
        if not remaining:
            await db.delete("publications", {"id": f"eq.{pub_id}"})   # snapshot cascades
            orphaned += 1

    return {"ok": True, "deleted": idea_id, "versions": len(version_ids), "publications": orphaned}


@router.post("/{idea_id}/approve")
async def approve_idea(idea_id: str, caller: Caller = Depends(current_caller)):
    idea = await get_idea(idea_id)
    require(caller.access, area_for(idea["stream"]), "edit")
    if idea.get("approval_state") == "approved":
        return await idea_payload(idea_id)
    patch = {"approval_state": "approved", "approved_by": caller.id, "approved_at": events.now_iso()}
    # Only clear the note when there is one to clear. Approving an idea nobody rejected
    # must not reference `decision_note` at all, so this route keeps working on a
    # database where the rejection migration has not been run yet.
    if idea.get("approval_state") == "rejected":
        patch["decision_note"] = None
    await db.update("ideas", {"id": f"eq.{idea_id}"}, patch)
    await events.log(idea_id, "approved", f"Idea approved by {caller.person['name']}", caller.id)
    if idea.get("creator_id") and idea["creator_id"] != caller.id:
        await events.notify(idea["creator_id"], "idea_approved", f"Approved: {idea['title']}", idea_id=idea_id)
    return await idea_payload(idea_id)


class Rejection(BaseModel):
    reason: str | None = None


@router.post("/{idea_id}/reject")
async def reject_idea(idea_id: str, body: Rejection, caller: Caller = Depends(current_caller)):
    """Turn an idea down, with a reason.

    Approve was the only answer the system had, so a reviewer who did not want an idea
    either approved it anyway or left it in the pending list and said nothing — and
    whoever raised it had no way to tell "not yet looked at" from "no". A rejection is
    recorded like an approval and the reason goes back to the person who raised it.

    Reversible on purpose: approving a rejected idea moves it straight to approved, so
    a rethink does not mean raising the idea again from scratch.
    """
    idea = await get_idea(idea_id)
    require(caller.access, area_for(idea["stream"]), "edit")
    if idea.get("approval_state") == "rejected":
        return await idea_payload(idea_id)
    reason = (body.reason or "").strip()
    await db.update("ideas", {"id": f"eq.{idea_id}"}, {
        "approval_state": "rejected", "approved_by": caller.id,
        "approved_at": events.now_iso(), "decision_note": reason or None,
    })
    await events.log(idea_id, "rejected",
                     f"Idea rejected by {caller.person['name']}" + (f" — {reason}" if reason else ""),
                     caller.id)
    if idea.get("creator_id") and idea["creator_id"] != caller.id:
        await events.notify(idea["creator_id"], "idea_rejected",
                            f"Rejected: {idea['title']}" + (f" — {reason}" if reason else ""),
                            idea_id=idea_id)
    return await idea_payload(idea_id)


# ───────────────────────── versions ─────────────────────────

class VersionPatch(BaseModel):
    hookOverride: str | None = None
    subHook: str | None = None
    bodyText: str | None = None
    caption: str | None = None
    notesOverride: str | None = None


class Link(BaseModel):
    type: str
    url: str
    label: str | None = None


class LinkPatch(BaseModel):
    type: str | None = None
    url: str | None = None
    label: str | None = None


async def _version_area(version: dict) -> str:
    idea = await get_idea(version["idea_id"])
    return area_for(idea["stream"])


@versions_router.patch("/{version_id}")
async def update_version(version_id: str, patch: VersionPatch, caller: Caller = Depends(current_caller)):
    v = await get_version(version_id)
    # Editors and Designers live in Production and must be able to write copy.
    if not caller.can("production", "edit"):
        require(caller.access, await _version_area(v), "edit")
    cols = shape.from_version(patch.model_dump(exclude_unset=True))
    if cols:
        await db.update("versions", {"id": f"eq.{version_id}"}, cols)
    return shape.to_version(await get_version(version_id))


@versions_router.post("/{version_id}/links")
async def add_link(version_id: str, body: Link, caller: Caller = Depends(current_caller)):
    v = await get_version(version_id)
    if not caller.can("production", "edit"):
        require(caller.access, await _version_area(v), "edit")
    require_asset_link(body.url)
    links = v.get("asset_links") or []
    if any(l.get("url") == body.url for l in links):
        return shape.to_version(v)
    links.append({"id": f"lnk-{uuid4().hex[:8]}",
                  "type": body.type, "url": body.url, "label": body.label or ""})
    patch = {"asset_links": links}
    # First asset is what turns a version from an intention into work in progress.
    if v.get("review_status") == "not_started":
        patch["review_status"] = "in_production"
    await db.update("versions", {"id": f"eq.{version_id}"}, patch)
    await events.log(v["idea_id"], "link_added", f"{body.type} link added", caller.id)
    return shape.to_version(await get_version(version_id))


@versions_router.patch("/{version_id}/links/{link_id}")
async def update_link(version_id: str, link_id: str, body: LinkPatch, caller: Caller = Depends(current_caller)):
    v = await get_version(version_id)
    if not caller.can("production", "edit"):
        require(caller.access, await _version_area(v), "edit")
    links = v.get("asset_links") or []
    target = next((l for l in links if l.get("id") == link_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Link not found")
    target.update({k: val for k, val in body.model_dump(exclude_unset=True).items() if val is not None})
    await db.update("versions", {"id": f"eq.{version_id}"}, {"asset_links": links})
    return shape.to_version(await get_version(version_id))


@versions_router.delete("/{version_id}/links/{link_id}")
async def remove_link(version_id: str, link_id: str, caller: Caller = Depends(current_caller)):
    v = await get_version(version_id)
    if not caller.can("production", "edit"):
        require(caller.access, await _version_area(v), "edit")
    links = [l for l in (v.get("asset_links") or []) if l.get("id") != link_id]
    await db.update("versions", {"id": f"eq.{version_id}"}, {"asset_links": links})
    return shape.to_version(await get_version(version_id))


# ───────────────────────── batches ─────────────────────────

class NewBatch(BaseModel):
    name: str
    stream: str = "BO"
    deadline: str | None = None
    reviewerId: str | None = None


class BatchPatch(BaseModel):
    name: str | None = None
    deadline: str | None = None
    reviewerId: str | None = None


@batches_router.post("")
async def create_batch(body: NewBatch, caller: Caller = Depends(current_caller)):
    require(caller.access, area_for(body.stream), "edit")
    batch = await db.insert("batches", {
        "name": body.name.strip(), "stream": body.stream,
        "deadline": body.deadline, "reviewer_id": body.reviewerId,
    })
    return shape.to_batch(batch, [])


@batches_router.patch("/{batch_id}")
async def update_batch(batch_id: str, patch: BatchPatch, caller: Caller = Depends(current_caller)):
    batch = await db.select_one("batches", {"id": f"eq.{batch_id}", "select": "*"})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    require(caller.access, area_for(batch.get("stream") or "BO"), "edit")
    cols = shape.from_batch(patch.model_dump(exclude_unset=True))
    if cols:
        batch = (await db.update("batches", {"id": f"eq.{batch_id}"}, cols))[0]
    ideas = await db.select("ideas", {"batch_id": f"eq.{batch_id}", "select": "id"})
    return shape.to_batch(batch, [i["id"] for i in ideas])


@batches_router.delete("/{batch_id}")
async def delete_batch(batch_id: str, caller: Caller = Depends(current_caller)):
    """Remove a batch. The ideas in it survive — the schema sets their batch_id to null
    on delete, because a batch is a way of grouping work, not the work itself."""
    batch = await db.select_one("batches", {"id": f"eq.{batch_id}", "select": "*"})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    require(caller.access, area_for(batch.get("stream") or "BO"), "edit")
    freed = await db.select("ideas", {"batch_id": f"eq.{batch_id}", "select": "id"})
    await db.delete("batches", {"id": f"eq.{batch_id}"})
    return {"ok": True, "deleted": batch_id, "ideasFreed": len(freed)}


@batches_router.post("/{batch_id}/approve")
async def approve_batch(batch_id: str, caller: Caller = Depends(current_caller)):
    """Approve every pending idea in the batch in one go — the BO review ritual."""
    batch = await db.select_one("batches", {"id": f"eq.{batch_id}", "select": "*"})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    require(caller.access, area_for(batch.get("stream") or "BO"), "edit")
    rows = await db.update(
        "ideas",
        {"batch_id": f"eq.{batch_id}", "approval_state": "eq.pending"},
        {"approval_state": "approved", "approved_by": caller.id, "approved_at": events.now_iso()},
    )
    for idea in rows:
        await events.log(idea["id"], "approved", f"Idea approved by {caller.person['name']} (batch)", caller.id)
    return {"approved": [r["id"] for r in rows]}


# ───────────────────────── categories ─────────────────────────

class NewCategory(BaseModel):
    name: str
    stream: str
    format: str = "Carousel"


@categories_router.post("")
async def create_category(body: NewCategory, caller: Caller = Depends(current_caller)):
    require(caller.access, "settings", "edit")
    if body.stream not in STREAMS:
        raise HTTPException(status_code=400, detail=f"Unknown stream: {body.stream}")
    if body.format not in FORMATS:
        raise HTTPException(status_code=400, detail=f"Unknown format: {body.format}")
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="A category needs a name.")
    return shape.to_category(await db.insert(
        "categories",
        {"name": name, "stream": body.stream, "format": body.format},
        upsert_on="name,stream,format"))


@categories_router.delete("/{category_id}")
async def delete_category(category_id: str, caller: Caller = Depends(current_caller)):
    require(caller.access, "settings", "edit")
    await db.delete("categories", {"id": f"eq.{category_id}"})
    return {"ok": True}
