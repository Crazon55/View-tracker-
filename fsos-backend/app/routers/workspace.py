"""The whole workspace in one response.

The FSOS frontend keeps a single state object and derives every screen from it with
selectors. That design predates the database, and it earns its keep: one round trip
fills every page, and there is exactly one place where "what the browser knows" is
assembled. Mutations elsewhere return only what they touched; the browser reloads this
when it needs to be certain.

Access: pending people (no roles) get nothing. Otherwise the operational graph goes out
whole — Production can't be rendered without the ideas behind the tasks — while the
areas that stand alone (6-Day, Growth, News) are included only for people who may see
them. Mutations are where access is truly enforced; see each router.
"""
import asyncio
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from .. import db, shape
from ..access import RANK
from ..auth import Caller, current_caller
from .settings import with_defaults

router = APIRouter(prefix="/api", tags=["workspace"])

IST = timezone(timedelta(hours=5, minutes=30))


def today_ist() -> str:
    """Every calendar date in FSOS is an IST date; the server may be anywhere."""
    return datetime.now(IST).date().isoformat()


def _can(caller: Caller, area: str) -> bool:
    return RANK.get(caller.access.get(area, "none"), 0) >= RANK["view"]


async def _core() -> dict:
    """The shared operational graph: organisation, ideas, and everything hanging off them."""
    (people, ips, categories, settings_row, batches, ideas, versions, placements,
     publications, pub_versions, snapshots, comments, activity) = await asyncio.gather(
        db.select("people", {"select": "*", "order": "name"}),
        db.select("ips", {"select": "*", "order": "code"}),
        db.select("categories", {"select": "*", "order": "name"}),
        db.select_one("app_settings", {"select": "settings"}),
        db.select("batches", {"select": "*", "order": "created_at"}),
        db.select("ideas", {"select": "*", "order": "created_at"}),
        # Every list the UI renders needs a deterministic order. Without one, Postgres
        # hands back physical row order, and an UPDATE rewrites the row at the end of
        # the table — so editing a version's copy silently moved its card after the next
        # refresh. Cards jumping around while you work is its own kind of broken.
        db.select("versions", {"select": "*", "order": "created_at,id"}),
        db.select("placements", {"select": "*", "order": "created_at,id"}),
        db.select("publications", {"select": "*", "order": "published_at"}),
        db.select("publication_versions", {"select": "*", "order": "publication_id,version_id"}),
        db.select("snapshots", {"select": "*", "order": "created_at,id"}),
        db.select("comments", {"select": "*", "order": "created_at"}),
        db.select("activity", {"select": "*", "order": "created_at"}),
    )

    ideas_by_batch: dict[str, list[str]] = {}
    for i in ideas:
        if i.get("batch_id"):
            ideas_by_batch.setdefault(i["batch_id"], []).append(i["id"])

    links_by_pub: dict[str, list[dict]] = {}
    for l in pub_versions:
        links_by_pub.setdefault(l["publication_id"], []).append(l)

    # Replies are comments with a parent; the UI wants them nested under the root.
    replies: dict[str, list[dict]] = {}
    for c in comments:
        if c.get("parent_id"):
            replies.setdefault(c["parent_id"], []).append(shape.to_reply(c))

    return {
        "settings": with_defaults((settings_row or {}).get("settings")),
        "users": [shape.to_user(p) for p in people],
        "ips": [shape.to_ip(i) for i in ips],
        "categories": [shape.to_category(c) for c in categories],
        "batches": [shape.to_batch(b, ideas_by_batch.get(b["id"], [])) for b in batches],
        "ideas": [shape.to_idea(i) for i in ideas],
        "versions": [shape.to_version(v) for v in versions],
        "placements": [shape.to_placement(p) for p in placements],
        "publications": [shape.to_publication(p, links_by_pub.get(p["id"], [])) for p in publications],
        "snapshots": [shape.to_snapshot(s) for s in snapshots],
        "comments": [shape.to_comment(c, replies.get(c["id"], [])) for c in comments if not c.get("parent_id")],
        "activity": [shape.to_activity(a) for a in activity],
    }


async def _six_day() -> dict:
    entries, top, actuals, settings_row = await asyncio.gather(
        db.select("six_day_entries", {"select": "*", "order": "month,cycle,ip_id"}),
        db.select("six_day_top_content", {"select": "*", "order": "month,cycle,views.desc"}),
        db.select("six_day_actuals", {"select": "*", "order": "month,ip_id"}),
        db.select_one("app_settings", {"select": "settings"}),
    )
    assignee = with_defaults((settings_row or {}).get("settings")).get("sixDayAssigneeId")
    return {
        "entries": [shape.to_six_day_entry(e) for e in entries],
        "topContent": [shape.to_top_content(t) for t in top],
        "actuals": [shape.to_actual(a) for a in actuals],
        "config": {"assigneeId": assignee},
    }


async def _growth() -> dict:
    rows = await db.select("growth_monthly", {"select": "*", "order": "month,ip_id"})
    return {"followers": [shape.to_growth(r) for r in rows]}


async def _news() -> dict:
    feedback, rules, saved = await asyncio.gather(
        db.select("news_feedback", {"select": "*"}),
        db.select("news_rules", {"select": "category"}),
        db.select("news_saved", {"select": "*"}),
    )
    # `saved` is a list of ids; `savedItems` keeps the whole story so a bookmark
    # survives after the article ages out of the feed.
    return {
        "feedback": {f["article_url"]: f["vote"] for f in feedback},
        "rules": [r["category"] for r in rules],
        "saved": [s["article_url"] for s in saved],
        "savedItems": {s["article_url"]: s["article_data"] for s in saved},
    }


async def _access() -> dict:
    role_rows, person_rows = await asyncio.gather(
        db.select("access_role_overrides", {"select": "role,matrix"}),
        db.select("access_person_overrides", {"select": "person_id,matrix"}),
    )
    return {
        "roles": {r["role"]: r["matrix"] for r in role_rows},
        "people": {p["person_id"]: p["matrix"] for p in person_rows},
    }


@router.get("/workspace")
async def get_workspace(caller: Caller = Depends(current_caller)):
    """Everything the signed-in person is allowed to see, in the shape the UI holds."""
    if not caller.roles:
        raise HTTPException(status_code=403, detail="Your account is waiting for a role.")

    # Every one of these is a separate PostgREST request, and a request costs ~150ms of
    # fixed overhead regardless of how much it returns — a query for one row and a query
    # for every idea both take about 175ms. So the number of round trips is the only
    # thing that matters, and they all go out at once rather than in waves. Doing this
    # in sequence cost about two seconds; in parallel it's one request's worth of time.
    empty_six = {"entries": [], "topContent": [], "actuals": [], "config": {"assigneeId": None}}
    empty_news = {"feedback": {}, "rules": [], "saved": [], "savedItems": {}}

    async def nothing(value):
        return value

    core, access, six, growth, news, notes = await asyncio.gather(
        _core(),
        _access(),
        _six_day() if _can(caller, "six_day") else nothing(empty_six),
        _growth() if _can(caller, "growth") else nothing({"followers": []}),
        _news() if _can(caller, "news") else nothing(empty_news),
        # Notifications are per-person: your own, plus the team-wide ones.
        db.select("notifications", {
            "select": "*", "or": f"(person_id.is.null,person_id.eq.{caller.id})",
            "order": "created_at.desc", "limit": "200",
        }),
    )

    return {
        "meta": {"anchor": today_ist(), "loadedAt": datetime.now(timezone.utc).isoformat(), "source": "api"},
        "actingUserId": caller.id,
        "access": access,
        **core,
        "sixDay": six,
        "growth": growth,
        "newsState": news,
        "notifications": [shape.to_notification(n) for n in notes],
    }
