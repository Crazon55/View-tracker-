"""Performance: the 24-hour view capture.

Two rules the schema and this router exist to protect:

* **missing is not zero.** `views` stays NULL until someone actually records a number,
  so an uncaptured post never drags an average down.
* **a late capture tells the truth.** `age_hours` is measured from publication, not
  assumed to be 24, so a number taken three days later is visibly a three-day number.
"""
import re
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import db, shape
from ..access import require
from ..auth import Caller, current_caller
from ..config import APIFY_POST_ACTOR, APIFY_REEL_ACTOR, APIFY_TOKEN
from .ideas import get_idea

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

    return shape.to_snapshot(await _write_snapshot(pub, body.views, body.measuredAt, caller.id))


async def _write_snapshot(pub: dict, views: int | None, measured_at: str, recorded_by: str) -> dict:
    """Record (or clear) the number for one publication. One snapshot per publication."""
    published = _parse(pub["published_at"])
    measured = _parse(measured_at)
    age = round((measured - published).total_seconds() / 3600)

    row = {
        "publication_id": pub["id"],
        "views": views,
        "measured_at": measured_at if views is not None else None,
        "age_hours": age if views is not None else None,
        "recorded_by": recorded_by,
    }
    existing = await db.select_one("snapshots", {"publication_id": f"eq.{pub['id']}", "select": "id,due_at"})
    if existing:
        rows = await db.update("snapshots", {"id": f"eq.{existing['id']}"}, row)
        return rows[0]
    return await db.insert("snapshots", {**row, "due_at": (published + timedelta(hours=24)).isoformat()})


# ── scraping ─────────────────────────────────────────────────────────────────

# /reel/<code>, /reels/<code>, /p/<code>, /tv/<code>, with or without a profile name in
# front. Share links carry tracking parameters (?utm_source=…) that the scraper does not
# need, so the post is rebuilt from its code.
_POST_URL = re.compile(r"instagram\.com/(?:[\w.]+/)?(reel|reels|p|tv)/([\w-]+)", re.I)


def _post_ref(url: str | None) -> tuple[str, str] | None:
    m = _POST_URL.search(url or "")
    if not m:
        return None
    kind = "reel" if m.group(1).lower() in ("reel", "reels") else m.group(1).lower()
    return m.group(2), f"https://www.instagram.com/{kind}/{m.group(2)}/"


async def _run_actor(actor: str, urls: list[str]) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(
                f"https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items",
                headers={"Authorization": f"Bearer {APIFY_TOKEN}"},
                json={"username": urls, "resultsLimit": 1},
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Apify took too long. Try again in a minute.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Couldn't reach Apify.") from exc
    if resp.status_code in (401, 403):
        raise HTTPException(status_code=502, detail="Apify refused the token — check FSOS_APIFY_TOKEN.")
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Apify returned {resp.status_code}.")
    data = resp.json()
    return data if isinstance(data, list) else []


@router.post("/ideas/{idea_id}/scrape")
async def scrape_idea(idea_id: str, caller: Caller = Depends(current_caller)):
    """Pull the live numbers for every published page of an idea from Instagram.

    A reel is measured in views, a carousel or static in likes — the number lands in the
    same snapshot a person would have typed in. A post Apify returns nothing for is
    reported and left untouched: missing is not zero.
    """
    require(caller.access, "performance", "edit")
    if not APIFY_TOKEN:
        raise HTTPException(status_code=503, detail="Scraping isn't set up yet — FSOS_APIFY_TOKEN is missing on the server.")
    idea = await get_idea(idea_id)
    is_reel = idea["format"] == "Reel"
    metric = "views" if is_reel else "likes"

    versions = await db.select("versions", {"idea_id": f"eq.{idea_id}", "select": "id"})
    if not versions:
        raise HTTPException(status_code=400, detail="This idea has no pages.")
    ids = ",".join(v["id"] for v in versions)
    links = await db.select("publication_versions", {"version_id": f"in.({ids})", "select": "publication_id"})
    pub_ids = sorted({link["publication_id"] for link in links})
    if not pub_ids:
        raise HTTPException(status_code=400, detail="Nothing is published yet — add a live link first.")
    pubs = await db.select("publications", {"id": f"in.({','.join(pub_ids)})", "select": "*"})

    results, wanted = [], {}      # wanted: shortcode -> (publication, clean url)
    for pub in pubs:
        ref = _post_ref(pub.get("url"))
        if not ref:
            results.append({"publicationId": pub["id"], "url": pub.get("url"), "ok": False, "reason": "Not an Instagram post link."})
        else:
            wanted[ref[0]] = (pub, ref[1])
    if not wanted:
        return {"metric": metric, "results": results, "snapshots": []}

    items = await _run_actor(APIFY_REEL_ACTOR if is_reel else APIFY_POST_ACTOR, [u for _, u in wanted.values()])
    by_code = {it.get("shortCode"): it for it in items if isinstance(it, dict)}

    now = datetime.now(timezone.utc).isoformat()
    snapshots = []
    for code, (pub, url) in wanted.items():
        item = by_code.get(code)
        value = None
        if item:
            if is_reel:
                raw = item.get("videoPlayCount") if item.get("videoPlayCount") is not None else item.get("videoViewCount")
            else:
                raw = item.get("likesCount")
            value = raw if isinstance(raw, int) and raw >= 0 else None
        if value is None:
            reason = "Instagram didn't return a view count." if is_reel else "Instagram didn't return it (private, deleted, or hidden likes)."
            results.append({"publicationId": pub["id"], "url": url, "ok": False, "reason": reason})
            continue
        snapshots.append(shape.to_snapshot(await _write_snapshot(pub, value, now, caller.id)))
        results.append({"publicationId": pub["id"], "url": url, "ok": True, "value": value})
    return {"metric": metric, "results": results, "snapshots": snapshots}


@router.get("/due")
async def due(caller: Caller = Depends(current_caller)):
    """Captures still owed, oldest first — what the Capture tab is built from."""
    require(caller.access, "performance", "view")
    rows = await db.select("snapshots", {"select": "*", "views": "is.null", "order": "due_at"})
    return {"due": [shape.to_snapshot(s) for s in rows]}
