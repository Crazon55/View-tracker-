"""Comments, replies and the notification bell.

Comments anchor to a place in the work — a slide, an asset, a version, or the idea in
general — which is why `anchor` is free-form JSON rather than a column per kind. Replies
are comments with a parent, flattened in the table and nested on the way out.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db, events, shape
from ..access import require
from ..auth import Caller, current_caller
from .ideas import area_for, get_idea

router = APIRouter(prefix="/api/comments", tags=["comments"])
notifications_router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class NewComment(BaseModel):
    ideaId: str
    versionId: str | None = None
    anchor: dict = Field(default_factory=lambda: {"type": "general"})
    text: str


class Reply(BaseModel):
    text: str


class Resolve(BaseModel):
    resolved: bool = True


async def _comment(comment_id: str) -> dict:
    c = await db.select_one("comments", {"id": f"eq.{comment_id}", "select": "*"})
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    return c


async def _with_replies(comment_id: str) -> dict:
    root = await _comment(comment_id)
    replies = await db.select("comments", {"parent_id": f"eq.{comment_id}", "select": "*", "order": "created_at"})
    return shape.to_comment(root, [shape.to_reply(r) for r in replies])


async def _watchers(idea: dict, exclude: str) -> list[str]:
    """People who should hear about a comment: the owner, reviewer and creator."""
    return [p for p in (idea.get("production_owner_id"), idea.get("reviewer_id"), idea.get("creator_id"))
            if p and p != exclude]


@router.post("")
async def add_comment(body: NewComment, caller: Caller = Depends(current_caller)):
    idea = await get_idea(body.ideaId)
    # Anyone who can work on the idea can comment on it — reviewers live in Production.
    if not caller.can("production", "edit"):
        require(caller.access, area_for(idea["stream"]), "edit")
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="A comment needs something in it.")
    c = await db.insert("comments", {
        "idea_id": body.ideaId, "version_id": body.versionId,
        "anchor": body.anchor, "body": text, "author_id": caller.id})
    await events.notify_many(await _watchers(idea, caller.id), "comment",
                             f"{caller.person['name']} commented on {idea['title']}", idea_id=idea["id"])
    return shape.to_comment(c, [])


@router.post("/{comment_id}/replies")
async def reply(comment_id: str, body: Reply, caller: Caller = Depends(current_caller)):
    root = await _comment(comment_id)
    idea = await get_idea(root["idea_id"])
    if not caller.can("production", "edit"):
        require(caller.access, area_for(idea["stream"]), "edit")
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="A reply needs something in it.")
    await db.insert("comments", {
        "idea_id": root["idea_id"], "version_id": root.get("version_id"),
        "parent_id": comment_id, "anchor": root.get("anchor") or {"type": "general"},
        "body": text, "author_id": caller.id})
    if root.get("author_id") and root["author_id"] != caller.id:
        await events.notify(root["author_id"], "comment_reply",
                            f"{caller.person['name']} replied to your comment", idea_id=root["idea_id"])
    return await _with_replies(comment_id)


@router.post("/{comment_id}/resolve")
async def resolve(comment_id: str, body: Resolve, caller: Caller = Depends(current_caller)):
    root = await _comment(comment_id)
    idea = await get_idea(root["idea_id"])
    if not caller.can("production", "edit"):
        require(caller.access, area_for(idea["stream"]), "edit")
    await db.update("comments", {"id": f"eq.{comment_id}"}, {"resolved": body.resolved})
    return await _with_replies(comment_id)


# ───────────────────────── notifications ─────────────────────────

@notifications_router.post("/read")
async def mark_all_read(caller: Caller = Depends(current_caller)):
    """Your own and the team-wide ones — the same set the bell shows."""
    await db.update("notifications", {"person_id": f"eq.{caller.id}", "read": "eq.false"}, {"read": True})
    await db.update("notifications", {"person_id": "is.null", "read": "eq.false"}, {"read": True})
    return {"ok": True}


@notifications_router.post("/{notification_id}/read")
async def mark_read(notification_id: str, caller: Caller = Depends(current_caller)):
    n = await db.select_one("notifications", {"id": f"eq.{notification_id}", "select": "person_id"})
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    if n.get("person_id") not in (None, caller.id):
        raise HTTPException(status_code=403, detail="That isn't your notification.")
    rows = await db.update("notifications", {"id": f"eq.{notification_id}"}, {"read": True})
    return shape.to_notification(rows[0])
