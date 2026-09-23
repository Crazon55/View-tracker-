"""News Feed: stories in, votes and bookmarks out.

Two sources, both fetched server-side so the feed works on a deployed build rather than
only under the dev server:

* `news_articles`, filled by the `fetch-news` Supabase edge function on a daily schedule;
* Inshorts, which publishes no API and no CORS headers — its pages embed the feed as
  `window.__STATE__`, so we read it here instead of through a browser proxy.

Each source fails on its own. A dead Inshorts must not empty the feed.
"""
import asyncio
import json
import re
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..access import require
from ..auth import Caller, current_caller

router = APIRouter(prefix="/api/news", tags=["news"])

INSHORTS_CATEGORIES = ("startup", "business", "technology")
_STATE_RE = re.compile(r"window\.__STATE__\s*=\s*(\{.*?\})\s*;\s*</script>", re.S)

SOURCE_LABELS = {
    "inc42.com": "Inc42", "yourstory.com": "YourStory", "entrackr.com": "Entrackr",
    "moneycontrol.com": "Moneycontrol", "economictimes.indiatimes.com": "Economic Times",
    "firstpost.com": "Firstpost", "business-standard.com": "Business Standard",
    "thehindubusinessline.com": "Hindu BL", "businessinsider.in": "Business Insider",
    "indianstartupnews.com": "Indian Startup News", "fortuneindia.com": "Fortune India",
    "indiatoday.in": "India Today", "indianexpress.com": "Indian Express",
    "livemint.com": "Mint", "techcrunch.com": "TechCrunch", "aajtak.in": "Aaj Tak",
}

_http = httpx.AsyncClient(
    timeout=20.0,
    headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                           "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
             "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9"},
)


def _source_label(url: str, fallback: str | None) -> str:
    try:
        host = httpx.URL(url).host.replace("www.", "")
    except Exception:
        host = ""
    for key, label in SOURCE_LABELS.items():
        if key in host:
            return label
    return SOURCE_LABELS.get(fallback or "", fallback or "News")


async def _articles() -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    rows = await db.select("news_articles", {
        "select": "*", "created_at": f"gte.{cutoff}", "order": "created_at.desc"})
    out = []
    for r in rows:
        url = (r.get("url") or "").strip()
        out.append({
            "id": url or r["id"], "type": "news", "title": r.get("title"),
            "body": r.get("summary") or r.get("body"), "url": url,
            "source": _source_label(url, r.get("source")),
            "publishedAt": r.get("published_date") or r.get("created_at") or "",
        })
    return out


async def _inshorts_category(category: str, seen: set[str]) -> list[dict]:
    r = await _http.get(f"https://inshorts.com/en/read/{category}")
    r.raise_for_status()
    m = _STATE_RE.search(r.text)
    if not m:
        return []
    try:
        state = json.loads(m.group(1))
    except ValueError:
        return []
    out = []
    for entry in (state.get("news_list") or {}).get("list") or []:
        o = entry.get("news_obj") or {}
        hash_id, title = o.get("hash_id"), o.get("title")
        if not hash_id or not title or hash_id in seen:
            continue
        seen.add(hash_id)
        fallback = f"https://inshorts.com/en/news/{o['old_hash_id']}" if o.get("old_hash_id") else (o.get("shortened_url") or "")
        created = o.get("created_at")
        out.append({
            "id": hash_id, "type": "inshorts", "title": title.strip(),
            "body": (o.get("content") or "").strip() or None,
            "url": (o.get("source_url") or "").strip() or fallback,
            "source": f"Inshorts · {o['source_name']}" if o.get("source_name") else "Inshorts",
            "publishedAt": datetime.fromtimestamp(created / 1000, timezone.utc).isoformat()
                           if isinstance(created, (int, float)) and created > 1e12 else "",
            "category": category,
        })
    return out


async def _inshorts() -> list[dict]:
    seen: set[str] = set()
    results = await asyncio.gather(*(_inshorts_category(c, seen) for c in INSHORTS_CATEGORIES),
                                   return_exceptions=True)
    return [item for r in results if not isinstance(r, Exception) for item in r]


@router.get("/feed")
async def feed(caller: Caller = Depends(current_caller)):
    require(caller.access, "news", "view")
    articles, inshorts = await asyncio.gather(_articles(), _inshorts(), return_exceptions=True)
    ok = lambda r: not isinstance(r, Exception)
    items = [i for r in (articles, inshorts) if ok(r) for i in r]
    items.sort(key=lambda i: i.get("publishedAt") or "", reverse=True)
    return {
        "items": items,
        "status": {
            "news": len(articles) if ok(articles) else None,
            "inshorts": len(inshorts) if ok(inshorts) else None,
        },
    }


class Vote(BaseModel):
    id: str                       # the article url / hash used as its id
    vote: str                     # 'yes' | 'no'
    title: str | None = None
    type: str | None = None
    learnedCategory: str | None = None


class Save(BaseModel):
    id: str
    saved: bool
    item: dict = Field(default_factory=dict)


@router.post("/vote")
async def vote(body: Vote, caller: Caller = Depends(current_caller)):
    require(caller.access, "news", "edit")
    if body.vote not in ("yes", "no"):
        raise HTTPException(status_code=400, detail="Vote must be yes or no.")
    await db.insert("news_feedback", {
        "article_url": body.id, "vote": body.vote, "article_title": body.title,
        "article_type": body.type, "voted_by": caller.id,
    }, upsert_on="article_url")
    if body.learnedCategory:
        await db.insert("news_rules", {"category": body.learnedCategory}, upsert_on="category")
    return {"ok": True}


@router.post("/saved")
async def save(body: Save, caller: Caller = Depends(current_caller)):
    require(caller.access, "news", "edit")
    if body.saved:
        await db.insert("news_saved", {
            "article_url": body.id, "article_data": body.item, "saved_by": caller.id,
        }, upsert_on="article_url")
    else:
        await db.delete("news_saved", {"article_url": f"eq.{body.id}"})
    return {"ok": True}


@router.post("/reset-learning")
async def reset_learning(caller: Caller = Depends(current_caller)):
    """Clears votes and the categories learned from them — starts the feed's taste over."""
    require(caller.access, "news", "edit")
    await db.delete("news_feedback", {"article_url": "not.is.null"})
    await db.delete("news_rules", {"category": "not.is.null"})
    return {"ok": True}
