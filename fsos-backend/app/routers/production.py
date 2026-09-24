"""Production: one owner per idea, assets, and the review round-trip.

The rule the whole area is built on is that an idea has exactly one production owner —
never one owner per version — so reassignment pushes the old owner onto `previous_owners`
rather than overwriting history. Review happens per version, because a hook that works
for one IP can fail for another.
"""
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db, events, shape
from ..access import require
from ..links import require_asset_link
from ..auth import Caller, current_caller
from .ideas import get_idea, get_version, idea_payload

router = APIRouter(prefix="/api/production", tags=["production"])

# Statuses a submission may move out of: work that exists but isn't with a reviewer.
SUBMITTABLE = ("not_started", "in_production", "changes_requested")


class Assignment(BaseModel):
    ideaIds: list[str]
    ownerId: str
    deadline: str | None = None
    # HPN is due at a time today, not on a date. Sent alongside the date rather than
    # instead of it, so everything that already reads `deadline` keeps working.
    deadlineTime: str | None = None
    reviewerId: str | None = None


class Link(BaseModel):
    versionId: str | None = None
    type: str = "asset"
    url: str
    label: str | None = None


class Submit(BaseModel):
    extraLink: Link | None = None


class SubmitIdea(BaseModel):
    extraLinks: list[Link] = Field(default_factory=list)


class ReviewRequest(BaseModel):
    reviewerId: str | None = None


class Changes(BaseModel):
    note: str | None = None


class Replace(BaseModel):
    link: Link | None = None


async def person_name(person_id: str | None) -> str:
    if not person_id:
        return "someone"
    p = await db.select_one("people", {"id": f"eq.{person_id}", "select": "name"})
    return (p or {}).get("name") or "someone"


async def _attach(version: dict, link: Link, actor_id: str) -> dict:
    """Add an asset link, and move an untouched version into production."""
    links = version.get("asset_links") or []
    if not link.url.strip():
        return version
    require_asset_link(link.url)
    if any(l.get("url") == link.url for l in links):
        return version
    links.append({"id": f"lnk-{uuid4().hex[:8]}",
                  "type": link.type, "url": link.url, "label": link.label or ""})
    patch = {"asset_links": links}
    if version.get("review_status") == "not_started":
        patch["review_status"] = "in_production"
    rows = await db.update("versions", {"id": f"eq.{version['id']}"}, patch)
    await events.log(version["idea_id"], "link_added", f"{link.type} link added", actor_id)
    return rows[0] if rows else {**version, **patch}


@router.post("/assign")
async def assign(body: Assignment, caller: Caller = Depends(current_caller)):
    """Assign (or reassign) production on one or more ideas."""
    require(caller.access, "production", "edit")
    owner = await person_name(body.ownerId)
    touched = []
    for idea_id in body.ideaIds:
        idea = await get_idea(idea_id)
        patch = {"production_owner_id": body.ownerId}
        # An idea only ever has one owner; the outgoing one is kept, not overwritten.
        if idea.get("production_owner_id") and idea["production_owner_id"] != body.ownerId:
            patch["previous_owners"] = (idea.get("previous_owners") or []) + [
                {"ownerId": idea["production_owner_id"], "until": events.now_iso()}]
        if body.deadline:
            patch["deadline"] = body.deadline
        if body.deadlineTime is not None:
            patch["deadline_time"] = body.deadlineTime or None
        if body.reviewerId:
            patch["reviewer_id"] = body.reviewerId
        await db.update("ideas", {"id": f"eq.{idea_id}"}, patch)
        await db.update("versions",
                        {"idea_id": f"eq.{idea_id}", "review_status": "eq.not_started"},
                        {"review_status": "in_production"})
        await events.log(idea_id, "assigned",
                         f"Assigned to {owner}" + (f", due {body.deadline}" if body.deadline else ""), caller.id)
        touched.append(idea_id)

    if body.ownerId != caller.id and touched:
        await events.notify(body.ownerId, "assigned",
                            f"{len(touched)} idea{'' if len(touched) == 1 else 's'} assigned to you",
                            idea_id=touched[0])
    return {"ideas": [await idea_payload(i) for i in touched]}


@router.post("/versions/{version_id}/submit")
async def submit_version(version_id: str, body: Submit, caller: Caller = Depends(current_caller)):
    """Send one version to its reviewer. Nothing goes to review without an asset."""
    require(caller.access, "production", "edit")
    v = await get_version(version_id)
    if body.extraLink:
        v = await _attach(v, body.extraLink, caller.id)
    if not (v.get("asset_links") or []):
        raise HTTPException(status_code=400, detail="Add a deliverable link before submitting for review.")
    await db.update("versions", {"id": f"eq.{version_id}"}, {"review_status": "awaiting_review"})
    await events.log(v["idea_id"], "submitted", "Version submitted for review", caller.id)
    idea = await get_idea(v["idea_id"])
    if idea.get("reviewer_id"):
        await events.notify(idea["reviewer_id"], "review_request",
                            f"Review requested: {idea['title']}", idea_id=idea["id"])
    return await idea_payload(v["idea_id"])


@router.post("/ideas/{idea_id}/submit")
async def submit_idea(idea_id: str, body: SubmitIdea, caller: Caller = Depends(current_caller)):
    """Submit every version of an idea that has work on it — the usual case."""
    require(caller.access, "production", "edit")
    await get_idea(idea_id)
    for link in body.extraLinks:
        if link.versionId:
            await _attach(await get_version(link.versionId), link, caller.id)

    versions = await db.select("versions", {"idea_id": f"eq.{idea_id}", "select": "*"})
    ready = [v for v in versions if v.get("review_status") in SUBMITTABLE and (v.get("asset_links") or [])]
    for v in ready:
        await db.update("versions", {"id": f"eq.{v['id']}"}, {"review_status": "awaiting_review"})
    if ready:
        await events.log(idea_id, "submitted",
                         f"{len(ready)} version{'' if len(ready) == 1 else 's'} submitted for review", caller.id)
        idea = await get_idea(idea_id)
        if idea.get("reviewer_id"):
            await events.notify(idea["reviewer_id"], "review_request",
                                f"Review requested: {idea['title']}", idea_id=idea_id)
    return await idea_payload(idea_id)


@router.post("/ideas/{idea_id}/request-review")
async def request_review(idea_id: str, body: ReviewRequest, caller: Caller = Depends(current_caller)):
    require(caller.access, "production", "edit")
    idea = await get_idea(idea_id)
    if body.reviewerId:
        await db.update("ideas", {"id": f"eq.{idea_id}"}, {"reviewer_id": body.reviewerId})
    reviewer = body.reviewerId or idea.get("reviewer_id")
    await events.log(idea_id, "review_requested", f"Review requested from {await person_name(reviewer)}", caller.id)
    await events.notify(reviewer, "review_request", f"Review requested: {idea['title']}", idea_id=idea_id)
    return await idea_payload(idea_id)


@router.post("/versions/{version_id}/approve")
async def approve_version(version_id: str, caller: Caller = Depends(current_caller)):
    require(caller.access, "production", "edit")
    v = await get_version(version_id)
    await db.update("versions", {"id": f"eq.{version_id}"}, {"review_status": "ready"})
    await events.log(v["idea_id"], "version_approved", "Version approved (Ready)", caller.id)
    idea = await get_idea(v["idea_id"])
    if idea.get("production_owner_id") and idea["production_owner_id"] != caller.id:
        await events.notify(idea["production_owner_id"], "version_approved",
                            f"Approved: {idea['title']}", idea_id=idea["id"])
    return await idea_payload(v["idea_id"])


@router.post("/versions/{version_id}/request-changes")
async def request_changes(version_id: str, body: Changes, caller: Caller = Depends(current_caller)):
    """Changes come with a comment — a rejection with no reason is a dead end."""
    require(caller.access, "production", "edit")
    v = await get_version(version_id)
    await db.update("versions", {"id": f"eq.{version_id}"}, {"review_status": "changes_requested"})
    await db.insert("comments", {
        "idea_id": v["idea_id"], "version_id": version_id, "anchor": {"type": "asset"},
        "body": (body.note or "").strip() or "Changes requested.", "author_id": caller.id,
    })
    await events.log(v["idea_id"], "changes_requested", "Changes requested", caller.id)
    idea = await get_idea(v["idea_id"])
    if idea.get("production_owner_id") and idea["production_owner_id"] != caller.id:
        await events.notify(idea["production_owner_id"], "changes_requested",
                            f"Changes requested: {idea['title']}", idea_id=idea["id"])
    return await idea_payload(v["idea_id"])


@router.post("/versions/{version_id}/replace-asset")
async def replace_asset(version_id: str, body: Replace, caller: Caller = Depends(current_caller)):
    """Replacing an approved asset sends it back to review — approval was of the old file."""
    require(caller.access, "production", "edit")
    v = await get_version(version_id)
    superseded = v.get("asset_links") or []
    note = "Asset replaced — returned to review"
    patch = {}

    if body.link and body.link.url.strip():
        require_asset_link(body.link.url)
        # Replace, not append. It appended before, which left a reviewer looking at two
        # links with nothing to say which one to open. The old ones aren't lost — they
        # go into the revision history, which is what that history is for.
        patch["asset_links"] = [{
            "id": f"lnk-{uuid4().hex[:8]}", "type": body.link.type,
            "url": body.link.url, "label": body.link.label or "",
        }]
        if superseded:
            note = f"Replaced {len(superseded)} link{'' if len(superseded) == 1 else 's'} — returned to review"

    patch["revisions"] = (v.get("revisions") or []) + [{
        "id": f"rev-{uuid4().hex[:8]}", "at": events.now_iso(), "by": caller.id,
        "note": note,
        "replaced": [{"type": l.get("type"), "url": l.get("url")} for l in superseded],
    }]
    # An approved asset going back for review is the point; a rejected one becoming
    # workable again matters just as much, or it sits in changes_requested forever.
    if v.get("review_status") in ("ready", "changes_requested"):
        patch["review_status"] = "awaiting_review"
    await db.update("versions", {"id": f"eq.{version_id}"}, patch)
    await events.log(v["idea_id"], "asset_replaced", note, caller.id)

    idea = await get_idea(v["idea_id"])
    if idea.get("reviewer_id") and idea["reviewer_id"] != caller.id:
        await events.notify(idea["reviewer_id"], "review_request",
                            f"New version to review: {idea['title']}", idea_id=idea["id"])
    return await idea_payload(v["idea_id"])
