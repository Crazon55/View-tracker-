"""Performance: the 24-hour view capture.

Two rules the schema and this router exist to protect:

* **missing is not zero.** `views` stays NULL until someone actually records a number,
  so an uncaptured post never drags an average down.
* **a late capture tells the truth.** `age_hours` is measured from publication, not
  assumed to be 24, so a number taken three days later is visibly a three-day number.
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import db, shape
from ..access import require
from ..auth import Caller, current_caller

router = APIRouter(prefix="/api/performance", tags=["performance"])


class Capture(BaseModel):
    views: int | None = None      # null clears a capture back to "missing"
    measuredAt: str


def _parse(ts: str) -> datetime:
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Not a timestamp: {ts}") from exc


@router.post("/publications/{publication_id}/capture")
async def capture(publication_id: str, body: Capture, caller: Caller = Depends(current_caller)):
    require(caller.access, "performance", "edit")
    pub = await db.select_one("publications", {"id": f"eq.{publication_id}", "select": "*"})
    if not pub:
        raise HTTPException(status_code=404, detail="Publication not found")
    if body.views is not None and body.views < 0:
        raise HTTPException(status_code=400, detail="Views can't be negative.")

    published = _parse(pub["published_at"])
    measured = _parse(body.measuredAt)
    age = round((measured - published).total_seconds() / 3600)

    row = {
        "publication_id": publication_id,
        "views": body.views,
        "measured_at": body.measuredAt if body.views is not None else None,
        "age_hours": age if body.views is not None else None,
        "recorded_by": caller.id,
    }
    existing = await db.select_one("snapshots", {"publication_id": f"eq.{publication_id}", "select": "id,due_at"})
    if existing:
        rows = await db.update("snapshots", {"id": f"eq.{existing['id']}"}, row)
        snap = rows[0]
    else:
        snap = await db.insert("snapshots", {**row, "due_at": (published + timedelta(hours=24)).isoformat()})
    return shape.to_snapshot(snap)


@router.get("/due")
async def due(caller: Caller = Depends(current_caller)):
    """Captures still owed, oldest first — what the Capture tab is built from."""
    require(caller.access, "performance", "view")
    rows = await db.select("snapshots", {"select": "*", "views": "is.null", "order": "due_at"})
    return {"due": [shape.to_snapshot(s) for s in rows]}
