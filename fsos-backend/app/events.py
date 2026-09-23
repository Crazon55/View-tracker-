"""Activity log, notifications, and the idea code counter.

Every mutation that a teammate would want to know about goes through here, so the
Activity tab and the bell are written in one style rather than per-router.
"""
import re
from datetime import datetime, timezone

from fastapi import HTTPException

from . import db


def now_iso() -> str:
    """PostgREST sends JSON, so timestamps must arrive as literals — `now()` would
    be stored as the string, not evaluated."""
    return datetime.now(timezone.utc).isoformat()


async def log(idea_id: str | None, type_: str, text: str, actor_id: str | None) -> dict:
    return await db.insert("activity", {"idea_id": idea_id, "type": type_, "text": text, "actor_id": actor_id})


async def notify(person_id: str | None, type_: str, text: str, *,
                 idea_id: str | None = None, publication_id: str | None = None) -> dict | None:
    """`person_id=None` is a team-wide notice. Never notifies nobody."""
    return await db.insert("notifications", {
        "person_id": person_id, "type": type_, "text": text,
        "idea_id": idea_id, "publication_id": publication_id,
    })


async def notify_many(person_ids, type_: str, text: str, *, idea_id: str | None = None) -> None:
    targets = [p for p in dict.fromkeys(person_ids) if p]
    if not targets:
        return
    await db.insert("notifications", [
        {"person_id": p, "type": type_, "text": text, "idea_id": idea_id} for p in targets
    ])


async def next_idea_code(stream: str) -> str:
    """`BO-001`, `HPN-014`… Derived from the highest code in use for that stream.

    The unique index on `ideas.code` is the real guard: on a collision the caller
    retries, which is why `create_idea` wraps its insert in a small retry loop.
    """
    rows = await db.select("ideas", {"select": "code", "stream": f"eq.{stream}", "order": "code.desc", "limit": 200})
    highest = 0
    for r in rows:
        m = re.fullmatch(rf"{re.escape(stream)}-(\d+)", r.get("code") or "")
        if m:
            highest = max(highest, int(m.group(1)))
    return f"{stream}-{highest + 1:03d}"


def is_duplicate(exc: HTTPException) -> bool:
    return exc.status_code == 409 or "duplicate key" in str(exc.detail).lower()
