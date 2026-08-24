"""FastAPI app for Instagram View Tracker."""
import asyncio
import json
import logging
import os
import re
import hashlib
import time
import requests as http_req
from pathlib import Path
from dotenv import load_dotenv
from datetime import datetime, timezone, timedelta

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_ROOT / ".env")

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from app.database.repositories.pages import get_page_repository
from app.database.repositories.posts import get_post_repository
from app.database.repositories.reels import get_reel_repository
from app.database.repositories.dashboard_views import get_dashboard_views_repository
from app.database.repositories.content_strategists import get_cs_repository
from app.database.repositories.ideas import get_idea_repository
from app.database.client import get_supabase_client
from app.schemas.request import (
    PageCreate, PageUpdate, PostCreate, PostUpdate,
    ReelCreate, ReelUpdate, ScrapeRequest,
    CSCreate, CSUpdate, IdeaCreate, IdeaUpdate,
    ChatRequest, ContentEntryCreate, ContentEntryUpdate,
    ExpIdeaCreate, ExpIdeaUpdate, ExpSettingsUpdate,
)
from app.auth import ALLOWED_DOMAIN, is_admin_role, require_admin, require_auth
from app.team_roles import (
    cleanup_team_roles,
    cleanup_content_strategists,
    sanitize_role_string,
    role_contains_deprecated,
    DEPRECATED_ROLES,
)
from app.experiment_playbooks import (
    validate_playbook,
    DEFAULT_PLAYBOOK,
    get_playbook_tables,
    VALID_PLAYBOOKS,
    PLAYBOOK_PAGES,
    exp_root_origin,
    exp_find_deployments,
    exp_enrich_ideas_cross_playbook,
    exp_sum_views,
)
from app.routers.fsi import router as fsi_router
from app.seeding.routes import (
    api as seeding_router,
    init_seeding,
    close_seeding,
    register_seeding_middleware,
)

logger = logging.getLogger(__name__)

# Interactive docs enumerate every route and are off unless explicitly enabled.
# Set ENABLE_API_DOCS=true locally to get /docs back.
_DOCS_ENABLED = os.environ.get("ENABLE_API_DOCS", "false").strip().lower() in {"true", "1", "yes"}

app = FastAPI(
    title="View Tracker",
    version="1.0.0",
    docs_url="/docs" if _DOCS_ENABLED else None,
    redoc_url="/redoc" if _DOCS_ENABLED else None,
    openapi_url="/openapi.json" if _DOCS_ENABLED else None,
)
app.include_router(fsi_router, prefix="/api/v1/fsi")
app.include_router(seeding_router, prefix="/api/seeding")  # merged Seeding backend
register_seeding_middleware(app)

# Set ALLOWED_ORIGINS (comma-separated) for custom domains. It adds to, rather than
# replaces, the regex below — so a custom domain doesn't knock out the Cloud Run URL
# or local dev.
_ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
_CLOUD_RUN_PROJECT = os.environ.get("CLOUD_RUN_PROJECT_NUMBER", "32085867405")
_ORIGIN_REGEX = (
    rf"^https://[a-z0-9-]+-{re.escape(_CLOUD_RUN_PROJECT)}\.[a-z0-9-]+\.run\.app$"
    r"|^http://localhost(:\d+)?$"
    r"|^http://127\.0\.0\.1(:\d+)?$"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_origin_regex=_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# A blocked origin surfaces in the browser as an opaque CORS error, so record the
# effective policy at boot to make it diagnosable from the service logs.
logger.info(
    "CORS: exact_origins=%s regex=%s | API docs enabled=%s",
    _ALLOWED_ORIGINS or "(none)",
    _ORIGIN_REGEX,
    _DOCS_ENABLED,
)


# --- Health (no auth) ---
@app.get("/health")
async def health():
    seeding_status = "unknown"
    try:
        from app.seeding.postgres_db import get_database

        await get_database().ping(timeout_sec=3.0)
        seeding_status = "ok"
    except Exception as exc:
        logger.warning("Health seeding check failed: %s", exc or type(exc).__name__)
        seeding_status = "unavailable"
    return {"status": "ok", "seeding": seeding_status}


@app.on_event("startup")
async def startup_team_cleanup():
    """Remove departed members and deprecated roles from Supabase on deploy."""
    try:
        client = get_supabase_client()
        ur = cleanup_team_roles(client)
        cs = cleanup_content_strategists(client)
        if ur["removed"] or ur["updated"] or cs["removed"]:
            logger.info("Team cleanup on startup: user_roles=%s content_strategists=%s", ur, cs)
    except Exception as exc:
        logger.warning("Team cleanup on startup skipped: %s", exc)


@app.on_event("startup")
async def startup_seeding():
    """Warm the seeding asyncpg pool + storage."""
    try:
        await init_seeding()
    except Exception as exc:
        logger.warning("Seeding init on startup skipped: %s", exc)


@app.on_event("shutdown")
async def shutdown_seeding():
    await close_seeding()


_WORKBOARD_MENTION_SKIP: frozenset[str] = frozenset({"", "tracker", "comp research"})


def _workboard_mention_richness(p: dict) -> int:
    r = 0
    if p.get("role_id"):
        r += 100
    if p.get("email"):
        r += 50
    if p.get("is_content_strategist"):
        r += 10
    r += len((p.get("display") or "").strip())
    return r


def _workboard_dedupe_mention_people(people: list[dict]) -> list[dict]:
    """
    One row per person: prefer roster (role/email). Drop shorter bare names when a
    roster row is clearly the same person (same email, full-name extension, or same first name).
    """
    if not people:
        return []

    def roster_backed(p: dict) -> bool:
        return bool(p.get("role_id") or p.get("email"))

    # One winner per email
    by_email: dict[str, dict] = {}
    rest: list[dict] = []
    for p in people:
        em = (p.get("email") or "").strip().lower()
        if em:
            cur = by_email.get(em)
            if not cur or _workboard_mention_richness(p) > _workboard_mention_richness(cur):
                by_email[em] = p
        else:
            rest.append(p)

    pool: list[dict] = list(by_email.values())

    def dominated_by_pool(p: dict, others: list[dict]) -> bool:
        d = (p.get("display") or "").strip().lower()
        if not d:
            return True
        p_roster = roster_backed(p)
        d_first = d.split()[0] if d.split() else d
        for q in others:
            if q is p:
                continue
            qd = (q.get("display") or "").strip().lower()
            if not qd:
                continue
            q_roster = roster_backed(q)
            if not q_roster:
                continue
            if qd == d or qd.startswith(d + " "):
                if not p_roster or _workboard_mention_richness(q) >= _workboard_mention_richness(p):
                    return True
            q_first = qd.split()[0] if qd.split() else qd
            if d_first == q_first and len(qd) > len(d) and not p_roster:
                return True
        return False

    for p in rest:
        if not dominated_by_pool(p, pool):
            pool.append(p)

    pool.sort(key=lambda x: -_workboard_mention_richness(x))
    kept: list[dict] = []
    for p in pool:
        if dominated_by_pool(p, kept):
            continue
        kept.append(p)

    return kept


def _workboard_mention_list_eligible(p: dict) -> bool:
    """Dropdown only: roster (role or email), or tagged content strategist."""
    return bool(p.get("role_id") or p.get("email") or p.get("is_content_strategist"))


def _workboard_paginate_table(
    client, table: str, cols: str, page_size: int = 1000
) -> list[dict]:
    rows_out: list[dict] = []
    offset = 0
    while True:
        batch = (
            client.table(table)
            .select(cols)
            .range(offset, offset + page_size - 1)
            .execute()
            .data
        ) or []
        rows_out.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows_out


@app.get("/api/v1/workboard/mention-candidates")
async def workboard_mention_candidates():
    """
    People for @mentions (e.g. Tickets): structured rows with optional role_id/email
    from user_roles, plus content strategists. Not a live online list.
    """
    from app.database.client import get_supabase_client

    client = get_supabase_client()
    by_display_lower: dict[str, dict] = {}

    def add_person(display: str, role_id: str | None, email: str | None, source: str) -> None:
        d = (display or "").strip()
        if not d:
            return
        low = d.lower()
        if low in _WORKBOARD_MENTION_SKIP:
            return
        row = {
            "display": d,
            "role_id": role_id,
            "email": email,
            "source": source,
            "is_content_strategist": source == "content_strategist",
        }
        existing = by_display_lower.get(low)
        if existing is None:
            by_display_lower[low] = row
            return
        # Prefer user_roles / roster over bare activity strings
        rank = {"user_roles": 3, "content_strategist": 2, "activity": 1}
        if rank.get(source, 0) > rank.get(existing["source"], 0):
            by_display_lower[low] = row
        elif rank.get(source, 0) == rank.get(existing["source"], 0):
            if role_id and not existing.get("role_id"):
                existing["role_id"] = role_id
            if email and not existing.get("email"):
                existing["email"] = email
            if source == "content_strategist":
                existing["is_content_strategist"] = True

    try:
        for ur in _workboard_paginate_table(client, "user_roles", "name,email,role"):
            name = (ur.get("name") or "").strip()
            email = (ur.get("email") or "").strip() or None
            role_raw = ur.get("role")
            role_id = role_raw.strip() if isinstance(role_raw, str) and role_raw.strip() else None
            disp = name or (email.split("@")[0] if email else "")
            if disp:
                add_person(disp, role_id, email, "user_roles")
    except Exception:
        pass

    try:
        for row in get_cs_repository().get_all() or []:
            n = row.get("name")
            if isinstance(n, str) and n.strip():
                add_person(n.strip(), None, None, "content_strategist")
    except Exception:
        pass

    # Do not merge tracker/content free-text creators — they duplicate roster rows
    # (e.g. "Deepak" vs "Deepak Chandwani") without role/email.

    people: list[dict] = [
        {
            "display": row["display"],
            "role_id": row.get("role_id"),
            "email": row.get("email"),
            "is_content_strategist": bool(row.get("is_content_strategist")),
        }
        for row in by_display_lower.values()
    ]

    people = _workboard_dedupe_mention_people(people)
    people = [p for p in people if _workboard_mention_list_eligible(p)]
    people.sort(key=lambda p: (p["display"] or "").lower())
    return {"success": True, "data": {"people": people}}


def _last_monday() -> str:
    """Get last Monday's date as YYYY-MM-DD."""
    today = datetime.now(timezone.utc).date()
    days_since_monday = today.weekday()  # Monday = 0
    last_mon = today - timedelta(days=days_since_monday)
    return last_mon.isoformat()


def _month_start() -> str:
    """Get first day of current month as YYYY-MM-DD."""
    today = datetime.now(timezone.utc).date()
    return today.replace(day=1).isoformat()


def _dashboard_range() -> tuple[str, str]:
    """Return (start, end) for the dashboard reach period.
    On the 1st of the month show the full previous month so the number isn't zero.
    From the 2nd onwards show the current month up to today."""
    today = datetime.now(timezone.utc).date()
    if today.day == 1:
        # Previous month
        first_of_current = today
        last_of_prev = first_of_current - timedelta(days=1)
        start = last_of_prev.replace(day=1).isoformat()
        end = last_of_prev.isoformat()
    else:
        start = today.replace(day=1).isoformat()
        end = today.isoformat()
    return start, end


def _filter_current_month(items: list, date_field: str = "posted_at") -> list:
    """Filter items to only include those from the current month."""
    month_start = _month_start()
    result = []
    for item in items:
        dt = item.get(date_field)
        if dt and dt[:10] >= month_start:
            result.append(item)
    return result


# --- Pages ---
@app.get("/api/v1/pages")
async def list_pages():
    pages = get_page_repository().get_all()
    return {"success": True, "data": pages}

@app.post("/api/v1/pages")
async def create_page(req: PageCreate):
    data = req.model_dump(exclude_none=True)
    handle = req.handle.lstrip("@").lower()
    data["handle"] = handle
    if not req.profile_url:
        data["profile_url"] = f"https://www.instagram.com/{handle}/"
    page = get_page_repository().create(data)
    return {"success": True, "data": page}

@app.put("/api/v1/pages/{page_id}")
async def update_page(page_id: str, req: PageUpdate):
    data = req.model_dump(exclude_none=True)
    if "handle" in data:
        data["handle"] = data["handle"].lstrip("@").lower()
    page = get_page_repository().update(page_id, data)
    return {"success": True, "data": page}

@app.delete("/api/v1/pages/{page_id}")
async def delete_page(page_id: str):
    get_page_repository().delete(page_id)
    return {"success": True, "message": "Page deleted"}


# --- Posts (manual) ---
@app.get("/api/v1/posts")
async def list_posts():
    posts = get_post_repository().get_all()
    return {"success": True, "data": posts}

@app.post("/api/v1/posts")
async def create_post(req: PostCreate):
    data = req.model_dump(exclude_none=True)
    post = get_post_repository().create(data)
    return {"success": True, "data": post}

@app.put("/api/v1/posts/{post_id}")
async def update_post(post_id: str, req: PostUpdate):
    data = req.model_dump(exclude_none=True)
    post = get_post_repository().update(post_id, data)
    return {"success": True, "data": post}

@app.delete("/api/v1/posts/{post_id}")
async def delete_post(post_id: str):
    get_post_repository().delete(post_id)
    return {"success": True, "message": "Post deleted"}


# --- Dashboard stats ---
@app.get("/api/v1/dashboard")
async def dashboard_stats():
    """Aggregated stats from content_entries + legacy reels/posts."""
    from app.database.client import get_supabase_client
    client = get_supabase_client()

    pages = get_page_repository().get_all()
    current_month, range_end = _dashboard_range()

    # Fetch all content entries
    all_entries = client.table("content_entries").select("*").execute().data or []
    month_entries = [
        e for e in all_entries
        if (e.get("upload_date") or "")[:10] >= current_month
        and (e.get("upload_date") or "")[:10] <= range_end
    ]

    # Also include legacy reels/posts
    all_reels = get_reel_repository().get_all()
    all_posts = get_post_repository().get_all()

    month_reels = [r for r in all_reels if current_month <= (r.get("posted_at") or "")[:10] <= range_end]
    month_posts = [p for p in all_posts if current_month <= (p.get("posted_at") or "")[:10] <= range_end]

    # 6-day tracker cycle sums for the current month — source of truth for dashboard views.
    # Monthly actuals (reconcile tab) are for drift tracking only, not headline totals.
    six_entries = (
        client.table("six_day_entries")
        .select("page_id,views,reel_pct,post_pct,month")
        .eq("month", current_month)
        .execute()
        .data
        or []
    )

    cycle_total: dict[str, int] = {}
    cycle_reel: dict[str, float] = {}
    cycle_post: dict[str, float] = {}
    for e in six_entries:
        pid = e.get("page_id")
        if not pid:
            continue
        v = int(e.get("views") or 0)
        cycle_total[pid] = cycle_total.get(pid, 0) + v
        rpct = e.get("reel_pct")
        ppct = e.get("post_pct")
        if rpct is not None:
            try:
                cycle_reel[pid] = cycle_reel.get(pid, 0.0) + (v * (float(rpct) / 100.0))
            except (TypeError, ValueError):
                pass
        if ppct is not None:
            try:
                cycle_post[pid] = cycle_post.get(pid, 0.0) + (v * (float(ppct) / 100.0))
            except (TypeError, ValueError):
                pass

    # All-time per page
    page_stats = []
    for page in pages:
        pid = page["id"]
        # Content entries for this page
        page_entries = [e for e in all_entries if e.get("page_id") == pid]
        page_month_entries = [e for e in page_entries if current_month <= (e.get("upload_date") or "")[:10] <= range_end]
        # Legacy
        page_reels = [r for r in all_reels if r["page_id"] == pid]
        page_posts = [p for p in all_posts if p["page_id"] == pid]
        page_month_reels = [r for r in month_reels if r["page_id"] == pid]
        page_month_posts = [p for p in month_posts if p["page_id"] == pid]

        # All-time views (still uses content_entries + legacy so historical IP pages stay intact)
        all_time_views = (
            sum(e.get("views", 0) or 0 for e in page_entries) +
            sum(r.get("views", 0) or 0 for r in page_reels) +
            sum(p.get("actual_views", 0) or 0 for p in page_posts)
        )

        # Monthly views = 6-day tracker cycle sum only (matches 6-Day Tracker page total).
        month_views = cycle_total.get(pid, 0)
        reel_views = int(round(float(cycle_reel.get(pid, 0.0))))
        post_views = int(round(float(cycle_post.get(pid, 0.0))))

        entry_count = len(page_month_entries)
        reels_count = len(page_month_reels) + len([e for e in page_month_entries if e.get("content_type") == "reel"])
        posts_count = len(page_month_posts) + len([e for e in page_month_entries if e.get("content_type") != "reel"])

        page_stats.append({
            "id": pid,
            "handle": page["handle"],
            "name": page.get("name"),
            "profile_url": page.get("profile_url"),
            "auto_scrape": page.get("auto_scrape", False),
            "followers_count": page.get("followers_count", 0),
            "stage": page.get("stage", 1),
            "total_views": month_views,
            "all_time_views": all_time_views,
            "reel_views": reel_views,
            "post_views": post_views,
            "total_likes": 0,
            "total_comments": 0,
            "reels_count": reels_count,
            "posts_count": posts_count,
            "all_time_reels_count": len(page_reels) + len([e for e in page_entries if e.get("content_type") == "reel"]),
            "all_time_posts_count": len(page_posts) + len([e for e in page_entries if e.get("content_type") != "reel"]),
            "top_reels": [],
        })

    # Totals — computed from per-page stats so they stay consistent with 6-day cycle sums.
    # IMPORTANT: total_views must come from `total_views` (= month_views = 6-day cycle sum), NOT
    # from reel+post, because pages that have cycle views but no reel_pct/post_pct entered
    # would otherwise be dropped from the total. Any unattributed views are split proportionally
    # so the Reels/Posts ring stays consistent with the 6-day tracker total.
    total_views = sum(p.get("total_views", 0) or 0 for p in page_stats)
    attributed_reel = sum(p.get("reel_views", 0) or 0 for p in page_stats)
    attributed_post = sum(p.get("post_views", 0) or 0 for p in page_stats)
    attributed = attributed_reel + attributed_post
    unattributed = max(0, total_views - attributed)
    if attributed > 0 and unattributed > 0:
        reel_share = attributed_reel / attributed
        extra_reel = int(round(unattributed * reel_share))
        total_reel_views = attributed_reel + extra_reel
        total_post_views = total_views - total_reel_views
    elif attributed == 0 and total_views > 0:
        # No reel_pct/post_pct entered anywhere — default to 50/50 rather than losing views
        total_reel_views = total_views // 2
        total_post_views = total_views - total_reel_views
    else:
        total_reel_views = attributed_reel
        total_post_views = attributed_post
    total_all_time = sum(p["all_time_views"] for p in page_stats)

    return {
        "success": True,
        "data": {
            "total_views": total_views,
            "total_all_time_views": total_all_time,
            "total_reel_views": total_reel_views,
            "total_post_views": total_post_views,
            "total_reels": len(month_reels) + len([e for e in month_entries if e.get("content_type") == "reel"]),
            "total_posts": len(month_posts) + len([e for e in month_entries if e.get("content_type") != "reel"]),
            "current_month": current_month,
            "pages": page_stats,
        },
    }


# --- Page detail (all reels + posts for a page) ---
@app.get("/api/v1/pages/{page_id}/detail")
async def page_detail(page_id: str):
    page = get_page_repository().get_by_id(page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    all_reels = get_reel_repository().get_by_page(page_id)
    all_posts = get_post_repository().get_by_page(page_id)
    dv_entries = get_dashboard_views_repository().get_by_page(page_id)

    # Current month filtered
    month_reels = _filter_current_month(all_reels, "posted_at")
    month_posts = _filter_current_month(all_posts, "posted_at")
    current_month = _month_start()
    current_dv = next((d for d in dv_entries if d.get("month") == current_month), None)

    return {
        "success": True,
        "data": {
            "page": page,
            "reels": month_reels,
            "posts": month_posts,
            "all_reels": all_reels,
            "all_posts": all_posts,
            "dashboard_views": dv_entries,
            "current_dashboard_views": current_dv,
            "current_month": current_month,
        },
    }


# --- Dashboard Views (manual Instagram dashboard view counts) ---
@app.get("/api/v1/pages/{page_id}/dashboard-views")
async def list_dashboard_views(page_id: str):
    entries = get_dashboard_views_repository().get_by_page(page_id)
    return {"success": True, "data": entries}

@app.post("/api/v1/pages/{page_id}/dashboard-views")
async def upsert_dashboard_views(page_id: str, req: dict):
    """Upsert dashboard views. Body: {reel_views?: number, post_views?: number, month?: "YYYY-MM-01"}"""
    month = req.get("month", _month_start())
    data: dict = {"page_id": page_id, "month": month}
    if "reel_views" in req:
        data["reel_views"] = req["reel_views"]
    if "post_views" in req:
        data["post_views"] = req["post_views"]
    entry = get_dashboard_views_repository().upsert(data)
    return {"success": True, "data": entry}


# --- Reels (Stage 1 - manual) ---
@app.get("/api/v1/reels/manual")
async def list_manual_reels():
    reels = get_reel_repository().get_manual()
    return {"success": True, "data": reels}

# --- Reels (Main IPs - auto scraped) ---
@app.get("/api/v1/reels/auto")
async def list_auto_reels():
    reels = get_reel_repository().get_auto()
    return {"success": True, "data": reels}

# --- Reels (shared create/update/delete) ---
@app.post("/api/v1/reels")
async def create_reel(req: ReelCreate):
    data = req.model_dump(exclude_none=True)
    try:
        reel = get_reel_repository().create(data)
        return {"success": True, "data": reel}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/v1/reels/{reel_id}")
async def update_reel(reel_id: str, req: ReelUpdate):
    data = req.model_dump(exclude_none=True)
    reel = get_reel_repository().update(reel_id, data)
    return {"success": True, "data": reel}

@app.delete("/api/v1/reels/{reel_id}")
async def delete_reel(reel_id: str):
    get_reel_repository().delete(reel_id)
    return {"success": True, "message": "Reel deleted"}


# --- Content Strategists ---
@app.get("/api/v1/cs")
async def list_cs():
    cs_list = get_cs_repository().get_all()
    return {"success": True, "data": cs_list}

@app.post("/api/v1/cs")
async def create_cs(req: CSCreate):
    data = req.model_dump(exclude_none=True)
    try:
        cs = get_cs_repository().create(data)
        return {"success": True, "data": cs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/v1/cs/{cs_id}")
async def update_cs(cs_id: str, req: CSUpdate):
    data = req.model_dump(exclude_none=True)
    cs = get_cs_repository().update(cs_id, data)
    return {"success": True, "data": cs}

@app.delete("/api/v1/cs/{cs_id}")
async def delete_cs(cs_id: str):
    get_cs_repository().delete(cs_id)
    return {"success": True, "message": "CS deleted"}


# --- Ideas ---
@app.get("/api/v1/ideas")
async def list_ideas():
    ideas = get_idea_repository().get_all()
    return {"success": True, "data": ideas}

@app.post("/api/v1/ideas")
async def create_idea(req: IdeaCreate):
    from app.database.client import get_supabase_client
    data = req.model_dump(exclude_none=True)
    try:
        idea = get_idea_repository().create(data)

        # Auto-create content entries for each distributed page
        distributed_to = data.get("distributed_to") or []
        if distributed_to:
            client = get_supabase_client()
            pages = client.table("pages").select("id,handle").execute().data or []
            page_map = {p["id"]: p["handle"] for p in pages}
            idea_name = f"{idea.get('idea_code', '')} — {idea.get('hook', '')}".strip(" —")
            content_type = data.get("format", "reel")
            deadline = data.get("deadline")
            created_by = data.get("created_by", "")
            executor = data.get("executor_name", "")

            for page_id in distributed_to:
                handle = page_map.get(page_id, "")
                try:
                    client.table("content_entries").insert({
                        "page_id": page_id,
                        "idea_name": idea_name,
                        "content_type": content_type,
                        "idea_status": "idea",
                        "ips": handle,
                        "created_by": created_by,
                        "deadline": deadline,
                        "assigned_role": executor,
                    }).execute()
                except Exception:
                    pass  # Skip duplicates silently

        return {"success": True, "data": idea}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/v1/ideas/{idea_id}")
async def update_idea(idea_id: str, req: IdeaUpdate):
    data = req.model_dump(exclude_none=True)
    idea = get_idea_repository().update(idea_id, data)
    return {"success": True, "data": idea}

@app.delete("/api/v1/ideas/{idea_id}")
async def delete_idea(idea_id: str):
    get_idea_repository().delete(idea_id)
    return {"success": True, "message": "Idea deleted"}


@app.post("/api/v1/schedule-idea/{idea_id}")
async def schedule_idea(idea_id: str):
    """Run scheduling logic for an idea — assigns dates to all distributed pages."""
    import random
    from app.database.client import get_supabase_client
    client = get_supabase_client()

    # Fetch idea
    idea = get_idea_repository().get_by_id(idea_id)
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")

    distributed_to = idea.get("distributed_to") or []
    if not distributed_to:
        raise HTTPException(status_code=400, detail="No pages to distribute to")

    idea_name = f"{idea.get('idea_code', '')} — {idea.get('hook', '')}".strip(" —")
    content_type = idea.get("format", "reel")
    source = idea.get("source", "original")
    created_by = idea.get("created_by", "")

    # Fetch pages with device info
    pages = client.table("pages").select("id,handle,stage,device").execute().data or []
    page_map = {p["id"]: p for p in pages}

    # Fetch existing scheduled content entries (past 7 days to next 30 days)
    now = datetime.utcnow()
    week_ago = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    month_ahead = (now + timedelta(days=30)).strftime("%Y-%m-%d")
    existing = client.table("content_entries").select("*").gte("upload_date", week_ago).lte("upload_date", month_ahead).execute().data or []

    all_scheduled = []
    for e in existing:
        ud = e.get("upload_date") or e.get("scheduled_at") or ""
        if not ud:
            continue
        try:
            date_obj = datetime.fromisoformat(ud.replace("Z", "+00:00")) if "T" in ud else datetime.strptime(ud[:10], "%Y-%m-%d")
        except Exception:
            continue
        all_scheduled.append({
            "idea": (e.get("idea_name") or "").lower().strip(),
            "page": (e.get("ips") or "").lower().strip(),
            "device": (e.get("device") or "").lower().strip(),
            "date": date_obj,
            "day_key": date_obj.strftime("%Y-%m-%d"),
        })

    results = []
    targets = list(distributed_to)
    random.shuffle(targets)

    for page_id in targets:
        page_info = page_map.get(page_id)
        if not page_info:
            continue

        handle = page_info.get("handle", "")
        stage = page_info.get("stage", 1)
        device = (page_info.get("device") or "unknown").lower().strip()
        page_clean = handle.lower().strip()

        # Stage 3 pages: skip scheduling (they get content entries via auto-distribute, not scheduled)
        if stage == 3:
            results.append({"page": handle, "status": "skipped", "reason": "stage3_no_scheduling"})
            continue

        # Stage 1 scheduling params
        device_breather_min = 90
        time_start = 630   # 10:30 AM
        time_end = 1170    # 7:30 PM

        device_breather_ms = device_breather_min * 60
        schedule_date = now
        is_safe = False
        time_window = ""

        for attempt in range(200):
            total_min = time_start + random.randint(0, time_end - time_start)
            hour = total_min // 60
            minute = total_min % 60
            candidate = schedule_date.replace(hour=min(hour, 23), minute=minute, second=random.randint(0, 59))
            if candidate <= now + timedelta(minutes=30):
                candidate += timedelta(days=1)
                continue

            day_key = candidate.strftime("%Y-%m-%d")

            # Safety wall 1: Device breather
            device_busy = any(
                abs((s["date"] - candidate).total_seconds()) < device_breather_ms
                for s in all_scheduled if s["device"] == device
            )

            # Safety wall 2: 48h device-idea cooldown
            idea_clean = idea_name.lower().strip()
            device_idea_blocked = any(
                s["device"] == device and s["idea"] == idea_clean
                and abs((s["date"] - candidate).total_seconds()) < 48 * 3600
                for s in all_scheduled
            )

            # Safety wall 3: Account daily limit (1 per day)
            account_daily = sum(1 for s in all_scheduled if s["page"] == page_clean and s["day_key"] == day_key)

            if device_busy or device_idea_blocked or account_daily >= 1:
                schedule_date += timedelta(days=1)
                continue

            # Found safe slot
            ampm = "PM" if hour >= 12 else "AM"
            display_hour = hour % 12 or 12
            duration = random.choice([2, 5, 7, 10])
            time_window = f"{display_hour}:{minute:02d} - {display_hour}:{(minute + duration):02d} {ampm}"
            schedule_date = candidate
            is_safe = True
            break

        if not is_safe:
            # Fallback: 14+ days out
            schedule_date = now + timedelta(days=14 + random.randint(0, 30))
            schedule_date = schedule_date.replace(hour=10, minute=30, second=0)
            time_window = "10:30 - 10:37 AM"

        scheduled_str = schedule_date.strftime("%Y-%m-%dT%H:%M:%S")

        # Update existing content entry or create new one
        try:
            existing = client.table("content_entries").select("id").eq("page_id", page_id).eq("idea_name", idea_name).execute().data
            update_data = {
                "idea_status": "scheduled",
                "upload_date": schedule_date.strftime("%Y-%m-%d"),
                "scheduled_at": scheduled_str,
                "upload_time_window": time_window,
                "device": device,
            }
            if existing:
                client.table("content_entries").update(update_data).eq("id", existing[0]["id"]).execute()
            else:
                client.table("content_entries").insert({
                    "page_id": page_id,
                    "idea_name": idea_name,
                    "content_type": content_type,
                    "ips": handle,
                    "created_by": created_by,
                    **update_data,
                }).execute()
        except Exception:
            pass

        # Track for conflict checking
        all_scheduled.append({
            "idea": idea_name.lower().strip(),
            "page": page_clean,
            "device": device,
            "date": schedule_date,
            "day_key": schedule_date.strftime("%Y-%m-%d"),
        })

        results.append({
            "page": handle,
            "device": device,
            "scheduled_at": scheduled_str,
            "time_window": time_window,
            "status": "scheduled",
        })

    # Update idea status to scheduled
    get_idea_repository().update(idea_id, {"status": "active"})

    return {"success": True, "scheduled": len([r for r in results if r["status"] == "scheduled"]), "skipped": len([r for r in results if r["status"] == "skipped"]), "results": results}


# --- Idea Engine Dashboard ---
@app.get("/api/v1/idea-engine")
async def idea_engine_dashboard():
    """Aggregated stats for the Idea Engine page:
    - Per-idea performance (total posts, total views, best post, hit-rate)
    - CS leaderboard (ideas created, winners, hit-rate, total views)
    - System-level metrics (active ideas, winners today, system hit-rate)
    """
    ideas = get_idea_repository().get_all()
    all_reels = get_reel_repository().get_all()
    all_posts = get_post_repository().get_all()
    cs_list = get_cs_repository().get_all()

    # Default winner threshold
    WINNER_THRESHOLD = 50_000

    # Build lookup: idea_id -> list of content (reels + posts)
    idea_content: dict[str, list[dict]] = {}
    for idea in ideas:
        idea_content[idea["id"]] = []

    for reel in all_reels:
        iid = reel.get("idea_id")
        if iid and iid in idea_content:
            idea_content[iid].append({
                "type": "reel",
                "views": reel.get("views", 0) or 0,
                "url": reel.get("url", ""),
                "page_handle": reel.get("pages", {}).get("handle", "") if reel.get("pages") else "",
                "posted_at": reel.get("posted_at"),
            })

    for post in all_posts:
        iid = post.get("idea_id")
        if iid and iid in idea_content:
            idea_content[iid].append({
                "type": "post",
                "views": post.get("actual_views", 0) or 0,
                "url": post.get("url", ""),
                "page_handle": post.get("pages", {}).get("handle", "") if post.get("pages") else "",
                "posted_at": post.get("created_at"),
            })

    # Per-idea stats
    idea_stats = []
    for idea in ideas:
        content = idea_content.get(idea["id"], [])
        total_posts = len(content)
        total_views = sum(c["views"] for c in content)
        winners = [c for c in content if c["views"] >= WINNER_THRESHOLD]
        hit_rate = (len(winners) / total_posts * 100) if total_posts > 0 else 0
        best = max(content, key=lambda c: c["views"]) if content else None

        idea_stats.append({
            "id": idea["id"],
            "idea_code": idea.get("idea_code", ""),
            "hook": idea.get("hook", ""),
            "format": idea.get("format", ""),
            "source": idea.get("source", ""),
            "status": idea.get("status", ""),
            "cs_owner_id": idea.get("cs_owner_id", ""),
            "cs_owner_name": idea.get("content_strategists", {}).get("name", "") if idea.get("content_strategists") else "",
            "cdi_owner_id": idea.get("cdi_owner_id", ""),
            "cdi_owner_name": idea.get("cdi", {}).get("name", "") if idea.get("cdi") else "",
            "distributed_to": idea.get("distributed_to") or [],
            "created_at": idea.get("created_at", ""),
            "hook_variations": idea.get("hook_variations") or [],
            "executor_name": idea.get("executor_name", ""),
            "created_by": idea.get("created_by", ""),
            "yt_url": idea.get("yt_url", ""),
            "timestamps": idea.get("timestamps", ""),
            "base_drive_link": idea.get("base_drive_link", ""),
            "pintu_batch_link": idea.get("pintu_batch_link", ""),
            "comp_link": idea.get("comp_link", ""),
            "canva_link": idea.get("canva_link", ""),
            "deadline": idea.get("deadline", ""),
            "total_posts": total_posts,
            "total_views": total_views,
            "winners_count": len(winners),
            "hit_rate": round(hit_rate, 1),
            "best_post": {
                "url": best["url"],
                "views": best["views"],
                "page_handle": best["page_handle"],
            } if best else None,
        })

    # CS leaderboard
    cs_stats = []
    for cs in cs_list:
        cs_ideas = [i for i in idea_stats if i["cs_owner_id"] == cs["id"]]
        cs_total_views = sum(i["total_views"] for i in cs_ideas)
        cs_total_posts = sum(i["total_posts"] for i in cs_ideas)
        cs_winners = sum(i["winners_count"] for i in cs_ideas)
        cs_hit_rate = (cs_winners / cs_total_posts * 100) if cs_total_posts > 0 else 0

        cs_stats.append({
            "id": cs["id"],
            "name": cs["name"],
            "role": cs.get("role"),
            "ideas_created": len(cs_ideas),
            "total_views": cs_total_views,
            "total_posts": cs_total_posts,
            "winners_count": cs_winners,
            "hit_rate": round(cs_hit_rate, 1),
        })

    cs_stats.sort(key=lambda x: x["total_views"], reverse=True)

    # System-level metrics
    total_active_ideas = len([i for i in idea_stats if i["status"] == "active"])
    system_total_posts = sum(i["total_posts"] for i in idea_stats)
    system_total_views = sum(i["total_views"] for i in idea_stats)
    system_winners = sum(i["winners_count"] for i in idea_stats)
    system_hit_rate = (system_winners / system_total_posts * 100) if system_total_posts > 0 else 0
    avg_views_per_idea = (system_total_views / len(idea_stats)) if idea_stats else 0

    return {
        "success": True,
        "data": {
            "system": {
                "active_ideas": total_active_ideas,
                "total_ideas": len(idea_stats),
                "total_posts": system_total_posts,
                "total_views": system_total_views,
                "total_winners": system_winners,
                "hit_rate": round(system_hit_rate, 1),
                "avg_views_per_idea": round(avg_views_per_idea),
                "winner_threshold": WINNER_THRESHOLD,
            },
            "ideas": idea_stats,
            "cs_leaderboard": cs_stats,
        },
    }


# --- Scrape: fetch all reels from auto_scrape pages ---
@app.post("/api/v1/scrape/reels")
async def scrape_reels(req: ScrapeRequest | None = None):
    """
    Scrape reels from all pages marked auto_scrape=true.
    - First run: pass since_date=2026-03-01 to get everything since March 1st.
    - Weekly runs: defaults to last Monday (Monday-to-Monday window).
    """
    from app.services.apify.profile_scraper import get_profile_scraper

    page_repo = get_page_repository()
    reel_repo = get_reel_repository()

    # Get auto-scrape pages
    auto_pages = page_repo.get_auto_scrape()
    if not auto_pages:
        return ScrapeStatusResponse(success=True, reels_updated=0, errors=["No pages marked for auto-scraping"])

    # Build profile URLs
    profile_urls = [p["profile_url"] for p in auto_pages if p.get("profile_url")]

    # Determine date range
    since_date = _last_monday()
    if req and req.since_date:
        since_date = req.since_date

    # Scrape
    scraper = get_profile_scraper()
    try:
        result = scraper.scrape_profiles(profile_urls, since_date=since_date, results_limit=200)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scraping failed: {str(e)}")

    # Map owner_username -> page_id
    handle_to_page = {p["handle"]: p["id"] for p in auto_pages}

    # Upsert each scraped reel
    now = datetime.now(timezone.utc).isoformat()
    inserted = 0
    errors = list(result.errors)

    for reel in result.reels:
        try:
            owner = reel.owner_username.lower()
            page_id = handle_to_page.get(owner)
            if not page_id:
                errors.append(f"No page found for @{owner}")
                continue

            reel_repo.upsert_scraped({
                "page_id": page_id,
                "url": reel.url,
                "views": reel.views,
                "likes": reel.likes,
                "comments": reel.comments,
                "posted_at": reel.posted_at or None,
                "auto_scrape": True,
                "last_scraped_at": now,
            })
            inserted += 1
        except Exception as e:
            errors.append(f"Failed to save reel {reel.url}: {str(e)}")

    return ScrapeStatusResponse(success=True, reels_updated=inserted, errors=errors)


# --- AI Chat ---
@app.post("/api/v1/chat")
async def chat(req: ChatRequest):
    from app.services.chat_service import get_chat_response
    try:
        history = [{"role": m.role, "content": m.content} for m in req.history]
        result = await get_chat_response(req.message, history)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


# --- Content Entries ---
@app.get("/api/v1/content-entries")
async def list_all_content_entries(content_type: str | None = None):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    query = client.table("content_entries").select("*")
    if content_type:
        # Support comma-separated types e.g. "carousel,static"
        types = [t.strip() for t in content_type.split(",")]
        if len(types) == 1:
            query = query.eq("content_type", types[0])
        else:
            query = query.in_("content_type", types)
    data = query.order("upload_date", desc=True).execute().data
    return {"success": True, "data": data}


@app.get("/api/v1/pages/{page_id}/content-entries")
async def list_content_entries(page_id: str):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    data = client.table("content_entries").select("*").eq("page_id", page_id).order("upload_date", desc=True).execute().data
    return {"success": True, "data": data}


@app.post("/api/v1/content-entries")
async def create_content_entry(req: ContentEntryCreate):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    data = req.model_dump(exclude_none=True)
    entry = client.table("content_entries").insert(data).execute().data[0]
    return {"success": True, "data": entry}


@app.put("/api/v1/content-entries/{entry_id}")
async def update_content_entry(entry_id: str, req: ContentEntryUpdate):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    data = req.model_dump(exclude_none=True)
    entry = client.table("content_entries").update(data).eq("id", entry_id).execute().data[0]
    return {"success": True, "data": entry}


@app.delete("/api/v1/content-entries/{entry_id}")
async def delete_content_entry(entry_id: str):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    client.table("content_entries").delete().eq("id", entry_id).execute()
    return {"success": True, "message": "Entry deleted"}


# --- Migrate reels to content entries ---
@app.post("/api/v1/migrate-reels")
async def migrate_reels():
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    reels = get_reel_repository().get_all()
    migrated = 0
    skipped = 0
    for reel in reels:
        # Check if already migrated (by url)
        existing = client.table("content_entries").select("id").eq("url", reel["url"]).execute().data
        if existing:
            skipped += 1
            continue
        handle = reel.get("pages", {}).get("handle", "") if reel.get("pages") else ""
        client.table("content_entries").insert({
            "page_id": reel["page_id"],
            "idea_name": handle + " reel",
            "content_type": "reel",
            "idea_status": "posted",
            "upload_date": reel.get("posted_at"),
            "views": reel.get("views", 0) or 0,
            "url": reel.get("url", ""),
        }).execute()
        migrated += 1
    return {"success": True, "migrated": migrated, "skipped": skipped}


# --- Migrate posts to content entries ---
@app.post("/api/v1/migrate-posts")
async def migrate_posts(fresh: bool = True):
    import re
    from app.database.client import get_supabase_client
    client = get_supabase_client()

    # Delete all migrated carousel entries, then re-create cleanly
    if fresh:
        all_carousel = client.table("content_entries").select("id,created_by").eq("content_type", "carousel").execute().data or []
        migrated_ids = [e["id"] for e in all_carousel if not e.get("created_by")]
        for eid in migrated_ids:
            client.table("content_entries").delete().eq("id", eid).execute()

    posts = get_post_repository().get_all()
    ideas = get_idea_repository().get_all()
    idea_map = {i["id"]: i for i in ideas}
    migrated = 0
    skipped = 0
    for post in posts:
        url = post.get("url", "")
        handle = ""
        if post.get("pages"):
            handle = post["pages"].get("handle", "")

        # Build a good idea name: linked idea > URL shortcode > fallback
        idea_id = post.get("idea_id")
        idea_name = ""
        if idea_id and idea_id in idea_map:
            idea = idea_map[idea_id]
            code = idea.get("idea_code", "")
            hook = idea.get("hook", "")
            idea_name = f"{code} — {hook}".strip(" —") if (code or hook) else ""
        if not idea_name and url:
            # Extract shortcode from URL like /p/ABC123/
            m = re.search(r"/p/([^/?]+)", url)
            if m:
                idea_name = m.group(1)
        if not idea_name:
            idea_name = f"@{handle} post" if handle else "Post"

        client.table("content_entries").insert({
            "page_id": post["page_id"],
            "idea_name": idea_name,
            "content_type": "carousel",
            "idea_status": "posted",
            "upload_date": post.get("posted_at"),
            "views": post.get("actual_views", 0) or 0,
            "url": url,
            "ips": handle,
        }).execute()
        migrated += 1
    return {"success": True, "migrated": migrated, "skipped": skipped}


@app.post("/api/v1/fix-upload-dates")
async def fix_upload_dates():
    """Copy posted_at from posts table to content_entries upload_date where missing."""
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    # Get all carousel entries without upload_date
    entries = client.table("content_entries").select("id,url,upload_date").eq("content_type", "carousel").is_("upload_date", "null").execute().data or []
    posts = get_post_repository().get_all()
    post_map = {p["url"]: p for p in posts if p.get("url")}
    fixed = 0
    for entry in entries:
        url = entry.get("url", "")
        if url and url in post_map:
            posted_at = post_map[url].get("posted_at")
            if posted_at:
                client.table("content_entries").update({"upload_date": posted_at}).eq("id", entry["id"]).execute()
                fixed += 1
    return {"success": True, "fixed": fixed, "checked": len(entries)}


# --- User Roles ---
@app.get("/api/v1/user-role/{email}")
async def get_user_role(email: str):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    data = client.table("user_roles").select("*").eq("email", email).execute().data
    if data:
        return {"success": True, "data": data[0]}
    return {"success": True, "data": None}


@app.get("/api/v1/deadlines/{role}")
async def get_deadlines(role: str):
    """Get upcoming deadlines for a role (entries with deadline set and assigned_role matching)."""
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    today = datetime.utcnow().strftime("%Y-%m-%d")
    # Get entries with deadline >= today and assigned_role matching
    entries = (
        client.table("content_entries")
        .select("id,idea_name,content_type,idea_status,deadline,assigned_role,ips,page_id,upload_date")
        .eq("assigned_role", role)
        .gte("deadline", today)
        .order("deadline", desc=False)
        .execute()
        .data or []
    )
    return {"success": True, "data": entries}


@app.get("/api/v1/deadlines")
async def get_all_deadlines():
    """Get all upcoming deadlines."""
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    today = datetime.utcnow().strftime("%Y-%m-%d")
    entries = (
        client.table("content_entries")
        .select("id,idea_name,content_type,idea_status,deadline,assigned_role,ips,page_id,upload_date")
        .gte("deadline", today)
        .order("deadline", desc=False)
        .execute()
        .data or []
    )
    return {"success": True, "data": entries}


@app.get("/api/v1/user-roles")
async def get_all_user_roles():
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    data = client.table("user_roles").select("email,name,role").order("name").execute().data or []
    cleaned = []
    for row in data:
        role = sanitize_role_string(row.get("role") or "")
        if role:
            cleaned.append({**row, "role": role})
    return {"success": True, "data": cleaned}


@app.post("/api/v1/user-roles/cleanup")
async def admin_cleanup_team_roles(_admin: dict = Depends(require_admin)):
    """Purge departed members and deprecated roles."""
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    ur = cleanup_team_roles(client)
    cs = cleanup_content_strategists(client)
    return {"success": True, "data": {"user_roles": ur, "content_strategists": cs}}


def _caller_is_admin(client, claims: dict) -> bool:
    caller_email = (claims.get("email") or "").strip().lower()
    if not caller_email:
        return False
    rows = client.table("user_roles").select("role").eq("email", caller_email).execute().data
    return bool(rows) and is_admin_role(rows[0].get("role", ""))


@app.post("/api/v1/user-role")
async def set_user_role(req: dict, claims: dict = Depends(require_auth)):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    email = (req.get("email") or "").strip().lower()
    raw_role = req.get("role")
    name = req.get("name", "")
    if not email or raw_role is None or raw_role == "":
        raise HTTPException(status_code=400, detail="email and role required")
    role = sanitize_role_string(str(raw_role))
    if not role:
        raise HTTPException(status_code=400, detail="At least one valid role is required")
    if not email.endswith(f"@{ALLOWED_DOMAIN}"):
        raise HTTPException(status_code=400, detail=f"Only @{ALLOWED_DOMAIN} emails are allowed")

    payload: dict = {"role": role}
    if name:
        payload["name"] = name
    existing = client.table("user_roles").select("id,name,role").eq("email", email).execute().data

    # Admins may set any role. Everyone else gets exactly one self-service action:
    # creating their own "pending" row on first login, which grants no access and is
    # what puts them in the admin's queue. Any other write requires admin.
    if not _caller_is_admin(client, claims):
        caller_email = (claims.get("email") or "").strip().lower()
        if email != caller_email or role != "pending" or existing:
            raise HTTPException(status_code=403, detail="Admin access required")
    try:
        if existing:
            client.table("user_roles").update(payload).eq("email", email).execute()
        else:
            if "name" not in payload:
                payload["name"] = email.split("@")[0]
            client.table("user_roles").insert({"email": email, **payload}).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    verify = client.table("user_roles").select("*").eq("email", email).execute().data
    if not verify or verify[0].get("role") != role:
        raise HTTPException(
            status_code=500,
            detail="Could not save role — check Supabase connection and user_roles table permissions",
        )
    # Keep seeding workspace role in sync (clears false "fulfillment" stamps).
    try:
        from app.seeding.routes import sync_seeding_role_for_email
        await sync_seeding_role_for_email(email)
    except Exception as e:
        logger.warning("Seeding role sync after set_user_role failed for %s: %s", email, e)
    return {"success": True, "data": verify[0]}


# ── Role → per-area access matrices (unified RBAC) ────────────────────────────
# Stored as JSON on the backend: { "<role>": { "<area_key>": "none|view|edit", … } }.
# These are OVERRIDES merged over the frontend defaults in accessModel.ts.
_ROLE_ACCESS_FILE = os.path.join(os.path.dirname(__file__), "role_access.json")


def _read_role_access() -> dict:
    try:
        with open(_ROLE_ACCESS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _write_role_access(data: dict) -> None:
    with open(_ROLE_ACCESS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


@app.get("/api/v1/role-access")
async def get_role_access():
    """All persisted role → area-access overrides."""
    return {"success": True, "data": _read_role_access()}


@app.put("/api/v1/role-access/{role}")
async def set_role_access(role: str, req: dict, _admin: dict = Depends(require_admin)):
    """Persist one role's full area-access matrix."""
    role = (role or "").strip().lower()
    if not role:
        raise HTTPException(status_code=400, detail="role required")
    access = req.get("access")
    if not isinstance(access, dict):
        raise HTTPException(status_code=400, detail="access object required")
    valid = {"none", "view", "edit"}
    cleaned = {str(k): str(v) for k, v in access.items() if str(v) in valid}
    data = _read_role_access()
    data[role] = cleaned
    _write_role_access(data)
    return {"success": True, "data": {"role": role, "access": cleaned}}


# ── Per-person access mode ("edit" = full role, "view" = read-only everywhere) ──
_USER_MODE_FILE = os.path.join(os.path.dirname(__file__), "user_access_mode.json")


def _read_user_modes() -> dict:
    try:
        with open(_USER_MODE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _write_user_modes(data: dict) -> None:
    with open(_USER_MODE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


@app.get("/api/v1/user-access-mode")
async def get_user_access_modes():
    """All persisted per-person access modes: { "<email>": "edit"|"view" }."""
    return {"success": True, "data": _read_user_modes()}


@app.put("/api/v1/user-access-mode")
async def set_user_access_mode(req: dict, _admin: dict = Depends(require_admin)):
    """Set one person's access mode. Default (absent) = 'edit'."""
    email = (req.get("email") or "").strip().lower()
    mode = str(req.get("mode") or "").strip().lower()
    if not email or mode not in {"edit", "view"}:
        raise HTTPException(status_code=400, detail="email and mode ('edit'|'view') required")
    data = _read_user_modes()
    data[email] = mode
    _write_user_modes(data)
    return {"success": True, "data": {"email": email, "mode": mode}}


# ── Per-PERSON area-access matrices: { "<email>": { "<area_key>": "none|view|edit" } } ──
# Prefer Supabase `user_access` (survives redeploys). Fall back to local JSON file.
_USER_ACCESS_FILE = os.path.join(os.path.dirname(__file__), "user_access.json")


def _read_user_access_file() -> dict:
    try:
        with open(_USER_ACCESS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _write_user_access_file(data: dict) -> None:
    with open(_USER_ACCESS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _read_user_access_supabase() -> dict | None:
    """Return {email: access} from Supabase, or None if table unavailable."""
    try:
        from app.database.client import get_supabase_client
        rows = get_supabase_client().table("user_access").select("email,access").execute().data or []
        out: dict = {}
        for r in rows:
            em = (r.get("email") or "").strip().lower()
            acc = r.get("access")
            if em and isinstance(acc, dict):
                out[em] = acc
        return out
    except Exception as e:
        logger.debug("user_access supabase read skipped: %s", e)
        return None


def _upsert_user_access_supabase(email: str, access: dict) -> bool:
    try:
        from app.database.client import get_supabase_client
        client = get_supabase_client()
        client.table("user_access").upsert(
            {"email": email, "access": access, "updated_at": datetime.now(timezone.utc).isoformat()},
            on_conflict="email",
        ).execute()
        return True
    except Exception as e:
        logger.warning("user_access supabase write failed for %s: %s", email, e)
        return False


def _delete_user_access_supabase(email: str) -> None:
    try:
        from app.database.client import get_supabase_client
        get_supabase_client().table("user_access").delete().eq("email", email).execute()
    except Exception:
        pass


def _read_user_access() -> dict:
    remote = _read_user_access_supabase()
    if remote is not None:
        # Keep file as a local cache / backup of what Supabase has.
        try:
            _write_user_access_file(remote)
        except Exception:
            pass
        return remote
    return _read_user_access_file()


def _write_user_access(data: dict) -> None:
    _write_user_access_file(data)


@app.get("/api/v1/user-access")
async def get_user_access():
    """All persisted per-person area-access matrices."""
    return {"success": True, "data": _read_user_access()}


@app.put("/api/v1/user-access")
async def set_user_access(req: dict, _admin: dict = Depends(require_admin)):
    """Persist one person's full area-access matrix (Supabase + local file)."""
    email = (req.get("email") or "").strip().lower()
    access = req.get("access")
    if not email or not isinstance(access, dict):
        raise HTTPException(status_code=400, detail="email and access object required")
    valid = {"none", "view", "edit"}
    cleaned = {str(k): str(v) for k, v in access.items() if str(v) in valid}
    data = _read_user_access()
    data[email] = cleaned
    _write_user_access(data)
    if not _upsert_user_access_supabase(email, cleaned):
        # Still saved to disk — warn but don't fail hard until table exists.
        logger.warning(
            "user_access saved to file only for %s — create public.user_access (see migrations/user_access_table.sql)",
            email,
        )
    return {"success": True, "data": {"email": email, "access": cleaned}}


@app.delete("/api/v1/user-role/{email}")
async def delete_user_role(email: str, _admin: dict = Depends(require_admin)):
    return await _remove_user_role_impl(email)


@app.post("/api/v1/user-role/remove")
async def remove_user_role_post(req: dict, _admin: dict = Depends(require_admin)):
    """Remove a team member."""
    email = req.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="email required")
    return await _remove_user_role_impl(email)


async def _remove_user_role_impl(email: str):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    normalized = email.strip().lower()
    existing = client.table("user_roles").select("id,email").eq("email", normalized).execute().data
    removed_role = False
    if existing:
        result = client.table("user_roles").delete().eq("email", normalized).execute()
        if getattr(result, "error", None):
            raise HTTPException(status_code=500, detail=str(result.error))
        removed_role = True
    # Always clear per-person access matrix so removed people don't keep ghost access.
    try:
        access = _read_user_access()
        if normalized in access:
            del access[normalized]
            _write_user_access(access)
        _delete_user_access_supabase(normalized)
    except Exception:
        pass
    if not removed_role and not existing:
        # Still OK — caller may be removing a seeding-only / access-only entry.
        return {"success": True, "data": {"email": normalized, "role_removed": False}}
    return {"success": True, "data": {"email": normalized, "role_removed": removed_role}}


# --- Idea Thread: Assignments + Comments ---

@app.get("/api/v1/ideas/{idea_id}/assignments")
async def get_idea_assignments(idea_id: str):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    data = client.table("idea_assignments").select("*").eq("idea_id", idea_id).order("created_at").execute().data or []
    return {"success": True, "data": data}

@app.post("/api/v1/ideas/{idea_id}/assignments")
async def add_idea_assignment(idea_id: str, req: dict):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    assignee_email = req.get("assignee_email")
    assignee_name = req.get("assignee_name", "")
    assigned_by_email = req.get("assigned_by_email", "")
    assigned_by_name = req.get("assigned_by_name", "Someone")
    if not assignee_email:
        raise HTTPException(status_code=400, detail="assignee_email required")
    existing = client.table("idea_assignments").select("id").eq("idea_id", idea_id).eq("assignee_email", assignee_email).execute().data
    if existing:
        return {"success": True, "data": existing[0]}
    entry = client.table("idea_assignments").insert({
        "idea_id": idea_id,
        "assignee_email": assignee_email,
        "assignee_name": assignee_name,
        "assigned_by_email": assigned_by_email,
    }).execute().data[0]
    # Notify the assignee
    try:
        idea = client.table("tracker_ideas").select("title,type").eq("id", idea_id).execute().data
        idea_title = idea[0]["title"] if idea else "an idea"
        tracker_type = idea[0].get("type", "reel") if idea else "reel"
        client.table("notifications").insert({
            "user_email": assignee_email,
            "type": "assignment",
            "idea_id": idea_id,
            "idea_title": idea_title,
            "from_name": assigned_by_name,
            "message": f"You've been tagged on \"{idea_title}\"",
            "tracker_type": tracker_type,
        }).execute()
    except Exception:
        pass
    return {"success": True, "data": entry}

@app.delete("/api/v1/ideas/{idea_id}/assignments/{assignment_id}")
async def remove_idea_assignment(idea_id: str, assignment_id: str):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    client.table("idea_assignments").delete().eq("id", assignment_id).eq("idea_id", idea_id).execute()
    return {"success": True}

@app.get("/api/v1/ideas/{idea_id}/comments")
async def get_idea_comments(idea_id: str):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    data = client.table("idea_comments").select("*").eq("idea_id", idea_id).order("created_at").execute().data or []
    return {"success": True, "data": data}

@app.delete("/api/v1/ideas/{idea_id}/comments/{comment_id}")
async def delete_idea_comment(idea_id: str, comment_id: str):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    client.table("idea_comments").delete().eq("id", comment_id).eq("idea_id", idea_id).execute()
    return {"success": True}


@app.post("/api/v1/ideas/{idea_id}/comments")
async def post_idea_comment(idea_id: str, req: dict):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    author_email = req.get("author_email")
    author_name = req.get("author_name", "")
    text = req.get("text", "").strip()
    comment_type = req.get("type", "comment")
    attachment_url = req.get("attachment_url")
    req_tracker_type = req.get("tracker_type")  # passed directly from frontend
    if not author_email or not text:
        raise HTTPException(status_code=400, detail="author_email and text required")
    if comment_type not in ("comment", "blocker", "update", "review_request"):
        comment_type = "comment"
    entry = client.table("idea_comments").insert({
        "idea_id": idea_id,
        "author_email": author_email,
        "author_name": author_name,
        "text": text,
        "type": comment_type,
        "attachment_url": attachment_url,
    }).execute().data[0]
    # Notify all other people in this thread (assignees + idea creator)
    try:
        idea = client.table("tracker_ideas").select("title,created_by,type").eq("id", idea_id).execute().data
        idea_title = idea[0]["title"] if idea else "an idea"
        creator_name = idea[0].get("created_by", "") if idea else ""
        # Use tracker_type from request body first, fall back to DB type column
        db_type = idea[0].get("type") if idea else None
        tracker_type = req_tracker_type or db_type or "reel"

        assignments = client.table("idea_assignments").select("assignee_email").eq("idea_id", idea_id).execute().data or []
        to_notify = {a["assignee_email"] for a in assignments if a["assignee_email"] != author_email}

        # Also notify the idea creator — look up their email by name in user_roles
        if creator_name:
            creator_rows = client.table("user_roles").select("email").ilike("name", creator_name).execute().data
            if not creator_rows:
                first = creator_name.split()[0]
                creator_rows = client.table("user_roles").select("email").ilike("name", f"{first}%").execute().data
            if creator_rows:
                creator_email = creator_rows[0]["email"]
                if creator_email != author_email:
                    to_notify.add(creator_email)

        type_labels = {"comment": "commented", "blocker": "flagged a blocker", "update": "posted an update", "review_request": "requested a review"}
        verb = type_labels.get(comment_type, "commented")
        preview = text[:80] + ("..." if len(text) > 80 else "")
        for email in to_notify:
            client.table("notifications").insert({
                "user_email": email,
                "type": comment_type,
                "idea_id": idea_id,
                "idea_title": idea_title,
                "from_name": author_name,
                "message": f"{author_name} {verb} on \"{idea_title}\": {preview}",
                "tracker_type": tracker_type,
            }).execute()
    except Exception:
        pass
    return {"success": True, "data": entry}


# --- Notifications ---

@app.get("/api/v1/notifications")
async def get_notifications(email: str):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    email_norm = (email or "").strip().lower()
    data = client.table("notifications").select("*").eq("user_email", email_norm).order("created_at", desc=True).limit(50).execute().data or []
    return {"success": True, "data": data}

@app.patch("/api/v1/notifications/read-all")
async def mark_all_notifications_read(email: str):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    email_norm = (email or "").strip().lower()
    client.table("notifications").update({"read": True}).eq("user_email", email_norm).eq("read", False).execute()
    return {"success": True}


# --- Growth Data ---
@app.get("/api/v1/growth")
async def get_growth_data():
    from app.database.client import get_supabase_client
    from datetime import datetime
    client = get_supabase_client()
    data = client.table("growth_data").select("*").order("month", desc=True).execute().data or []

    # Auto-calculate live data from content_entries + reels for months not in growth_data
    existing_months = {d.get("month", "")[:7] for d in data}

    pages = client.table("pages").select("id,handle,name,stage,followers_count").execute().data or []
    entries = client.table("content_entries").select("page_id,views,upload_date,created_at").execute().data or []
    all_reels = get_reel_repository().get_all()

    # Collect all months from content_entries + reels + always include current month
    now = datetime.utcnow()
    current_month_prefix = f"{now.year}-{now.month:02d}"
    live_months = set()
    live_months.add(current_month_prefix)  # Always include current month
    for e in entries:
        m = (e.get("upload_date") or e.get("created_at") or "")[:7]
        if m and m not in existing_months:
            live_months.add(m)
    for r in all_reels:
        m = (r.get("posted_at") or "")[:7]
        if m and m not in existing_months:
            live_months.add(m)
    # Remove months already in growth_data
    live_months -= existing_months

    for month_prefix in live_months:
        month_str = f"{month_prefix}-01"
        for page in pages:
            page_id = page["id"]
            handle = page.get("handle", "")
            stage = page.get("stage", 1)

            entry_views = sum(
                (e.get("views") or 0) for e in entries
                if e.get("page_id") == page_id
                and ((e.get("upload_date") or e.get("created_at") or "")[:7] == month_prefix)
            )
            reel_views = sum(
                (r.get("views") or 0) for r in all_reels
                if r.get("page_id") == page_id
                and ((r.get("posted_at") or "")[:7] == month_prefix)
            )
            total_views = entry_views + reel_views
            # Include all pages (even 0 views) so stage 1 shows up
            data.append({
                    "id": f"live-{page_id}-{month_prefix}",
                    "handle": handle,
                    "stage": stage,
                    "month": month_str,
                    "views": total_views,
                    "followers_gained": 0,
                    "category": page.get("category", ""),
                })

    # --- Merge 6-day tracker into growth: cycle sums are the source of truth ---
    # Also derive per-page/month reel_views + post_views from 6-day reel_pct/post_pct so
    # the dashboard graph can plot Reels and Posts as separate lines.
    six_entries = client.table("six_day_entries").select("page_id,month,views,reel_pct,post_pct").execute().data or []

    handle_to_id = {p["handle"]: p["id"] for p in pages}
    id_to_page = {p["id"]: p for p in pages}

    cycle_sum: dict[tuple[str, str], int] = {}
    cycle_reel_sum: dict[tuple[str, str], float] = {}
    cycle_post_sum: dict[tuple[str, str], float] = {}
    for e in six_entries:
        pid, mon = e.get("page_id"), e.get("month")
        if not pid or not mon:
            continue
        mp = mon[:7] if isinstance(mon, str) else str(mon)[:7]
        v = int(e.get("views") or 0)
        cycle_sum[(pid, mp)] = cycle_sum.get((pid, mp), 0) + v
        rpct = e.get("reel_pct")
        ppct = e.get("post_pct")
        try:
            if rpct is not None:
                cycle_reel_sum[(pid, mp)] = cycle_reel_sum.get((pid, mp), 0.0) + (v * (float(rpct) / 100.0))
        except (TypeError, ValueError):
            pass
        try:
            if ppct is not None:
                cycle_post_sum[(pid, mp)] = cycle_post_sum.get((pid, mp), 0.0) + (v * (float(ppct) / 100.0))
        except (TypeError, ValueError):
            pass

    six_keys = set(cycle_sum.keys())

    # Months that have ANY 6-day data become 6-day-only for Growth: any page in these months
    # that doesn't have 6-day data contributes 0 views (NOT its content_entries fallback).
    # This guarantees the Growth page total matches the 6-day tracker total exactly.
    six_day_months: set[str] = {mp for (_pid, mp) in six_keys}

    def _derive_split(pid: str, mp: str, total: int) -> tuple[int, int]:
        """Given a final total views for (pid, mp), derive reel_views and post_views
        by scaling the reel_pct/post_pct split recorded in six_day_entries."""
        base = cycle_sum.get((pid, mp), 0)
        base_reel = float(cycle_reel_sum.get((pid, mp), 0.0))
        base_post = float(cycle_post_sum.get((pid, mp), 0.0))
        if base <= 0 or total <= 0:
            return 0, 0
        ratio = total / base
        return int(round(base_reel * ratio)), int(round(base_post * ratio))

    for row in data:
        h = row.get("handle")
        if not h or h == "total":
            continue
        pid = handle_to_id.get(h)
        if not pid:
            continue
        mp = (row.get("month") or "")[:7]
        if len(mp) < 7:
            continue
        k = (pid, mp)
        if cycle_sum.get(k, 0) > 0:
            row["views"] = cycle_sum[k]
        elif mp in six_day_months:
            # This month has 6-day data somewhere but not for this page → zero out
            # so we don't double-count legacy content_entries on top of 6-day totals.
            row["views"] = 0
            row["reel_views"] = 0
            row["post_views"] = 0
        # Derive reel/post split from 6-day if we have it
        r_views, p_views = _derive_split(pid, mp, int(row.get("views") or 0))
        if r_views or p_views:
            row["reel_views"] = r_views
            row["post_views"] = p_views

    present = {
        (handle_to_id.get(r.get("handle")), (r.get("month") or "")[:7])
        for r in data if r.get("handle") and r.get("handle") != "total"
    }

    for (pid, mp) in six_keys:
        if not pid or (pid, mp) in present:
            continue
        p = id_to_page.get(pid)
        if not p:
            continue
        total = cycle_sum.get((pid, mp), 0)
        if total <= 0:
            continue
        r_views, p_views = _derive_split(pid, mp, total)
        data.append({
            "id": f"six-day-{pid}-{mp}",
            "handle": p["handle"],
            "stage": p.get("stage", 1),
            "month": f"{mp}-01",
            "views": total,
            "reel_views": r_views,
            "post_views": p_views,
            "followers_gained": 0,
            "category": p.get("category", ""),
        })

    return {"success": True, "data": data}


# ===================== Competitor Research =====================

COMPETITOR_TABLES = {
    "fbs_reels": "competitor_fbs_reels",
    "tech_reels": "competitor_tech_reels",
    "fbs_posts": "competitor_fbs_posts",
}


def _compute_view_bucket(views: int) -> str:
    if views >= 1_000_000:
        return "1M+"
    if views >= 500_000:
        return "500k-1M"
    if views >= 250_000:
        return "250k-500k"
    if views >= 100_000:
        return "100k-250k"
    if views >= 50_000:
        return "50-100k"
    return "<50k"


def _extract_handle(url: str) -> str:
    """Extract Instagram handle from a post/reel URL."""
    import re
    m = re.search(r"instagram\.com/([^/]+)", url or "")
    return m.group(1) if m else ""


@app.post("/api/v1/competitor/{category}/ingest")
async def competitor_ingest(category: str, request: Request):
    """Ingest scraped competitor data from n8n. Accepts a single dict or a list of dicts. Deduplicates by URL."""
    if category not in COMPETITOR_TABLES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Use: {list(COMPETITOR_TABLES.keys())}")

    payload = await request.json()
    entries = [payload] if isinstance(payload, dict) else payload

    from app.database.client import get_supabase_client
    client = get_supabase_client()
    table = COMPETITOR_TABLES[category]

    def _clean_int(val) -> int:
        """n8n sometimes sends '=35107' instead of 35107. Strip leading '=' and parse."""
        if val is None:
            return 0
        s = str(val).lstrip("=").strip()
        if not s or s == "None":
            return 0
        try:
            return int(float(s))
        except (ValueError, TypeError):
            return 0

    def _clean_str(val) -> str:
        if val is None:
            return ""
        return str(val).lstrip("=").strip()

    inserted = 0
    skipped = 0
    for entry in entries:
        url = _clean_str(entry.get("Link to the reel") or entry.get("url") or entry.get("link") or "")
        if not url:
            skipped += 1
            continue

        views = _clean_int(entry.get("views") or entry.get("videoPlayCount"))
        likes = _clean_int(entry.get("Likes") or entry.get("likesCount"))
        name = _clean_str(entry.get("IG username") or entry.get("ownerFullName") or "")
        posted_at = _clean_str(entry.get("Posted on") or entry.get("timestamp") or "")
        handle = _extract_handle(url)

        row = {
            "account_name": name,
            "account_handle": handle,
            "likes": likes,
            "views": views,
            "view_bucket": _compute_view_bucket(likes if category == "fbs_posts" else views),
            "url": url,
            "posted_at": posted_at or None,
        }

        # Upsert: skip if URL already exists
        existing = client.table(table).select("id").eq("url", url).execute().data
        if existing:
            skipped += 1
            continue

        client.table(table).insert(row).execute()
        inserted += 1

    return {"success": True, "inserted": inserted, "skipped": skipped}


@app.get("/api/v1/competitor/{category}")
async def competitor_list(category: str, bucket: str | None = None):
    """Get competitor content with optional view_bucket filter."""
    if category not in COMPETITOR_TABLES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Use: {list(COMPETITOR_TABLES.keys())}")

    from app.database.client import get_supabase_client
    client = get_supabase_client()
    table = COMPETITOR_TABLES[category]

    order_col = "likes" if category == "fbs_posts" else "views"
    query = client.table(table).select("*").order(order_col, desc=True)
    if bucket:
        query = query.eq("view_bucket", bucket)

    data = query.limit(500).execute().data or []
    return {"success": True, "data": data}


@app.put("/api/v1/competitor/{category}/{entry_id}")
async def competitor_update(category: str, entry_id: str, update: dict):
    """Update a competitor entry (e.g., toggle usage status)."""
    if category not in COMPETITOR_TABLES:
        raise HTTPException(status_code=400, detail=f"Invalid category.")

    from app.database.client import get_supabase_client
    client = get_supabase_client()
    table = COMPETITOR_TABLES[category]

    allowed_fields = {"usage"}
    filtered = {k: v for k, v in update.items() if k in allowed_fields}
    if not filtered:
        raise HTTPException(status_code=400, detail="No valid fields to update.")

    client.table(table).update(filtered).eq("id", entry_id).execute()

    # Feature 2: If marking as "used", auto-create a tracker idea
    if filtered.get("usage") == "used":
        try:
            entry = client.table(table).select("*").eq("id", entry_id).execute().data
            if entry:
                e = entry[0]
                idea_type = "post" if category == "fbs_posts" else "reel"
                idea_title = e.get("account_name", "") or e.get("account_handle", "")

                # Check if already created (avoid duplicates)
                existing_idea = client.table("tracker_ideas").select("id").eq("comp_link", e.get("url", "")).execute().data
                if not existing_idea:
                    # Find a default niche (first FBS niche)
                    niches = client.table("tracker_niches").select("id,name").execute().data or []
                    niche_id = None
                    for n in niches:
                        if "garfield" in n["name"].lower() or "fbs" in n["name"].lower():
                            niche_id = n["id"]
                            break
                    if not niche_id and niches:
                        niche_id = niches[0]["id"]

                    client.table("tracker_ideas").insert({
                        "title": idea_title,
                        "source": "competitor",
                        "comp_link": e.get("url"),
                        "type": idea_type,
                        "stage": "new",
                        "niche_id": niche_id,
                        "tags": ["comp_research"],
                        "created_by": "comp research",
                    }).execute()
        except Exception:
            pass  # Don't fail the usage update if idea creation fails

    return {"success": True}


# ===================== Content Tracker =====================

# --- Niches ---
@app.get("/api/v1/tracker/niches")
async def tracker_niches_list():
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    data = client.table("tracker_niches").select("*").order("created_at").execute().data or []
    return {"success": True, "data": data}


@app.post("/api/v1/tracker/niches")
async def tracker_niches_create(request: Request):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    body = await request.json()
    row = {"name": body["name"], "pages": body.get("pages", [])}
    result = client.table("tracker_niches").insert(row).execute().data[0]
    return {"success": True, "data": result}


@app.put("/api/v1/tracker/niches/{niche_id}")
async def tracker_niches_update(niche_id: str, request: Request):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    body = await request.json()
    allowed = {k: v for k, v in body.items() if k in ("name", "pages")}
    client.table("tracker_niches").update(allowed).eq("id", niche_id).execute()
    return {"success": True}


@app.delete("/api/v1/tracker/niches/{niche_id}")
async def tracker_niches_delete(niche_id: str):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    client.table("tracker_niches").delete().eq("id", niche_id).execute()
    return {"success": True}


# --- Team performance (Garfields vs Goofies) ---

# Canonical handle lists for the two FBS teams. Keep in sync with the product
# team's master list. These drive:
#   - `tracker_niches.pages` for "FBS - Garfields" and "FBS - Goofies"
#   - The 6-Day Tracker niche filter
#   - The Reel/Post Tracker niche & page filters
#   - The leaderboard team aggregates (/api/v1/teams/performance)
# Handles are stored lowercase, without the leading "@".
GARFIELDS_HANDLES: list[str] = [
    "bizzindia",
    "startupbydog",
    "indianbusinesscom",
    "entrepreneursindia.co",
    "therealfoundr",
    "elitefoundrs",
    "foundersindex",
]

GOOFIES_HANDLES: list[str] = [
    "101xfounders",
    "foundersinindia",
    "startupcoded",
]

SHERUS_HANDLES: list[str] = [
    "thechangingorder",
    "101xtechnology",
    "startupswtf",
]

TECH_NICHE_HANDLES: list[str] = [
    "indiantechdaily",
    "ai.cracked",
]

EXPERIMENT_BPB_HANDLES: list[str] = [
    "indianfoundersco",
    "indiastartupstory",
    "indiabusinesscom",
    "indiafounderscore",
    "indiafounderbrief",
]

EXPERIMENT_XF_HANDLES: list[str] = [
    "entrepreneurial.india",
    "startupcoded",
]

EXPERIMENT_TECH_HANDLES: list[str] = [
    "101xtechnology",
    "indiantechdaily",
    "ai.cracked",
]

# Backwards compatibility alias
EXPERIMENT_X_HANDLES = EXPERIMENT_BPB_HANDLES


TEAM_PERFORMANCE_CONFIG: dict[str, dict] = {
    "garfields": {
        "key": "garfields",
        "label": "Garfields",
        "emoji": "\U0001F431",  # cat
        "members": ["Deepak", "Kaavya", "Swati"],
        "niche_match": ("garfields",),
    },
    "goofies": {
        "key": "goofies",
        "label": "Goofies",
        "emoji": "\U0001F436",  # dog
        "members": ["Arohi", "Harish"],
        "niche_match": ("goofies",),
    },
    "sheruses": {
        "key": "sheruses",
        "label": "The Sherus",
        "emoji": "\U0001F981",  # lion
        "members": ["Sugam", "Chaitanya"],
        "niche_match": ("sheru", "sheerus", "changing order"),
    },
    "experimentx": {
        "key": "experimentx",
        "label": "The Bizz playbook",
        "emoji": "\U0001F9EA",  # test tube
        "members": ["Pulkit"],
        "niche_match": ("experiment", "bpb"),
    },
}


def _team_views_6d_from_six_day_tracker(
    client,
    team_accounts: dict[str, set[str]],
    today,
    month_date: str | None = None,
) -> dict[str, int] | None:
    """If the target month has at least one `six_day_entries` row (any cycle),
    return per-team view totals summed across the full month; otherwise return
    None to keep posting-based rolling-6d.

    `today` must be the org calendar date (Asia/Kolkata).
    `month_date` overrides the derived month (used when showing previous month on the 1st).
    """
    if month_date is None:
        y, m = today.year, today.month
        month_date = f"{y}-{m:02d}-01"
    entries = (
        client.table("six_day_entries")
        .select("page_id,views")
        .eq("month", month_date)
        .execute()
        .data
        or []
    )
    if not entries:
        return None
    pages = client.table("pages").select("id,handle").execute().data or []
    pid_to_h = {
        str(p["id"]): str(p.get("handle") or "").lstrip("@").strip().lower()
        for p in pages
        if p.get("id")
    }
    handle_to_team: dict[str, str] = {}
    for tk, handles in team_accounts.items():
        for h in handles:
            handle_to_team[str(h).lstrip("@").strip().lower()] = tk
    out: dict[str, int] = {k: 0 for k in TEAM_PERFORMANCE_CONFIG}
    for e in entries:
        pid = str(e.get("page_id") or "")
        h = pid_to_h.get(pid, "")
        if not h:
            continue
        tk = handle_to_team.get(h)
        if not tk or tk not in out:
            continue
        out[tk] += int(e.get("views") or 0)
    return out


@app.get("/api/v1/teams/performance")
async def teams_performance():
    """Gamified leaderboard: Garfields vs Goofies.

    Team `views_6d` and the leader margin use the **6-Day Performance Tracker**
    month total (sum of `six_day_entries.views` for the current calendar month in
    **Asia/Kolkata (IST)**, all cycles) when that month has data; otherwise they
    fall back to a rolling 6-calendar-day sum from `tracker_postings` using the
    same timezone for "today" and the cutoff.

    Posting-derived short-window stats (per-creator, top ideas, hall-of-fame MVP /
    hottest idea, people board) use the **same window** as the scoreboard mode:
    **month-to-date (IST)** when six-day tracker data exists for the month, else
    a **rolling 7-day** slice (today−6…today, IST). All-time hall-of-fame card
    is unchanged.

    Idea counts by stage come from `tracker_ideas`.
    """
    from app.database.client import get_supabase_client
    from datetime import datetime, timedelta, timezone

    client = get_supabase_client()

    niches = client.table("tracker_niches").select("id,name,pages").execute().data or []
    ideas = (
        client.table("tracker_ideas")
        .select("id,title,stage,niche_id,niche_ids,type,source,created_by")
        .execute()
        .data or []
    )
    postings = (
        client.table("tracker_postings")
        .select("id,idea_id,page,date,views")
        .execute()
        .data or []
    )

    # ---- Niche → team mapping ---------------------------------------------
    niche_id_to_team: dict[str, str] = {}
    for n in niches:
        nid = n.get("id")
        nm = (n.get("name") or "").lower()
        if not nid:
            continue
        for team_key, cfg in TEAM_PERFORMANCE_CONFIG.items():
            for sub in cfg["niche_match"]:
                if sub in nm:
                    niche_id_to_team[nid] = team_key
                    break

    team_accounts: dict[str, set[str]] = {k: set() for k in TEAM_PERFORMANCE_CONFIG}
    for n in niches:
        tid = niche_id_to_team.get(n.get("id"))
        if not tid:
            continue
        for h in n.get("pages") or []:
            if h:
                team_accounts[tid].add(str(h).lstrip("@").strip().lower())

    def _idea_team(idea: dict) -> str | None:
        nid = idea.get("niche_id")
        if nid and nid in niche_id_to_team:
            return niche_id_to_team[nid]
        for x in idea.get("niche_ids") or []:
            if x in niche_id_to_team:
                return niche_id_to_team[x]
        return None

    def _content_bucket(idea: dict) -> str:
        t = (idea.get("type") or "reel").lower().strip()
        return "post" if t == "post" else "reel"

    def _norm_creator(raw: str | None) -> str:
        if not raw:
            return ""
        s = str(raw).strip()
        # If it looks like an email, take the local-part. If it has dots, prettify.
        if "@" in s:
            s = s.split("@", 1)[0]
        # Replace separators and title-case short names
        s = s.replace(".", " ").replace("_", " ").replace("-", " ").strip()
        return " ".join(w.capitalize() for w in s.split() if w)

    # ---- Build idea index -------------------------------------------------
    idea_by_id: dict[str, dict] = {}
    for idea in ideas:
        iid = idea.get("id")
        if iid:
            idea_by_id[iid] = idea

    # ---- Aggregate views --------------------------------------------------
    # IST aligns with monthly wrap and ops; UTC "today" lags behind India for
    # ~5.5h after local midnight and caused the scoreboard to show the prior month.
    _ist = timezone(timedelta(hours=5, minutes=30))
    today = datetime.now(_ist).date()
    month_start = today.replace(day=1)
    cutoff_6d = today - timedelta(days=6)

    # On the 1st of the month use the previous month's six-day data (current month has none yet)
    effective_month, _ = _dashboard_range()

    try:
        six_day_team_6d = _team_views_6d_from_six_day_tracker(client, team_accounts, today, month_date=effective_month)
    except Exception:
        six_day_team_6d = None

    # Align posting-based “short window” with six-day month mode so MVP / top idea
    # / people board reset monthly instead of using a rolling week that straddles months.
    if six_day_team_6d is not None:
        posting_period_start = month_start
        views_period = "calendar_month"
    else:
        posting_period_start = cutoff_6d
        views_period = "rolling"
    views_period_days = (today - posting_period_start).days + 1

    # Per team: total + 6d views; per creator inside team: views + idea count
    team_stats: dict[str, dict] = {
        k: {
            "views_total": 0,
            "views_6d": 0,
            "views_by_idea": {},     # idea_id -> total views
            "views_by_idea_6d": {},
            "views_by_creator": {},  # creator display name -> {"views_total","views_6d","ideas": set(idea_id)}
        }
        for k in TEAM_PERFORMANCE_CONFIG
    }

    # Per-idea overall views (both teams, for global hall-of-fame)
    idea_views_total: dict[str, int] = {}
    idea_views_6d: dict[str, int] = {}

    for p in postings:
        v = int(p.get("views") or 0)
        if v <= 0:
            continue
        iid = p.get("idea_id")
        idea = idea_by_id.get(iid) if iid else None
        if not idea:
            continue
        tk = _idea_team(idea)
        if not tk or tk not in team_stats:
            continue

        # Parse posting date (accept yyyy-mm-dd)
        dstr = (p.get("date") or "")[:10]
        in_6d = False
        if dstr:
            try:
                d = datetime.strptime(dstr, "%Y-%m-%d").date()
                in_6d = posting_period_start <= d <= today
            except ValueError:
                in_6d = False

        ts = team_stats[tk]
        ts["views_total"] += v
        ts["views_by_idea"][iid] = ts["views_by_idea"].get(iid, 0) + v
        idea_views_total[iid] = idea_views_total.get(iid, 0) + v

        if in_6d:
            ts["views_6d"] += v
            ts["views_by_idea_6d"][iid] = ts["views_by_idea_6d"].get(iid, 0) + v
            idea_views_6d[iid] = idea_views_6d.get(iid, 0) + v

        creator = _norm_creator(idea.get("created_by"))
        if creator:
            cmap = ts["views_by_creator"].setdefault(
                creator, {"views_total": 0, "views_6d": 0, "ideas": set()}
            )
            cmap["views_total"] += v
            cmap["ideas"].add(iid)
            if in_6d:
                cmap["views_6d"] += v

    # ---- Idea counts by stage --------------------------------------------
    stats: dict[str, dict[str, int]] = {
        k: {
            "ideas_total": 0, "ideas_posted": 0, "ideas_killed": 0,
            "reel_total": 0, "reel_posted": 0, "reel_killed": 0,
            "post_total": 0, "post_posted": 0, "post_killed": 0,
        }
        for k in TEAM_PERFORMANCE_CONFIG
    }
    for idea in ideas:
        tk = _idea_team(idea)
        if not tk or tk not in stats:
            continue
        bucket = _content_bucket(idea)
        st = (idea.get("stage") or "").lower()
        stats[tk]["ideas_total"] += 1
        stats[tk][f"{bucket}_total"] += 1
        # Post Tracker uses "uploaded" for the final shipped state, Content
        # Tracker uses "posted". Treat them as the same thing so a PostTracker
        # idea marked uploaded counts toward the team's posted totals.
        if st in ("posted", "uploaded"):
            stats[tk]["ideas_posted"] += 1
            stats[tk][f"{bucket}_posted"] += 1
        elif st == "kill":
            stats[tk]["ideas_killed"] += 1
            stats[tk][f"{bucket}_killed"] += 1

    def _idea_card(iid: str, team_key: str) -> dict | None:
        idea = idea_by_id.get(iid)
        if not idea:
            return None
        return {
            "id": iid,
            "title": idea.get("title") or "Untitled",
            "type": _content_bucket(idea),
            "source": (idea.get("source") or "original"),
            "creator": _norm_creator(idea.get("created_by")),
            "team": team_key,
        }

    # ---- Assemble team rows ----------------------------------------------
    teams_out = []
    for team_key, cfg in TEAM_PERFORMANCE_CONFIG.items():
        handles = sorted(team_accounts.get(team_key, set()))
        st = stats[team_key]
        ts = team_stats[team_key]

        # Top creator for this team (6d primary, all-time tie-break)
        top_creator_6d = None
        top_creator_all = None
        if ts["views_by_creator"]:
            # 6d ranking
            ranked_6d = sorted(
                ts["views_by_creator"].items(),
                key=lambda kv: (kv[1]["views_6d"], kv[1]["views_total"]),
                reverse=True,
            )
            c_name, c_stats = ranked_6d[0]
            if c_stats["views_6d"] > 0:
                top_creator_6d = {
                    "name": c_name, "views": c_stats["views_6d"], "ideas": len(c_stats["ideas"])
                }
            # All-time ranking
            ranked_all = sorted(
                ts["views_by_creator"].items(),
                key=lambda kv: (kv[1]["views_total"], kv[1]["views_6d"]),
                reverse=True,
            )
            c_name, c_stats = ranked_all[0]
            if c_stats["views_total"] > 0:
                top_creator_all = {
                    "name": c_name, "views": c_stats["views_total"], "ideas": len(c_stats["ideas"])
                }

        # Top idea for this team
        top_idea_6d = None
        if ts["views_by_idea_6d"]:
            iid, v = max(ts["views_by_idea_6d"].items(), key=lambda kv: kv[1])
            card = _idea_card(iid, team_key)
            if card:
                top_idea_6d = {**card, "views": v}
        top_idea_all = None
        if ts["views_by_idea"]:
            iid, v = max(ts["views_by_idea"].items(), key=lambda kv: kv[1])
            card = _idea_card(iid, team_key)
            if card:
                top_idea_all = {**card, "views": v}

        teams_out.append({
            "key": team_key,
            "label": cfg["label"],
            "emoji": cfg["emoji"],
            "members": cfg["members"],
            "member_count": len(cfg["members"]),
            "accounts": [{"handle": h} for h in handles],
            "account_count": len(handles),
            "ideas_total": st["ideas_total"],
            "ideas_posted": st["ideas_posted"],
            "ideas_killed": st["ideas_killed"],
            "ideas_in_progress": max(0, st["ideas_total"] - st["ideas_posted"] - st["ideas_killed"]),
            "reel_total": st["reel_total"],
            "reel_posted": st["reel_posted"],
            "reel_killed": st["reel_killed"],
            "post_total": st["post_total"],
            "post_posted": st["post_posted"],
            "post_killed": st["post_killed"],
            "views_total": ts["views_total"],
            "views_6d": (
                six_day_team_6d[team_key]
                if six_day_team_6d is not None
                else ts["views_6d"]
            ),
            "top_creator_6d": top_creator_6d,
            "top_creator_all": top_creator_all,
            "top_idea_6d": top_idea_6d,
            "top_idea_all": top_idea_all,
        })

    for row in teams_out:
        tot = row["ideas_total"]
        row["posted_rate"] = (row["ideas_posted"] / tot) if tot > 0 else 0.0

    # ---- Leader: primary metric is 6-day views, fallback to total views,
    #      fallback to ship rate ------------------------------------------
    teams_out.sort(
        key=lambda x: (x["views_6d"], x["views_total"], x["posted_rate"], x["ideas_posted"]),
        reverse=True,
    )

    leader = None
    leader_margin_views_6d = 0
    leader_margin_views_total = 0
    if teams_out:
        if len(teams_out) == 1:
            if teams_out[0]["views_6d"] > 0 or teams_out[0]["ideas_total"] > 0:
                leader = teams_out[0]["key"]
        else:
            t0, t1 = teams_out[0], teams_out[1]
            k0 = (t0["views_6d"], t0["views_total"], t0["posted_rate"], t0["ideas_posted"])
            k1 = (t1["views_6d"], t1["views_total"], t1["posted_rate"], t1["ideas_posted"])
            if k0 > k1:
                leader = t0["key"]
            leader_margin_views_6d = t0["views_6d"] - t1["views_6d"]
            leader_margin_views_total = t0["views_total"] - t1["views_total"]

    # ---- Global awards (hall of fame, across both teams) -----------------
    def _pick_top_idea(pool: dict[str, int]) -> dict | None:
        if not pool:
            return None
        iid, v = max(pool.items(), key=lambda kv: kv[1])
        idea = idea_by_id.get(iid)
        if not idea:
            return None
        tk = _idea_team(idea)
        if not tk:
            return None
        card = _idea_card(iid, tk)
        if not card:
            return None
        return {**card, "views": v, "team_label": TEAM_PERFORMANCE_CONFIG[tk]["label"], "team_emoji": TEAM_PERFORMANCE_CONFIG[tk]["emoji"]}

    top_idea_overall = _pick_top_idea(idea_views_total)
    top_idea_6d_overall = _pick_top_idea(idea_views_6d)

    # Top creator across both teams in last 6d
    flat_creator_6d: dict[tuple[str, str], dict] = {}
    for tk, ts in team_stats.items():
        for cname, cstats in ts["views_by_creator"].items():
            key = (tk, cname)
            if cstats["views_6d"] > 0:
                flat_creator_6d[key] = cstats
    top_creator_6d_overall = None
    if flat_creator_6d:
        (tk, cname), cstats = max(
            flat_creator_6d.items(),
            key=lambda kv: (kv[1]["views_6d"], kv[1]["views_total"]),
        )
        top_creator_6d_overall = {
            "name": cname,
            "team": tk,
            "team_label": TEAM_PERFORMANCE_CONFIG[tk]["label"],
            "team_emoji": TEAM_PERFORMANCE_CONFIG[tk]["emoji"],
            "views": cstats["views_6d"],
            "ideas": len(cstats["ideas"]),
        }

    # People leaderboard (every creator, sorted by 6d views desc)
    people = []
    for tk, ts in team_stats.items():
        for cname, cstats in ts["views_by_creator"].items():
            people.append({
                "name": cname,
                "team": tk,
                "team_label": TEAM_PERFORMANCE_CONFIG[tk]["label"],
                "team_emoji": TEAM_PERFORMANCE_CONFIG[tk]["emoji"],
                "views_total": cstats["views_total"],
                "views_6d": cstats["views_6d"],
                "ideas_count": len(cstats["ideas"]),
            })
    people.sort(key=lambda p: (p["views_6d"], p["views_total"]), reverse=True)

    return {
        "success": True,
        "data": {
            "teams": teams_out,
            "leader_key": leader,
            "leader_margin_views_6d": leader_margin_views_6d,
            "leader_margin_views_total": leader_margin_views_total,
            "top_idea_overall": top_idea_overall,
            "top_idea_6d": top_idea_6d_overall,
            "top_creator_6d": top_creator_6d_overall,
            "people": people,
            "views_period": views_period,
            "views_period_days": views_period_days,
            "window_days": views_period_days,
        },
    }


# --- Ideas ---


def _merge_apfp_into_tags(tags, pages) -> list:
    """Store approved page handles in tags when approved_for_pages column is missing."""
    import json
    from urllib.parse import quote

    afp = "__apfp1:"
    rest = [t for t in (tags or []) if not str(t).startswith(afp)]
    if not isinstance(pages, list) or len(pages) == 0:
        return rest
    return rest + [afp + quote(json.dumps(pages), safe="")]


def _tracker_ideas_approved_for_pages_col_exists(client) -> bool:
    """True if approved_for_pages exists (migration_approved_for_pages.sql)."""
    c = getattr(_tracker_ideas_approved_for_pages_col_exists, "_cache", None)
    if c is not None:
        return c
    try:
        client.table("tracker_ideas").select("approved_for_pages").limit(1).execute()
        _tracker_ideas_approved_for_pages_col_exists._cache = True
    except Exception:
        _tracker_ideas_approved_for_pages_col_exists._cache = False
    return _tracker_ideas_approved_for_pages_col_exists._cache


def _tracker_ideas_writer_assets_cols_exist(client) -> tuple[bool, bool]:
    """(writer_comments, assets) column existence, cached."""
    c = getattr(_tracker_ideas_writer_assets_cols_exist, "_cache", None)
    if c is not None:
        return c
    writer_ok = False
    assets_ok = False
    try:
        client.table("tracker_ideas").select("writer_comments").limit(1).execute()
        writer_ok = True
    except Exception:
        writer_ok = False
    try:
        client.table("tracker_ideas").select("assets").limit(1).execute()
        assets_ok = True
    except Exception:
        assets_ok = False
    _tracker_ideas_writer_assets_cols_exist._cache = (writer_ok, assets_ok)
    return _tracker_ideas_writer_assets_cols_exist._cache


@app.get("/api/v1/tracker/ideas")
async def tracker_ideas_list(type: str | None = None):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    query = client.table("tracker_ideas").select("*, tracker_niches(id,name,pages), tracker_postings(*)").order("created_at", desc=True)
    if type:
        query = query.eq("type", type)
    ideas = query.execute().data or []
    return {"success": True, "data": ideas}


@app.post("/api/v1/tracker/ideas")
async def tracker_ideas_create(request: Request):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    body = await request.json()
    niche_ids = body.get("niche_ids") or []
    if not niche_ids:
        single = body.get("niche_id") or body.get("nicheId")
        if single:
            niche_ids = [single]

    writer_ok, assets_ok = _tracker_ideas_writer_assets_cols_exist(client)
    if body.get("writer_comments") is not None and not writer_ok:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot save writer comments: writer_comments column is missing on tracker_ideas. "
                "Run migrations/tracker_ideas_writer_comments_assets.sql in Supabase."
            ),
        )
    if body.get("assets") is not None and not assets_ok:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot save assets: assets column is missing on tracker_ideas. "
                "Run migrations/tracker_ideas_writer_comments_assets.sql in Supabase."
            ),
        )
    row = {
        "title": body["title"],
        "source": body.get("source", "original"),
        "niche_id": niche_ids[0] if niche_ids else None,
        "niche_ids": niche_ids,
        "stage": body.get("stage", "new"),
        "link": body.get("link"),
        "notes": body.get("notes"),
        "created_by": body.get("created_by"),
        "hook_variations": body.get("hook_variations") or [],
        "music_ref": body.get("music_ref"),
        "yt_url": body.get("yt_url"),
        "yt_timestamps": body.get("yt_timestamps"),
        "comp_link": body.get("comp_link"),
        "type": body.get("type", "reel"),
        "tags": body.get("tags") or [],
        "frame_link": body.get("frame_link"),
        "kalakar_link": body.get("kalakar_link"),
        "format": body.get("format"),
        "main_page_hook": body.get("main_page_hook"),
        "content_pillar": body.get("content_pillar"),
        "content_bucket": body.get("content_bucket"),
        "caption": body.get("caption"),
        "canva_link": body.get("canva_link"),
        "hook_text": body.get("hook_text"),
        "slides_content": body.get("slides_content"),
        "writer_comments": body.get("writer_comments") if writer_ok else None,
        "assets": body.get("assets") if assets_ok else None,
    }
    if body.get("approved_for_pages") is not None:
        row["approved_for_pages"] = body.get("approved_for_pages") or []
    # Remove None values so Supabase doesn't store explicit nulls for optional fields
    row = {k: v for k, v in row.items() if v is not None}
    row.setdefault("title", body["title"])
    # Keep legacy `link` in sync with comp_link so older clients and the UI agree.
    if "comp_link" in row:
        row["link"] = row["comp_link"]
    if not _tracker_ideas_approved_for_pages_col_exists(client):
        apv = row.pop("approved_for_pages", None)
        if apv is not None:
            row["tags"] = _merge_apfp_into_tags(row.get("tags") or [], apv if isinstance(apv, list) else [])
    result = client.table("tracker_ideas").insert(row).execute().data[0]
    return {"success": True, "data": result}


@app.put("/api/v1/tracker/ideas/{idea_id}")
async def tracker_ideas_update(idea_id: str, request: Request):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    body = await request.json()
    allowed_keys = {
        "title", "source", "niche_id", "niche_ids", "stage", "link", "notes",
        "hook_variations", "music_ref", "yt_url", "yt_timestamps", "comp_link",
        "type", "tags", "frame_link", "kalakar_link", "format", "main_page_hook",
        "content_pillar", "content_bucket", "caption", "canva_link",
        "hook_text", "slides_content",
        "writer_comments", "assets",
        # Bandwidth attribution fields (allow direct admin edits)
        "base_edit_by", "base_edit_at", "pintu_set_by", "pintu_set_at",
        "posted_by", "posted_at", "killed_by", "killed_at",
        "approved_for_pages",
    }
    allowed = {k: v for k, v in body.items() if k in allowed_keys}
    if "niche_ids" in allowed:
        allowed["niche_id"] = allowed["niche_ids"][0] if allowed["niche_ids"] else None
    if "comp_link" in allowed:
        allowed["link"] = allowed["comp_link"]

    writer_ok, assets_ok = _tracker_ideas_writer_assets_cols_exist(client)
    if ("writer_comments" in body) and (not writer_ok):
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot save writer comments: writer_comments column is missing on tracker_ideas. "
                "Run migrations/tracker_ideas_writer_comments_assets.sql in Supabase."
            ),
        )
    if ("assets" in body) and (not assets_ok):
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot save assets: assets column is missing on tracker_ideas. "
                "Run migrations/tracker_ideas_writer_comments_assets.sql in Supabase."
            ),
        )
    if not writer_ok:
        allowed.pop("writer_comments", None)
    if not assets_ok:
        allowed.pop("assets", None)

    # ---- Bandwidth stage-stamping --------------------------------------
    # When an idea transitions into one of the attributed stages, credit the
    # acting user (`actor` in body, set by the frontend to the logged-in
    # user's display name). Only stamps if the field isn't already set, so
    # re-entering a stage doesn't overwrite the original owner.
    new_stage = allowed.get("stage")
    actor = (body.get("actor") or "").strip() or None
    if new_stage and actor:
        try:
            existing = (
                client.table("tracker_ideas")
                .select("base_edit_by, pintu_set_by, posted_by, killed_by")
                .eq("id", idea_id)
                .execute()
                .data
                or []
            )
            current = existing[0] if existing else {}
        except Exception:
            current = {}
        from datetime import datetime as _dt
        now_iso = _dt.utcnow().isoformat()
        if new_stage == "base_edit" and not current.get("base_edit_by"):
            allowed.setdefault("base_edit_by", actor)
            allowed.setdefault("base_edit_at", now_iso)
        elif new_stage == "proven_ideas" and not current.get("pintu_set_by"):
            allowed.setdefault("pintu_set_by", actor)
            allowed.setdefault("pintu_set_at", now_iso)
        elif new_stage in ("posted", "uploaded") and not current.get("posted_by"):
            allowed.setdefault("posted_by", actor)
            allowed.setdefault("posted_at", now_iso)
        elif new_stage == "kill" and not current.get("killed_by"):
            allowed.setdefault("killed_by", actor)
            allowed.setdefault("killed_at", now_iso)

    bw_keys = {"base_edit_by", "base_edit_at", "pintu_set_by", "pintu_set_at", "posted_by", "posted_at", "killed_by", "killed_at"}
    # Did the client explicitly send a bandwidth field (e.g. user editing the
    # posted_at date picker)? If so we want a loud failure when the column is
    # missing; otherwise we silently strip to keep stage transitions working.
    user_explicit_bw = {k for k in bw_keys if k in body}

    # Probe once (cached on the function) whether the DB actually has the
    # bandwidth columns. This lets us raise a clear 400 BEFORE attempting the
    # update, instead of relying on exception-string sniffing after the fact
    # (supabase-py doesn't always raise on missing columns).
    if not hasattr(tracker_ideas_update, "_bw_cols_cache"):
        try:
            client.table("tracker_ideas").select("posted_at").limit(1).execute()
            tracker_ideas_update._bw_cols_cache = True
        except Exception:
            tracker_ideas_update._bw_cols_cache = False
    bw_cols_exist = tracker_ideas_update._bw_cols_cache

    if not bw_cols_exist:
        if user_explicit_bw:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Cannot save date: the posted_at/base_edit_at/pintu_set_at "
                    "columns don't exist on tracker_ideas in your Supabase DB. "
                    "Run the SQL in migrations/migration_bandwidth_fields.sql "
                    "(Supabase → SQL Editor) and try again."
                ),
            )
        # Auto-stamp path: silently drop so stage transitions still work.
        for k in bw_keys:
            allowed.pop(k, None)

    # Separate probe for the `killed_*` columns, which ship in a later
    # migration (migration_killed_fields.sql). If they're missing we quietly
    # strip the kill-stage stamps so the main update still succeeds — the
    # user will just miss the "Killed" bandwidth cell until they run it.
    if not hasattr(tracker_ideas_update, "_killed_cols_cache"):
        try:
            client.table("tracker_ideas").select("killed_at").limit(1).execute()
            tracker_ideas_update._killed_cols_cache = True
        except Exception:
            tracker_ideas_update._killed_cols_cache = False
    if not tracker_ideas_update._killed_cols_cache:
        for k in ("killed_by", "killed_at"):
            allowed.pop(k, None)

    if not _tracker_ideas_approved_for_pages_col_exists(client):
        if "approved_for_pages" in allowed:
            ap_body = body.get("approved_for_pages")
            allowed.pop("approved_for_pages", None)
            # Persist the selection via tags when the JSONB column is not deployed yet.
            if "tags" not in allowed and "approved_for_pages" in body and ap_body is not None:
                try:
                    row = (
                        client.table("tracker_ideas")
                        .select("tags")
                        .eq("id", idea_id)
                        .execute()
                        .data
                        or []
                    )[0] or {}
                    t = list(row.get("tags") or [])
                except Exception:
                    t = []
                allowed["tags"] = _merge_apfp_into_tags(t, ap_body if isinstance(ap_body, list) else [])

    try:
        client.table("tracker_ideas").update(allowed).eq("id", idea_id).execute()
    except Exception as e:
        msg = str(e).lower()
        # Some deployments may not have the reel-only kalakar_link column yet.
        # If missing, drop it and retry so the API doesn't crash other updates.
        if "kalakar_link" in msg and ("schema cache" in msg or "could not find" in msg or "column" in msg):
            allowed.pop("kalakar_link", None)
            try:
                client.table("tracker_ideas").update(allowed).eq("id", idea_id).execute()
                msg = ""  # handled
            except Exception as e2:
                msg = str(e2).lower()
        is_bw_err = any(k in msg for k in bw_keys) or "column" in msg or "schema cache" in msg
        if is_bw_err and user_explicit_bw:
            # Cache was wrong — bust it and raise so user sees the real issue.
            tracker_ideas_update._bw_cols_cache = False
            raise HTTPException(
                status_code=400,
                detail=(
                    "Cannot save date: posted_at column is missing. "
                    "Run migrations/migration_bandwidth_fields.sql in Supabase."
                ),
            )
        if is_bw_err:
            tracker_ideas_update._bw_cols_cache = False
            lean = {k: v for k, v in allowed.items() if k not in bw_keys and k != "kalakar_link"}
            if lean:
                client.table("tracker_ideas").update(lean).eq("id", idea_id).execute()
        else:
            raise

    # Re-fetch the full row (same shape as list) so clients see canva_link,
    # comp_link, postings, etc. Bandwidth checks still use the date fields here.
    try:
        fresh = (
            client.table("tracker_ideas")
            .select("*, tracker_niches(id,name,pages), tracker_postings(*)")
            .eq("id", idea_id)
            .single()
            .execute()
            .data
        )
    except Exception:
        fresh = None
    if not fresh:
        try:
            fresh = (
                client.table("tracker_ideas")
                .select("id, stage, posted_at, base_edit_at, pintu_set_at, posted_by, base_edit_by, pintu_set_by")
                .eq("id", idea_id)
                .single()
                .execute()
                .data
            )
        except Exception:
            fresh = None

    # If the user explicitly tried to set posted_at (or similar) and the
    # stored value doesn't match, surface that loudly. Compare by date-string
    # (YYYY-MM-DD) since we save as UTC noon.
    if fresh and user_explicit_bw:
        for k in user_explicit_bw:
            sent = body.get(k)
            got = fresh.get(k)
            if sent and got and str(sent)[:10] != str(got)[:10]:
                raise HTTPException(
                    status_code=500,
                    detail=(
                        f"Save mismatch on {k}: sent {str(sent)[:10]} but "
                        f"stored as {str(got)[:10]}. Contact the developer."
                    ),
                )
            if sent and not got:
                raise HTTPException(
                    status_code=500,
                    detail=(
                        f"Save failed: sent {k}={str(sent)[:10]} but the DB "
                        f"did not store it. The column may be missing or "
                        f"blocked by RLS."
                    ),
                )

    return {"success": True, "data": fresh}


@app.delete("/api/v1/tracker/ideas/{idea_id}")
async def tracker_ideas_delete(idea_id: str):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    client.table("tracker_ideas").delete().eq("id", idea_id).execute()
    return {"success": True}


@app.post("/api/v1/tracker/ideas/recover-comp-links")
async def tracker_recover_comp_links():
    """One-shot recovery: restores comp_link on competitor ideas that were
    auto-created from comp research but got wiped by the old frontend bug.

    Matches on title == (account_name or account_handle) in the appropriate
    competitor_* table. Only fills NULL comp_link and only when there's a
    single unambiguous match, so it's safe to re-run.
    """
    from app.database.client import get_supabase_client
    client = get_supabase_client()

    # Pull all candidate ideas (nulled comp_link, created from comp research)
    ideas = (
        client.table("tracker_ideas")
        .select("id,title,type,tags,comp_link,source")
        .eq("source", "competitor")
        .is_("comp_link", "null")
        .execute()
        .data
        or []
    )
    ideas = [i for i in ideas if "comp_research" in (i.get("tags") or [])]

    tables_for = {
        "reel": ["competitor_fbs_reels", "competitor_tech_reels"],
        "post": ["competitor_fbs_posts"],
    }

    restored, ambiguous, missing = [], [], []
    for idea in ideas:
        title = idea.get("title") or ""
        if not title:
            missing.append(idea["id"])
            continue
        tables = tables_for.get(idea.get("type") or "reel", tables_for["reel"])

        matches: list[str] = []
        for tbl in tables:
            # Match by account_name first
            rows = client.table(tbl).select("url").eq("account_name", title).execute().data or []
            if not rows:
                rows = client.table(tbl).select("url").eq("account_handle", title).execute().data or []
            for r in rows:
                u = (r.get("url") or "").strip()
                if u and u not in matches:
                    matches.append(u)

        if len(matches) == 1:
            client.table("tracker_ideas").update({"comp_link": matches[0]}).eq("id", idea["id"]).execute()
            restored.append({"id": idea["id"], "title": title, "url": matches[0]})
        elif len(matches) > 1:
            ambiguous.append({"id": idea["id"], "title": title, "candidates": matches})
        else:
            missing.append({"id": idea["id"], "title": title})

    return {
        "success": True,
        "restored": len(restored),
        "ambiguous": len(ambiguous),
        "missing": len(missing),
        "details": {"restored": restored, "ambiguous": ambiguous, "missing": missing},
    }


# --- Postings (with content_entries sync) ---

def _sync_posting_to_content_entry(client, posting_id: str):
    """Sync a tracker posting to content_entries so it shows in IP pages."""
    posting = client.table("tracker_postings").select("*, tracker_ideas(id,title,type)").eq("id", posting_id).execute().data
    if not posting:
        return
    p = posting[0]
    idea = p.get("tracker_ideas") or {}
    handle = p.get("page", "")
    if not handle:
        return

    # Find page_id by handle
    pages = client.table("pages").select("id").eq("handle", handle).execute().data
    if not pages:
        return
    page_id = pages[0]["id"]

    idea_name = idea.get("title", "")
    content_type = "carousel" if idea.get("type") == "post" else "reel"

    entry_data = {
        "page_id": page_id,
        "idea_name": idea_name,
        "content_type": content_type,
        "idea_status": "scheduled",
        "upload_date": p.get("date"),
        "views": p.get("views") or 0,
        "ips": handle,
        "created_by": "tracker",
    }

    # Upsert: check if entry exists for this idea+page combo
    existing = client.table("content_entries").select("id").eq("idea_name", idea_name).eq("ips", handle).execute().data
    if existing:
        client.table("content_entries").update(entry_data).eq("id", existing[0]["id"]).execute()
    else:
        client.table("content_entries").insert(entry_data).execute()


def _remove_content_entry_for_posting(client, posting_id: str):
    """Remove the synced content_entry when a posting is deleted."""
    posting = client.table("tracker_postings").select("page, tracker_ideas(title)").eq("id", posting_id).execute().data
    if not posting:
        return
    p = posting[0]
    idea = p.get("tracker_ideas") or {}
    handle = p.get("page", "")
    idea_name = idea.get("title", "")
    if handle and idea_name:
        client.table("content_entries").delete().eq("idea_name", idea_name).eq("ips", handle).eq("created_by", "tracker").execute()


@app.post("/api/v1/tracker/ideas/{idea_id}/postings")
async def tracker_postings_create(idea_id: str, request: Request):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    body = await request.json()
    row = {
        "idea_id": idea_id,
        "page": body["page"],
        "date": body.get("date"),
        "baseline_views": int(body.get("baseline_views") or body.get("baselineViews") or 0),
        "views": int(body["views"]) if body.get("views") is not None else None,
    }
    result = client.table("tracker_postings").insert(row).execute().data[0]
    # Sync to content_entries
    try:
        _sync_posting_to_content_entry(client, result["id"])
    except Exception:
        pass  # Don't fail the posting creation if sync fails
    return {"success": True, "data": result}


@app.put("/api/v1/tracker/postings/{posting_id}")
async def tracker_postings_update(posting_id: str, request: Request):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    body = await request.json()
    allowed = {k: v for k, v in body.items() if k in ("page", "date", "baseline_views", "views", "perf_tag")}
    if "views" in allowed and allowed["views"] is not None:
        allowed["views"] = int(allowed["views"])
    if "baseline_views" in allowed:
        allowed["baseline_views"] = int(allowed["baseline_views"])
    client.table("tracker_postings").update(allowed).eq("id", posting_id).execute()

    # Re-SELECT so the frontend can verify what was actually persisted. This
    # kills the class of "I picked 24 but it shows 16" bug where the client's
    # local state disagrees with DB reality after a refetch race.
    try:
        fresh = (
            client.table("tracker_postings")
            .select("id, idea_id, page, date, baseline_views, views, perf_tag")
            .eq("id", posting_id)
            .single()
            .execute()
            .data
        )
    except Exception:
        fresh = None

    # Loud check: if the client explicitly sent `date` and the stored value
    # doesn't match, raise so the frontend can surface it instead of pretending.
    if fresh is not None and "date" in body:
        sent_date = body.get("date")
        got_date = fresh.get("date")
        if sent_date and got_date and str(sent_date)[:10] != str(got_date)[:10]:
            raise HTTPException(
                status_code=500,
                detail=(
                    f"Posting date save mismatch: sent {str(sent_date)[:10]} "
                    f"but stored as {str(got_date)[:10]}. The DB may have a "
                    f"trigger or RLS policy mutating this value."
                ),
            )
        if sent_date and not got_date:
            raise HTTPException(
                status_code=500,
                detail=(
                    f"Posting date save failed: sent {str(sent_date)[:10]} "
                    f"but the DB did not store it."
                ),
            )

    # Sync to content_entries
    try:
        _sync_posting_to_content_entry(client, posting_id)
    except Exception:
        pass
    return {"success": True, "data": fresh}


@app.delete("/api/v1/tracker/postings/{posting_id}")
async def tracker_postings_delete(posting_id: str):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    # Remove synced content_entry first
    try:
        _remove_content_entry_for_posting(client, posting_id)
    except Exception:
        pass
    client.table("tracker_postings").delete().eq("id", posting_id).execute()
    return {"success": True}


# --- Bandwidth tracker ----------------------------------------------------
@app.get("/api/v1/bandwidth")
async def bandwidth_tracker(
    days: int = 14,
    type: str | None = None,
    start: str | None = None,
    end: str | None = None,
):
    """Per-person daily bandwidth across BOTH the reel pipeline (CS + CDI)
    and the post pipeline (CW).

    Reel metrics (type=reel):
      reel_comp        source=competitor, date=created_at
      reel_og          source=original,   date=created_at
      reel_base_edits  stage==base_edit
      reel_testing     stage==testing
      reel_pintu       stage==proven_ideas       (shown as "Proven ideas")
      reel_posted      stage==posted
      reel_killed      stage==kill

    Post metrics (type=post):
      post_comp        source=competitor, date=created_at
      post_og          source=original,   date=created_at
      post_mm          content_pillar==MM, date=created_at
      post_edits       stage==scripted
      post_posted      stage==uploaded

    Attribution uses the per-stage `*_by` stamps when available; otherwise
    falls back to `created_by`. Posted dates prefer `posted_at`, then the
    earliest `tracker_postings.date` for that idea, then `created_at`.

    `type` filter is optional: None (default) returns both pipelines so the
    frontend can pick slots per role; "reel" or "post" narrows the fetch.
    """
    from app.database.client import get_supabase_client
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    client = get_supabase_client()

    # Window resolution: a custom [start, end] pair (YYYY-MM-DD) takes
    # precedence over `days`. If only one of start/end is provided, anchor
    # the other to today. Falls back to the "last N days ending today"
    # behavior when neither is given.
    today = _dt.now(_tz.utc).date()

    def _parse_iso(s: str | None):
        if not s:
            return None
        try:
            return _dt.strptime(str(s)[:10], "%Y-%m-%d").date()
        except Exception:
            return None

    start_date = _parse_iso(start)
    end_date = _parse_iso(end)

    if start_date or end_date:
        # Custom range mode.
        if start_date and not end_date:
            end_date = today
        if end_date and not start_date:
            start_date = end_date - _td(days=13)  # 14-day default span
        if start_date > end_date:  # type: ignore[operator]
            start_date, end_date = end_date, start_date
        # Clamp to a sane upper bound so someone doesn't request 5 years.
        if (end_date - start_date).days > 365:  # type: ignore[operator]
            start_date = end_date - _td(days=365)  # type: ignore[operator]
        window_start = start_date
        window_end = end_date
    else:
        days = max(1, min(int(days or 14), 365))
        window_end = today
        window_start = today - _td(days=days - 1)

    # Try to select the Bandwidth attribution columns; if they don't exist
    # yet (migration not run), fall back to a lean select. Everything still
    # works because the fallbacks use created_by + created_at.
    full_cols = (
        "id, title, source, type, stage, niche_id, niche_ids, content_pillar, "
        "created_at, created_by, "
        "base_edit_by, base_edit_at, pintu_set_by, pintu_set_at, "
        "posted_by, posted_at, killed_by, killed_at"
    )
    # Columns without killed_* (for older DBs missing the killed migration).
    mid_cols = (
        "id, title, source, type, stage, niche_id, niche_ids, content_pillar, "
        "created_at, created_by, "
        "base_edit_by, base_edit_at, pintu_set_by, pintu_set_at, "
        "posted_by, posted_at"
    )
    lean_cols = (
        "id, title, source, type, stage, niche_id, niche_ids, content_pillar, "
        "created_at, created_by"
    )
    try:
        q = client.table("tracker_ideas").select(full_cols)
        if type:
            q = q.eq("type", type)
        ideas = q.execute().data or []
    except Exception:
        # First fallback: same bandwidth cols minus killed_* (for DBs that
        # ran migration_bandwidth_fields.sql but not migration_killed_fields.sql).
        try:
            q = client.table("tracker_ideas").select(mid_cols)
            if type:
                q = q.eq("type", type)
            ideas = q.execute().data or []
        except Exception:
            q = client.table("tracker_ideas").select(lean_cols)
            if type:
                q = q.eq("type", type)
            ideas = q.execute().data or []

    niches = client.table("tracker_niches").select("id,name,pages").execute().data or []

    # Pull postings so we can use the real posting date as the "posted_at"
    # fallback for historical ideas that were marked posted before the
    # posted_at column existed. We key by idea_id -> earliest posting date.
    try:
        postings = client.table("tracker_postings").select("idea_id,date").execute().data or []
    except Exception:
        postings = []
    earliest_posting_date: dict[str, str] = {}
    for p in postings:
        iid = p.get("idea_id")
        d = p.get("date")
        if not iid or not d:
            continue
        d_str = str(d)[:10]
        prev = earliest_posting_date.get(iid)
        if prev is None or d_str < prev:
            earliest_posting_date[iid] = d_str

    # ---- niche -> team key (garfields / goofies) -------------------------
    # Mirrors teamPerformanceCompute.ts substring match.
    NICHE_TEAM_SUBSTRINGS = {"garfields": "garfields", "goofies": "goofies"}
    niche_id_to_team: dict[str, str] = {}
    for n in niches:
        nm = str(n.get("name") or "").lower()
        for team_key, sub in NICHE_TEAM_SUBSTRINGS.items():
            if sub in nm:
                niche_id_to_team[n["id"]] = team_key
                break

    def _idea_team(idea: dict) -> str | None:
        nid = idea.get("niche_id")
        if nid and nid in niche_id_to_team:
            return niche_id_to_team[nid]
        for x in idea.get("niche_ids") or []:
            if x in niche_id_to_team:
                return niche_id_to_team[x]
        return None

    def _norm_name(raw) -> str:
        if not raw:
            return ""
        s = str(raw).strip()
        if "@" in s:
            s = s.split("@")[0]
        s = s.replace(".", " ").replace("_", " ").replace("-", " ").strip()
        if not s:
            return ""
        return " ".join(w.capitalize() for w in s.split() if w)

    def _date_key(ts: str | None) -> str | None:
        if not ts:
            return None
        # Handles "2025-12-08T10:30:00Z" and "2025-12-08 10:30:00+00" etc.
        try:
            d = _dt.fromisoformat(str(ts).replace("Z", "+00:00")).astimezone(_tz.utc).date()
        except Exception:
            try:
                d = _dt.fromisoformat(str(ts)[:10]).date()
            except Exception:
                return None
        return d.isoformat()

    def _in_window(d_iso: str | None) -> bool:
        if not d_iso:
            return False
        try:
            d = _dt.fromisoformat(d_iso).date()
        except Exception:
            return False
        return window_start <= d <= window_end

    METRIC_KEYS = (
        # Reel pipeline (CS creates, CDI edits + posts)
        "reel_comp", "reel_og", "reel_base_edits", "reel_testing",
        "reel_pintu", "reel_posted", "reel_killed",
        # Post pipeline (CW creates + edits + posts)
        "post_comp", "post_og", "post_mm", "post_edits", "post_posted",
    )

    def _empty_day_row(date_iso: str) -> dict:
        return {"date": date_iso, **{k: 0 for k in METRIC_KEYS}}

    # person_name -> { niches: Counter, daily: { date: {...} }, totals: {...} }
    people: dict[str, dict] = {}
    team_totals: dict[str, dict[str, int]] = {
        "garfields": {k: 0 for k in METRIC_KEYS},
        "goofies": {k: 0 for k in METRIC_KEYS},
        "unassigned": {k: 0 for k in METRIC_KEYS},
    }

    def _bump(name: str, niche_team: str | None, date_iso: str, metric: str):
        if not name:
            return
        rec = people.setdefault(name, {
            "name": name,
            "niche_counts": {"garfields": 0, "goofies": 0, "unassigned": 0},
            "daily": {},
            "totals": {k: 0 for k in METRIC_KEYS},
        })
        nk = niche_team if niche_team in ("garfields", "goofies") else "unassigned"
        rec["niche_counts"][nk] += 1
        day = rec["daily"].setdefault(date_iso, _empty_day_row(date_iso))
        day[metric] += 1
        rec["totals"][metric] += 1
        team_totals[nk][metric] += 1

    # Each metric is counted only when the idea is currently sitting in that
    # exact kanban column, matching what the user sees in the trackers.
    REEL_STAGE_BASE_EDIT = {"base_edit"}
    REEL_STAGE_TESTING   = {"testing"}
    REEL_STAGE_PINTU     = {"proven_ideas"}
    REEL_STAGE_POSTED    = {"posted"}
    STAGE_KILLED         = {"kill"}
    POST_STAGE_EDITS     = {"scripted"}
    POST_STAGE_POSTED    = {"uploaded"}

    def _pillar_tag_set(raw) -> set[str]:
        """Parse content_pillar: single value, comma- or pipe-separated multi-tags."""
        if not raw:
            return set()
        s = str(raw).strip().lower()
        out: set[str] = set()
        for chunk in s.replace("\n", ",").split(","):
            for p in chunk.split("|"):
                t = p.strip()
                if t:
                    out.add(t)
        return out

    for idea in ideas:
        niche_team = _idea_team(idea)
        idea_id = idea.get("id")
        stage = (idea.get("stage") or "").lower()
        created_by = idea.get("created_by")
        created_at_day = _date_key(idea.get("created_at"))
        idea_type = (idea.get("type") or "reel").lower()
        source = str(idea.get("source") or "original").lower()
        pillar_tags = _pillar_tag_set(idea.get("content_pillar"))

        # ----- REEL PIPELINE --------------------------------------------------
        if idea_type == "reel":
            # Comp / OG at creation time.
            if created_at_day and _in_window(created_at_day):
                name = _norm_name(created_by)
                if name:
                    metric = "reel_comp" if source == "competitor" else "reel_og"
                    _bump(name, niche_team, created_at_day, metric)

            # Base edits: currently sitting in base_edit column.
            if stage in REEL_STAGE_BASE_EDIT:
                be_day = _date_key(idea.get("base_edit_at")) or created_at_day
                be_name = _norm_name(idea.get("base_edit_by") or created_by)
                if be_day and be_name and _in_window(be_day):
                    _bump(be_name, niche_team, be_day, "reel_base_edits")

            # Testing: currently sitting in the testing column. No dedicated
            # `testing_by` column yet — the CDI who did the base edit owns the
            # testing loop, so we credit base_edit_by (falling back to the
            # creator). Date is base_edit_at if we have it, otherwise the
            # idea's created_at.
            if stage in REEL_STAGE_TESTING:
                te_day = _date_key(idea.get("base_edit_at")) or created_at_day
                te_name = _norm_name(idea.get("base_edit_by") or created_by)
                if te_day and te_name and _in_window(te_day):
                    _bump(te_name, niche_team, te_day, "reel_testing")

            # Pintu: currently sitting in proven_ideas column.
            if stage in REEL_STAGE_PINTU:
                ps_day = _date_key(idea.get("pintu_set_at")) or created_at_day
                ps_name = _norm_name(idea.get("pintu_set_by") or created_by)
                if ps_day and ps_name and _in_window(ps_day):
                    _bump(ps_name, niche_team, ps_day, "reel_pintu")

            # Posted: currently sitting in posted column.
            if stage in REEL_STAGE_POSTED:
                po_day = (
                    _date_key(idea.get("posted_at"))
                    or earliest_posting_date.get(idea_id)
                    or created_at_day
                )
                po_name = _norm_name(idea.get("posted_by") or created_by)
                if po_day and po_name and _in_window(po_day):
                    _bump(po_name, niche_team, po_day, "reel_posted")

            # Killed: currently sitting in kill column. Credit the explicit
            # killed_by stamp when we have it; otherwise fall back to whoever
            # was most recently working on it (base editor / tester) or the
            # creator. Same fallback chain for the date.
            if stage in STAGE_KILLED:
                ki_day = (
                    _date_key(idea.get("killed_at"))
                    or _date_key(idea.get("base_edit_at"))
                    or created_at_day
                )
                ki_name = _norm_name(
                    idea.get("killed_by")
                    or idea.get("base_edit_by")
                    or created_by
                )
                if ki_day and ki_name and _in_window(ki_day):
                    _bump(ki_name, niche_team, ki_day, "reel_killed")

        # ----- POST PIPELINE --------------------------------------------------
        elif idea_type == "post":
            # Comp / OG at creation time.
            if created_at_day and _in_window(created_at_day):
                name = _norm_name(created_by)
                if name:
                    metric = "post_comp" if source == "competitor" else "post_og"
                    _bump(name, niche_team, created_at_day, metric)

                    # MM is a content-pillar tag; counted at creation too, in
                    # addition to the comp/og bucket above (so a Kaavya MM OG
                    # post shows up in BOTH OG and MM slots).
                    if "mm" in pillar_tags:
                        _bump(name, niche_team, created_at_day, "post_mm")

            # Edits: currently sitting in the "Scripted" column.
            if stage in POST_STAGE_EDITS:
                ed_day = _date_key(idea.get("base_edit_at")) or created_at_day
                ed_name = _norm_name(idea.get("base_edit_by") or created_by)
                if ed_day and ed_name and _in_window(ed_day):
                    _bump(ed_name, niche_team, ed_day, "post_edits")

            # Posted: stage == uploaded on the post pipeline.
            if stage in POST_STAGE_POSTED:
                po_day = (
                    _date_key(idea.get("posted_at"))
                    or earliest_posting_date.get(idea_id)
                    or created_at_day
                )
                po_name = _norm_name(idea.get("posted_by") or created_by)
                if po_day and po_name and _in_window(po_day):
                    _bump(po_name, niche_team, po_day, "post_posted")

    # Fill in missing days with zero rows so the frontend can draw a clean
    # sparkline without holes.
    all_days: list[str] = []
    d = window_start
    while d <= window_end:
        all_days.append(d.isoformat())
        d += _td(days=1)

    people_out = []
    for rec in people.values():
        # Pick primary niche for the person = whichever they show up in most.
        nc = rec["niche_counts"]
        primary_niche = max(nc, key=lambda k: nc[k])
        if nc[primary_niche] == 0:
            primary_niche = "unassigned"
        daily_filled = [rec["daily"].get(d_iso, _empty_day_row(d_iso)) for d_iso in all_days]
        people_out.append({
            "name": rec["name"],
            "niche_guess": primary_niche,
            "niche_counts": rec["niche_counts"],
            "totals": rec["totals"],
            "daily": daily_filled,
        })

    # Sort by total activity in window, descending.
    people_out.sort(
        key=lambda p: sum(p["totals"].values()),
        reverse=True,
    )

    return {
        "success": True,
        "data": {
            "window_start": window_start.isoformat(),
            "window_end": window_end.isoformat(),
            "days": (window_end - window_start).days + 1,
            "type": type,
            "all_days": all_days,
            "metric_keys": list(METRIC_KEYS),
            "people": people_out,
            "team_totals": team_totals,
        },
    }


# --- Migrate old ideas to tracker ---
@app.post("/api/v1/tracker/migrate")
async def tracker_migrate():
    """One-time migration: copies ideas from the old `ideas` table into tracker_ideas.
    Creates two niches (FBS, Tech) based on page handle classification.
    Maps old statuses to new stages."""
    from app.database.client import get_supabase_client
    client = get_supabase_client()

    # Create niches if they don't exist
    existing_niches = client.table("tracker_niches").select("id,name").execute().data or []
    niche_map = {n["name"]: n["id"] for n in existing_niches}

    if "FBS" not in niche_map:
        fbs = client.table("tracker_niches").insert({"name": "FBS", "pages": []}).execute().data[0]
        niche_map["FBS"] = fbs["id"]
    if "Tech" not in niche_map:
        tech = client.table("tracker_niches").insert({"name": "Tech", "pages": []}).execute().data[0]
        niche_map["Tech"] = tech["id"]

    # Fetch old ideas
    old_ideas = client.table("ideas").select("*").execute().data or []

    # Status mapping: old → new stage
    status_to_stage = {
        "draft": "new",
        "active": "approved",
        "in_progress": "base_edit",
        "completed": "done",
        "ready": "testing",
        "exhausted": "done",
    }

    migrated = 0
    skipped = 0
    for idea in old_ideas:
        # Skip if already migrated (check by title match)
        title = idea.get("hook", "")
        if not title:
            skipped += 1
            continue

        existing = client.table("tracker_ideas").select("id").eq("title", title).execute().data

        # Determine niche from source or default to FBS
        niche_id = niche_map["FBS"]  # default

        old_status = idea.get("status", "draft")
        stage = status_to_stage.get(old_status, "new")

        source = "competitor" if idea.get("source") == "repurposed" else "original"
        row = {
            "title": title,
            "source": source,
            "niche_id": niche_id,
            "stage": stage,
            "created_by": idea.get("created_by") or idea.get("executor_name") or None,
            "hook_variations": idea.get("hook_variations") or [],
            "music_ref": None,
            "yt_url": idea.get("yt_url") or None,
            "yt_timestamps": idea.get("timestamps") or None,
            "comp_link": idea.get("comp_link") or None,
            "type": "reel",
        }
        # If already exists, UPDATE it with full data instead of skipping
        if existing:
            client.table("tracker_ideas").update(row).eq("id", existing[0]["id"]).execute()
            migrated += 1
            continue

        client.table("tracker_ideas").insert(row).execute()
        migrated += 1

    return {"success": True, "migrated": migrated, "skipped": skipped}


@app.post("/api/v1/tracker/sync-team-niches")
async def tracker_sync_team_niches():
    """Idempotent sync of the Garfields/Goofies niche roster:

    1. Upserts every canonical handle into `pages` so the 6-day tracker
       filter and leaderboard page aggregates can see them.
    2. Replaces `tracker_niches.pages` for each FBS niche with the
       canonical list (overwrites stale aliases).

    Safe to re-run. Does not delete or modify tracker_ideas.
    """
    from app.database.client import get_supabase_client
    client = get_supabase_client()

    # Display names keyed by handle — used when we need to create a page row.
    DISPLAY_NAMES = {
        # Garfields
        "bizzindia": "Bizz India",
        "startupbydog": "Startupbydog",
        "indianbusinesscom": "Indian Business Com",
        "entrepreneursindia.co": "Entrepreneursindia.co",
        "therealfoundr": "The Real Foundr",
        "elitefoundrs": "Elite Founders",
        "foundersindex": "Founders Index",
        # Goofies
        "101xfounders": "101xfounders",
        "foundersinindia": "Founders In India",
        "startupcoded": "Startup Coded",
        # Sherus
        "thechangingorder": "The Changing Order",
        "101xtechnology": "101x Technology",
        "startupswtf": "Startups WTF",
        # Experiment X
        "indianfoundersco": "Indian Founders Co",
        "indiastartupstory": "India Startup Story",
        "indiabusinesscom": "India Business Com",
        "indiafounderscore": "India Founders Core",
        "indiafounderbrief": "India Founder Brief",
        "entrepreneurial.india": "Entrepreneurial.India",
        "indiantechdaily": "India Tech Daily",
        "ai.cracked": "AI Cracked",
    }

    all_handles = sorted({
        *[h.lstrip("@").strip().lower() for h in GARFIELDS_HANDLES],
        *[h.lstrip("@").strip().lower() for h in GOOFIES_HANDLES],
        *[h.lstrip("@").strip().lower() for h in SHERUS_HANDLES],
        *[h.lstrip("@").strip().lower() for h in EXPERIMENT_BPB_HANDLES],
        *[h.lstrip("@").strip().lower() for h in EXPERIMENT_XF_HANDLES],
        *[h.lstrip("@").strip().lower() for h in TECH_NICHE_HANDLES],
        *[h.lstrip("@").strip().lower() for h in EXPERIMENT_TECH_HANDLES],
    })

    # 1) Ensure each handle has a row in `pages`
    existing_pages = client.table("pages").select("id,handle").execute().data or []
    existing_handles = {str(p.get("handle") or "").lower() for p in existing_pages}

    inserted_pages: list[str] = []
    for h in all_handles:
        if h in existing_handles:
            continue
        client.table("pages").insert({
            "handle": h,
            "name": DISPLAY_NAMES.get(h, h),
            "profile_url": f"https://www.instagram.com/{h}/",
            "auto_scrape": False,
            "stage": 1,
        }).execute()
        inserted_pages.append(h)

    # 2) Sync niche memberships
    existing = client.table("tracker_niches").select("id,name").execute().data or []
    niche_map = {n["name"]: n["id"] for n in existing}

    desired = {
        "FBS - Garfields": GARFIELDS_HANDLES,
        "FBS - Goofies": GOOFIES_HANDLES,
        "FBS - Sherus": SHERUS_HANDLES,
        "FBS - The Bizz playbook": EXPERIMENT_BPB_HANDLES,
        "FBS - Experiment BPB": EXPERIMENT_BPB_HANDLES,
        "FBS - XF Playbook": EXPERIMENT_XF_HANDLES,
        "FBS - TECH Playbook": EXPERIMENT_TECH_HANDLES,
        "Tech": TECH_NICHE_HANDLES,
        # Legacy niche name (same pages as BPB)
        "FBS - Experiment X": EXPERIMENT_BPB_HANDLES,
    }

    synced = {}
    for name, pages in desired.items():
        clean = [str(h).lstrip("@").strip().lower() for h in pages if h]
        if name in niche_map:
            client.table("tracker_niches").update({"pages": clean}).eq("id", niche_map[name]).execute()
        else:
            client.table("tracker_niches").insert({"name": name, "pages": clean}).execute()
        synced[name] = {"count": len(clean), "pages": clean}

    return {
        "success": True,
        "pages_inserted": inserted_pages,
        "pages_inserted_count": len(inserted_pages),
        "synced": synced,
    }


@app.post("/api/v1/tracker/populate-niche-pages")
async def tracker_populate_niche_pages():
    """Populate niche pages from the existing pages table + hardcoded Marketing niche."""
    from app.database.client import get_supabase_client
    client = get_supabase_client()

    # Get all pages from the pages table
    all_pages = client.table("pages").select("handle").execute().data or []
    handles = [p["handle"] for p in all_pages if p.get("handle")]

    # Classify using same logic as frontend
    tech_handles = []
    fbs_handles = []
    for h in handles:
        lower = h.lower()
        if "tech" in lower or lower in ("ai.cracked", "goodai", "indianaipage", "neworderai"):
            tech_handles.append(h)
        else:
            fbs_handles.append(h)

    marketing_handles = [
        "mktg.crunch", "themahaanmarketing", "marketingvenom",
        "therisingbrands", "mktg.wtf", "101xMarketing",
    ]

    garfields_handles = GARFIELDS_HANDLES
    goofies_handles = GOOFIES_HANDLES

    # Ensure niches exist and update their pages
    existing = client.table("tracker_niches").select("id,name").execute().data or []
    niche_map = {n["name"]: n["id"] for n in existing}

    updates = {
        "FBS - Garfields": garfields_handles,
        "FBS - Goofies": goofies_handles,
        "Tech": tech_handles,
        "Marketing": marketing_handles,
    }

    for name, pages in updates.items():
        if name in niche_map:
            client.table("tracker_niches").update({"pages": pages}).eq("id", niche_map[name]).execute()
        else:
            client.table("tracker_niches").insert({"name": name, "pages": pages}).execute()

    # Migrate old FBS ideas to Garfields by default (can be manually reassigned)
    if "FBS" in niche_map and "FBS - Garfields" in niche_map:
        old_fbs_id = niche_map["FBS"]
        new_garfields_id = niche_map["FBS - Garfields"]
        client.table("tracker_ideas").update({"niche_id": new_garfields_id}).eq("niche_id", old_fbs_id).execute()
        # Delete old FBS niche
        client.table("tracker_niches").delete().eq("id", old_fbs_id).execute()

    return {
        "success": True,
        "FBS - Garfields": len(garfields_handles),
        "FBS - Goofies": len(goofies_handles),
        "Tech": len(tech_handles),
        "Marketing": len(marketing_handles),
    }


# ===================== 6-Day Performance Tracker =====================
# Cycles are deterministic — never stored, always computed:
#   Cycle 1: 1st–6th  |  Cycle 2: 7th–12th  |  Cycle 3: 13th–18th
#   Cycle 4: 19th–24th  |  Cycle 5: 25th–end-of-month

import calendar as _cal


def _six_day_cycles(year: int, month: int) -> list[dict]:
    last = _cal.monthrange(year, month)[1]
    return [
        {"cycle": 1, "start": f"{year}-{month:02d}-01", "end": f"{year}-{month:02d}-06",
         "deadline": f"{year}-{month:02d}-07"},
        {"cycle": 2, "start": f"{year}-{month:02d}-07", "end": f"{year}-{month:02d}-12",
         "deadline": f"{year}-{month:02d}-13"},
        {"cycle": 3, "start": f"{year}-{month:02d}-13", "end": f"{year}-{month:02d}-18",
         "deadline": f"{year}-{month:02d}-19"},
        {"cycle": 4, "start": f"{year}-{month:02d}-19", "end": f"{year}-{month:02d}-24",
         "deadline": f"{year}-{month:02d}-25"},
        {"cycle": 5, "start": f"{year}-{month:02d}-25", "end": f"{year}-{month:02d}-{last:02d}",
         "deadline": f"{year}-{month:02d}-{last:02d}"},
    ]


@app.get("/api/v1/six-day/month/{month_str}")
async def six_day_month_data(month_str: str):
    """Return all cycles, entries, top-content and actuals for a month (YYYY-MM).
    Cycles are computed; entries/top-content/actuals come from the DB."""
    from app.database.client import get_supabase_client
    client = get_supabase_client()

    parts = month_str.split("-")
    year, mon = int(parts[0]), int(parts[1])
    month_date = f"{year}-{mon:02d}-01"
    cycles = _six_day_cycles(year, mon)

    def _fetch_pages():
        return client.table("pages").select("id,handle,name,stage").order("name").execute().data or []

    def _fetch_entries():
        return (
            client.table("six_day_entries")
            .select("*")
            .eq("month", month_date)
            .execute()
            .data
            or []
        )

    def _fetch_top():
        return (
            client.table("six_day_top_content")
            .select("*")
            .eq("month", month_date)
            .order("views", desc=True)
            .execute()
            .data
            or []
        )

    def _fetch_actuals():
        return (
            client.table("six_day_monthly_actuals")
            .select("*")
            .eq("month", month_date)
            .execute()
            .data
            or []
        )

    def _fetch_config():
        return client.table("six_day_config").select("*").limit(1).execute().data

    pages, entries, top_content, actuals, config = await asyncio.gather(
        asyncio.to_thread(_fetch_pages),
        asyncio.to_thread(_fetch_entries),
        asyncio.to_thread(_fetch_top),
        asyncio.to_thread(_fetch_actuals),
        asyncio.to_thread(_fetch_config),
    )
    config_row = config[0] if config else None

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    for c in cycles:
        c["status"] = "upcoming" if today < c["start"] else ("active" if today <= c["end"] else "done")
        c_entries = [e for e in entries if e["cycle_number"] == c["cycle"]]
        c_top = [t for t in top_content if t["cycle_number"] == c["cycle"]]
        filled_pids = {e["page_id"] for e in c_entries}
        for t in c_top:
            pid = t.get("page_id")
            if pid:
                filled_pids.add(pid)
        c["entries"] = c_entries
        c["filled_count"] = len(filled_pids)
        c["total_pages"] = len(pages)
        c["top_content"] = c_top
        page_content: dict[str, list] = {}
        for t in c_top:
            pid = t.get("page_id") or "unknown"
            page_content.setdefault(pid, []).append(t)
        c["page_content"] = page_content

    actuals_map = {a["page_id"]: a for a in actuals}

    page_summaries = []
    for p in pages:
        pid = p["id"]
        cycle_views = sum(e["views"] or 0 for e in entries if e["page_id"] == pid)
        actual_row = actuals_map.get(pid)
        actual_views = actual_row["actual_views"] if actual_row else None
        page_summaries.append({
            "page_id": pid,
            "handle": p["handle"],
            "name": p.get("name"),
            "stage": p.get("stage", 1),
            "cycle_views_sum": cycle_views,
            "actual_views": actual_views,
            "drift": (actual_views - cycle_views) if actual_views is not None else None,
            "actual_row": actual_row,
        })

    page_summaries.sort(key=lambda x: x["cycle_views_sum"], reverse=True)

    return {
        "success": True,
        "data": {
            "month": month_str,
            "month_date": month_date,
            "cycles": cycles,
            "pages": [{"id": p["id"], "handle": p["handle"], "name": p.get("name"), "stage": p.get("stage", 1)} for p in pages],
            "page_summaries": page_summaries,
            "top_content": top_content,
            "config": config_row,
        },
    }


# --- Upsert entry (one IP, one cycle) ---
@app.post("/api/v1/six-day/entries")
async def six_day_entries_upsert(request: Request):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    body = await request.json()
    month = body["month"]
    cycle_number = int(body["cycle_number"])
    page_id = body["page_id"]
    views = int(body.get("views", 0))
    filled_by = body.get("filled_by", "")

    row = {
        "month": month,
        "cycle_number": cycle_number,
        "page_id": page_id,
        "views": views,
        "filled_by": filled_by,
        "filled_at": datetime.now(timezone.utc).isoformat(),
    }
    # Numeric perf values (decimals allowed)
    def _opt_num(v):
        if v is None or v == "":
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None
    if "reel_perf" in body:
        row["reel_perf"] = _opt_num(body.get("reel_perf"))
    if "post_perf" in body:
        row["post_perf"] = _opt_num(body.get("post_perf"))
    if "reel_pct" in body:
        rp = body.get("reel_pct")
        if rp is None or rp == "":
            row["reel_pct"] = None
        else:
            try:
                row["reel_pct"] = max(0, min(100, int(rp)))
            except (TypeError, ValueError):
                row["reel_pct"] = None
    if "post_pct" in body:
        pp = body.get("post_pct")
        if pp is None or pp == "":
            row["post_pct"] = None
        else:
            try:
                row["post_pct"] = max(0, min(100, int(pp)))
            except (TypeError, ValueError):
                row["post_pct"] = None

    existing = (
        client.table("six_day_entries")
        .select("id")
        .eq("month", month)
        .eq("cycle_number", cycle_number)
        .eq("page_id", page_id)
        .execute()
        .data
    )
    if existing:
        result = client.table("six_day_entries").update(row).eq("id", existing[0]["id"]).execute().data[0]
    else:
        result = client.table("six_day_entries").insert(row).execute().data[0]
    return {"success": True, "data": result}


# --- Bulk-save entries for a whole cycle ---
@app.post("/api/v1/six-day/entries/bulk")
async def six_day_entries_bulk(request: Request):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    body = await request.json()
    month = body["month"]
    cycle_number = int(body["cycle_number"])
    items = body.get("entries", [])
    filled_by = body.get("filled_by", "")
    now_ts = datetime.now(timezone.utc).isoformat()

    saved = 0
    for item in items:
        page_id = item["page_id"]
        views = int(item.get("views", 0))
        row = {
            "month": month, "cycle_number": cycle_number,
            "page_id": page_id, "views": views,
            "filled_by": filled_by, "filled_at": now_ts,
        }
        existing = (
            client.table("six_day_entries")
            .select("id").eq("month", month)
            .eq("cycle_number", cycle_number).eq("page_id", page_id)
            .execute().data
        )
        if existing:
            client.table("six_day_entries").update(row).eq("id", existing[0]["id"]).execute()
        else:
            client.table("six_day_entries").insert(row).execute()
        saved += 1

    return {"success": True, "saved": saved}


@app.delete("/api/v1/six-day/entries/{entry_id}")
async def six_day_entries_delete(entry_id: str):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    client.table("six_day_entries").delete().eq("id", entry_id).execute()
    return {"success": True}


# --- Top Content ---
@app.post("/api/v1/six-day/top-content")
async def six_day_top_content_create(request: Request):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    body = await request.json()
    page_id = body.get("page_id")
    page_handle = body.get("page_handle", "")
    if page_id and not page_handle:
        p = client.table("pages").select("handle").eq("id", page_id).execute().data
        if p:
            page_handle = p[0]["handle"]
    row = {
        "month": body["month"],
        "cycle_number": int(body["cycle_number"]),
        "link": body["link"],
        "views": int(body.get("views", 0)),
        "page_handle": page_handle,
        "page_id": page_id,
        "content_type": body.get("content_type", "reel"),
        "perf_tag": body.get("perf_tag"),
    }
    result = client.table("six_day_top_content").insert(row).execute().data[0]
    return {"success": True, "data": result}


@app.put("/api/v1/six-day/top-content/{item_id}")
async def six_day_top_content_update(item_id: str, request: Request):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    body = await request.json()
    allowed = {k: v for k, v in body.items() if k in ("link", "views", "page_handle", "content_type", "page_id", "perf_tag")}
    if "views" in allowed:
        allowed["views"] = int(allowed["views"])
    client.table("six_day_top_content").update(allowed).eq("id", item_id).execute()
    return {"success": True}


@app.delete("/api/v1/six-day/top-content/{item_id}")
async def six_day_top_content_delete(item_id: str):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    client.table("six_day_top_content").delete().eq("id", item_id).execute()
    return {"success": True}


# --- Monthly Actuals (reconciliation) ---
@app.post("/api/v1/six-day/actuals")
async def six_day_actuals_upsert(request: Request):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    body = await request.json()
    month = body["month"]
    page_id = body["page_id"]
    actual_views = int(body.get("actual_views", 0))
    filled_by = body.get("filled_by", "")
    notes = body.get("notes", "")

    row = {
        "month": month, "page_id": page_id,
        "actual_views": actual_views, "notes": notes,
        "filled_by": filled_by,
        "filled_at": datetime.now(timezone.utc).isoformat(),
    }

    existing = (
        client.table("six_day_monthly_actuals")
        .select("id").eq("month", month).eq("page_id", page_id)
        .execute().data
    )
    if existing:
        result = client.table("six_day_monthly_actuals").update(row).eq("id", existing[0]["id"]).execute().data[0]
    else:
        result = client.table("six_day_monthly_actuals").insert(row).execute().data[0]
    return {"success": True, "data": result}


# --- Config (who is assigned) ---
@app.get("/api/v1/six-day/config")
async def six_day_config_get():
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    data = client.table("six_day_config").select("*").limit(1).execute().data
    return {"success": True, "data": data[0] if data else None}


@app.post("/api/v1/six-day/config")
async def six_day_config_set(request: Request):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    body = await request.json()
    existing = client.table("six_day_config").select("id").limit(1).execute().data
    row = {
        "assigned_email": body.get("assigned_email", ""),
        "assigned_role": body.get("assigned_role", ""),
    }
    if existing:
        result = client.table("six_day_config").update(row).eq("id", existing[0]["id"]).execute().data[0]
    else:
        result = client.table("six_day_config").insert(row).execute().data[0]
    return {"success": True, "data": result}


# --- Deadline feed for the 6-day tracker ---
@app.get("/api/v1/six-day/deadlines")
async def six_day_deadlines():
    """Returns unfilled cycles whose deadline has passed or is today."""
    from app.database.client import get_supabase_client
    client = get_supabase_client()

    now = datetime.now(timezone.utc)
    year, mon = now.year, now.month
    month_date = f"{year}-{mon:02d}-01"
    today = now.strftime("%Y-%m-%d")
    cycles = _six_day_cycles(year, mon)

    pages = client.table("pages").select("id,handle,name").execute().data or []
    entries = (
        client.table("six_day_entries")
        .select("page_id,cycle_number")
        .eq("month", month_date)
        .execute()
        .data or []
    )
    top_rows = (
        client.table("six_day_top_content")
        .select("page_id,cycle_number")
        .eq("month", month_date)
        .execute()
        .data or []
    )
    filled_set = {(e["page_id"], e["cycle_number"]) for e in entries}
    for t in top_rows:
        pid = t.get("page_id")
        if pid:
            filled_set.add((pid, t["cycle_number"]))

    overdue = []
    for c in cycles:
        if today >= c["deadline"]:
            missing = [p for p in pages if (p["id"], c["cycle"]) not in filled_set]
            if missing:
                overdue.append({
                    "cycle": c["cycle"],
                    "start": c["start"],
                    "end": c["end"],
                    "deadline": c["deadline"],
                    "missing_count": len(missing),
                    "missing_pages": [{"id": p["id"], "handle": p["handle"], "name": p.get("name")} for p in missing[:5]],
                })

    config = client.table("six_day_config").select("*").limit(1).execute().data
    return {
        "success": True,
        "data": {
            "overdue_cycles": overdue,
            "config": config[0] if config else None,
        },
    }


# --- Per-IP 6-day data (shown on the IP detail page) ---
@app.get("/api/v1/six-day/page/{page_id}")
async def six_day_page_data(page_id: str, month: str | None = None):
    """Return 6-day cycle data for a single IP, used on the IP detail page."""
    from app.database.client import get_supabase_client
    client = get_supabase_client()

    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")

    parts = month.split("-")
    year, mon = int(parts[0]), int(parts[1])
    month_date = f"{year}-{mon:02d}-01"
    cycles = _six_day_cycles(year, mon)

    entries = (
        client.table("six_day_entries")
        .select("*")
        .eq("month", month_date)
        .eq("page_id", page_id)
        .execute()
        .data or []
    )
    entry_map = {e["cycle_number"]: e for e in entries}

    top_content = (
        client.table("six_day_top_content")
        .select("*")
        .eq("month", month_date)
        .order("views", desc=True)
        .execute()
        .data or []
    )

    page_info = client.table("pages").select("handle").eq("id", page_id).execute().data
    handle = page_info[0]["handle"] if page_info else ""
    page_top = [t for t in top_content if (t.get("page_handle") or "").lower() == handle.lower()]

    actual_row = (
        client.table("six_day_monthly_actuals")
        .select("*")
        .eq("month", month_date)
        .eq("page_id", page_id)
        .execute()
        .data
    )

    cycle_views_sum = sum(e.get("views", 0) or 0 for e in entries)
    actual_views = actual_row[0]["actual_views"] if actual_row else None

    cycle_data = []
    for c in cycles:
        entry = entry_map.get(c["cycle"])
        cycle_data.append({
            "cycle": c["cycle"],
            "start": c["start"],
            "end": c["end"],
            "views": entry["views"] if entry else None,
            "filled": entry is not None,
        })

    return {
        "success": True,
        "data": {
            "month": month,
            "cycles": cycle_data,
            "cycle_views_sum": cycle_views_sum,
            "actual_views": actual_views,
            "drift": (actual_views - cycle_views_sum) if actual_views is not None else None,
            "top_content": page_top[:10],
        },
    }


# --- Tickets (v1) -----------------------------------------------------------

def _require_env(name: str) -> str:
    v = (os.getenv(name) or "").strip()
    if not v:
        raise HTTPException(status_code=500, detail=f"Missing server env var: {name}")
    return v


def _cloudinary_signature(params: dict, api_secret: str) -> str:
    """
    Cloudinary signature: sha1("k1=v1&k2=v2...{api_secret}") for sorted keys.
    Excludes file/api_key/resource_type/cloud_name.
    """
    signable = {
        k: v
        for k, v in params.items()
        if v is not None and k not in {"file", "api_key", "resource_type", "cloud_name"}
    }
    pairs = [f"{k}={signable[k]}" for k in sorted(signable.keys())]
    base = "&".join(pairs) + api_secret
    return hashlib.sha1(base.encode("utf-8")).hexdigest()


@app.post("/api/v1/tickets")
async def create_ticket(request: Request):
    client = get_supabase_client()
    body = await request.json()
    description = (body.get("description") or "").strip()
    if not description:
        raise HTTPException(status_code=400, detail="description is required")
    urgency = (body.get("urgency") or "normal").strip().lower()
    status = (body.get("status") or "not_started").strip().lower()
    tags = body.get("tags") or []
    if tags is None or not isinstance(tags, list):
        raise HTTPException(status_code=400, detail="tags must be a list")

    title = (body.get("title") or "").strip()
    if not title:
        title = description.splitlines()[0].strip()[:120] if description else "Ticket"

    payload = {
        "title": title,
        "description": description,
        "urgency": urgency,
        "status": status,
        "tags": tags,
        "reporter_email": body.get("reporter_email"),
        "assigned_to_email": body.get("assigned_to_email"),
        "attachments": body.get("attachments") or [],
    }
    try:
        out = client.table("tickets").insert(payload).execute().data or []
        row = out[0] if out else payload
        return {"success": True, "data": row}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create ticket: {str(e)}")


@app.get("/api/v1/tickets")
async def list_tickets(
    status: str | None = None,
    urgency: str | None = None,
    assigned_to_email: str | None = None,
    reporter_email: str | None = None,
):
    client = get_supabase_client()
    try:
        q = client.table("tickets").select("*").order("created_at", desc=True)
        if status:
            q = q.eq("status", status)
        if urgency:
            q = q.eq("urgency", urgency)
        if assigned_to_email:
            q = q.eq("assigned_to_email", assigned_to_email)
        if reporter_email:
            q = q.eq("reporter_email", reporter_email)
        rows = q.execute().data or []
        return {"success": True, "data": rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list tickets: {str(e)}")


@app.get("/api/v1/tickets/{ticket_id}")
async def get_ticket(ticket_id: str):
    client = get_supabase_client()
    try:
        rows = (
            client.table("tickets")
            .select("*")
            .eq("id", ticket_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            raise HTTPException(status_code=404, detail="Ticket not found")
        return {"success": True, "data": rows[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load ticket: {str(e)}")


@app.patch("/api/v1/tickets/{ticket_id}")
async def patch_ticket(ticket_id: str, request: Request):
    client = get_supabase_client()
    body = await request.json()
    allowed = {
        "title",
        "description",
        "urgency",
        "status",
        "tags",
        "assigned_to_email",
        "attachments",
        "resolved_at",
    }
    patch = {k: v for k, v in body.items() if k in allowed}
    if "status" in patch:
        st = (patch.get("status") or "").strip().lower()
        patch["status"] = st
        if st == "resolved" and not patch.get("resolved_at"):
            patch["resolved_at"] = datetime.now(timezone.utc).isoformat()
        if st != "resolved":
            patch["resolved_at"] = None
    try:
        rows = (
            client.table("tickets")
            .update(patch)
            .eq("id", ticket_id)
            .execute()
            .data
            or []
        )
        if not rows:
            raise HTTPException(status_code=404, detail="Ticket not found")
        return {"success": True, "data": rows[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update ticket: {str(e)}")


@app.delete("/api/v1/tickets/{ticket_id}")
async def delete_ticket(ticket_id: str):
    client = get_supabase_client()
    try:
        rows = (
            client.table("tickets")
            .delete()
            .eq("id", ticket_id)
            .execute()
            .data
            or []
        )
        if not rows:
            raise HTTPException(status_code=404, detail="Ticket not found")
        return {"success": True, "data": rows[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete ticket: {str(e)}")


@app.post("/api/v1/tickets/cloudinary-sign")
async def tickets_cloudinary_sign(request: Request):
    """
    Returns signed upload params for direct-from-browser uploads.

    Body: { ticket_id, ticket_number, uploader, resource_type? }
    """
    cloud_name = _require_env("CLOUDINARY_CLOUD_NAME")
    api_key = _require_env("CLOUDINARY_API_KEY")
    api_secret = _require_env("CLOUDINARY_API_SECRET")

    body = await request.json()
    ticket_id = str(body.get("ticket_id") or "").strip()
    ticket_number = str(body.get("ticket_number") or "").strip()
    uploader = str(body.get("uploader") or "").strip()
    if not ticket_id or not ticket_number:
        raise HTTPException(status_code=400, detail="ticket_id and ticket_number are required")

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=7)
    timestamp = int(now.timestamp())

    folder = f"tickets/{ticket_number}"
    tags = ",".join(
        [
            "tickets",
            f"ticket_number_{ticket_number}",
            f"ticket_id_{ticket_id}",
        ]
        + ([f"uploader_{uploader.split('@')[0]}"] if uploader else [])
    )
    context_parts = [
        f"ticket_id={ticket_id}",
        f"ticket_number={ticket_number}",
        f"expires_at={expires_at.isoformat()}",
    ]
    if uploader:
        context_parts.append(f"uploader={uploader}")
    context = "|".join(context_parts)

    params = {
        "timestamp": timestamp,
        "folder": folder,
        "tags": tags,
        "context": context,
    }
    signature = _cloudinary_signature(params, api_secret)

    upload_url = f"https://api.cloudinary.com/v1_1/{cloud_name}/auto/upload"
    return {
        "success": True,
        "data": {
            "cloud_name": cloud_name,
            "api_key": api_key,
            "timestamp": timestamp,
            "signature": signature,
            "upload_url": upload_url,
            "folder": folder,
            "tags": tags,
            "context": context,
            "expires_at": expires_at.isoformat(),
        },
    }


@app.post("/api/v1/tracker/ideas/{idea_id}/cloudinary-sign")
async def tracker_idea_cloudinary_sign(idea_id: str, request: Request):
    """
    Returns signed upload params for direct-from-browser uploads for tracker ideas.

    Body: { uploader, resource_type? }
    """
    cloud_name = _require_env("CLOUDINARY_CLOUD_NAME")
    api_key = _require_env("CLOUDINARY_API_KEY")
    api_secret = _require_env("CLOUDINARY_API_SECRET")

    body = await request.json()
    uploader = str(body.get("uploader") or "").strip()

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=30)
    timestamp = int(now.timestamp())

    folder = f"tracker-ideas/{idea_id}"
    tags = ",".join(["tracker_ideas", f"tracker_idea_id_{idea_id}"] + ([f"uploader_{uploader.split('@')[0]}"] if uploader else []))
    context_parts = [f"tracker_idea_id={idea_id}", f"expires_at={expires_at.isoformat()}"]
    if uploader:
        context_parts.append(f"uploader={uploader}")
    context = "|".join(context_parts)

    params = {
        "timestamp": timestamp,
        "folder": folder,
        "tags": tags,
        "context": context,
    }
    signature = _cloudinary_signature(params, api_secret)
    upload_url = f"https://api.cloudinary.com/v1_1/{cloud_name}/auto/upload"
    return {
        "success": True,
        "data": {
            "cloud_name": cloud_name,
            "api_key": api_key,
            "timestamp": timestamp,
            "signature": signature,
            "upload_url": upload_url,
            "folder": folder,
            "tags": tags,
            "context": context,
            "expires_at": expires_at.isoformat(),
        },
    }


# ===================== X (Twitter) Feed =====================

_TWITTER_BEARER = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I%2BxP1Rf%2FI4TXCdY%3D"

_X_SEARCH_QUERIES = [
    "Indian startup funding India -filter:retweets",
    "Shark Tank India founder Indian brand -filter:retweets",
    "India unicorn IPO funding announcement -filter:retweets",
    "Indian billionaire startup business India -filter:retweets",
    "Make in India MSME startup news -filter:retweets",
]


def _x_headers() -> tuple[dict, bool]:
    """Build Twitter request headers from env cookies. Returns (headers, ok)."""
    auth_token = os.environ.get("X_AUTH_TOKEN", "")
    ct0 = os.environ.get("X_CT0", "")
    kdt = os.environ.get("X_KDT", "")
    twid = os.environ.get("X_TWID", "")

    if not auth_token or not ct0:
        return {}, False

    cookie_parts = [f"auth_token={auth_token}", f"ct0={ct0}"]
    if kdt:
        cookie_parts.append(f"kdt={kdt}")
    if twid:
        cookie_parts.append(f"twid={twid}")

    headers = {
        "authorization": f"Bearer {_TWITTER_BEARER}",
        "cookie": "; ".join(cookie_parts),
        "x-csrf-token": ct0,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
        "x-twitter-client-language": "en",
        "accept-language": "en-US,en;q=0.9",
    }
    return headers, True


@app.get("/api/v1/x-keepalive")
async def x_keepalive():
    """Lightweight daily ping to keep the X session active.
    Call this once every 24h (e.g. via Supabase cron or external scheduler)
    so Twitter sees the session as in-use and may extend the cookie expiry."""
    headers, ok = _x_headers()
    if not ok:
        return {"success": False, "error": "X credentials not configured"}
    try:
        resp = http_req.get(
            "https://api.twitter.com/1.1/account/verify_credentials.json",
            params={"skip_status": "true", "include_entities": "false"},
            headers=headers,
            timeout=10,
        )
        return {
            "success": resp.status_code == 200,
            "status_code": resp.status_code,
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/v1/x-feed")
async def x_feed():
    headers, ok = _x_headers()
    if not ok:
        return {"trends": [], "tweets": [], "as_of": datetime.now(timezone.utc).isoformat(), "error": "X credentials not configured"}

    # 1. India trending topics (WOEID 23424848)
    trends = []
    try:
        resp = http_req.get(
            "https://api.twitter.com/1.1/trends/place.json",
            params={"id": "23424848"},
            headers=headers,
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list) and data:
                trends = data[0].get("trends", [])[:20]
    except Exception:
        pass

    # 2. Recent India startup/business tweets (Explorer-style search)
    tweets: list[dict] = []
    seen_ids: set = set()
    for query in _X_SEARCH_QUERIES[:3]:
        try:
            resp = http_req.get(
                "https://api.twitter.com/1.1/search/tweets.json",
                params={
                    "q": query,
                    "lang": "en",
                    "result_type": "recent",
                    "count": "8",
                    "tweet_mode": "extended",
                },
                headers=headers,
                timeout=10,
            )
            if resp.status_code == 200:
                for tweet in (resp.json().get("statuses") or []):
                    tid = tweet.get("id_str")
                    if not tid or tid in seen_ids:
                        continue
                    seen_ids.add(tid)
                    user = tweet.get("user", {})
                    tweets.append({
                        "id": tid,
                        "text": tweet.get("full_text") or tweet.get("text", ""),
                        "created_at": tweet.get("created_at", ""),
                        "user_name": user.get("name", ""),
                        "user_screen_name": user.get("screen_name", ""),
                        "favorites": tweet.get("favorite_count", 0),
                        "retweets": tweet.get("retweet_count", 0),
                        "url": f"https://x.com/{user.get('screen_name')}/status/{tid}",
                    })
        except Exception:
            pass

    return {
        "trends": trends,
        "tweets": tweets[:20],
        "as_of": datetime.now(timezone.utc).isoformat(),
    }


# ===================== Reddit Feed =====================

_REDDIT_SUBREDDITS = [
    ("BusinessTodayNews", "hot"),
    ("IndiaBusiness", "hot"),
    ("indianstartups", "hot"),
    ("TechnologyNewsIndia", "hot"),
    ("IndianStockMarket", "hot"),
    ("IndianWorkplace", "hot"),
    ("india", "hot"),
]

_REDDIT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; NewsFeedReader/1.0)",
    "Accept": "application/json",
}


@app.get("/api/v1/reddit-feed")
async def reddit_feed():
    posts: list[dict] = []
    seen_ids: set = set()

    for subreddit, sort in _REDDIT_SUBREDDITS:
        try:
            resp = http_req.get(
                f"https://old.reddit.com/r/{subreddit}/{sort}.json",
                params={"limit": "25", "t": "day"},
                headers=_REDDIT_HEADERS,
                timeout=12,
            )
            if resp.status_code != 200:
                continue
            for child in (resp.json().get("data", {}).get("children") or []):
                post = child.get("data", {})
                pid = post.get("id")
                if not pid or pid in seen_ids:
                    continue
                seen_ids.add(pid)
                body = (post.get("selftext") or "").strip()
                posts.append({
                    "id": pid,
                    "title": post.get("title", ""),
                    "body": body[:500] if body else None,
                    "url": post.get("url", ""),
                    "permalink": f"https://reddit.com{post.get('permalink', '')}",
                    "subreddit": post.get("subreddit", subreddit),
                    "score": post.get("score", 0),
                    "num_comments": post.get("num_comments", 0),
                    "author": post.get("author", ""),
                    "created_utc": post.get("created_utc", 0),
                    "is_self": post.get("is_self", False),
                })
        except Exception:
            pass

    return {
        "posts": posts,
        "as_of": datetime.now(timezone.utc).isoformat(),
    }


# ===================== Inshorts Feed =====================

_INSHORTS_CATEGORIES = ["startup", "business", "technology"]
_INSHORTS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}
_INSHORTS_STATE_RE = re.compile(r"window\.__STATE__\s*=\s*(\{.*?\})\s*;\s*</script>", re.DOTALL)
_inshorts_cache: dict = {"articles": [], "as_of": "", "expires_at": 0.0}


def _parse_inshorts_html(html: str, category: str) -> list[dict]:
    match = _INSHORTS_STATE_RE.search(html)
    if not match:
        return []

    try:
        state = json.loads(match.group(1))
    except json.JSONDecodeError:
        return []

    articles: list[dict] = []
    for entry in (state.get("news_list") or {}).get("list") or []:
        obj = entry.get("news_obj") or {}
        hash_id = (obj.get("hash_id") or "").strip()
        title = (obj.get("title") or "").strip()
        if not hash_id or not title:
            continue

        created_ms = obj.get("created_at")
        published_at = ""
        if isinstance(created_ms, (int, float)) and created_ms > 1e12:
            published_at = datetime.fromtimestamp(created_ms / 1000, tz=timezone.utc).isoformat()

        old_hash_id = (obj.get("old_hash_id") or "").strip()
        inshorts_url = (
            f"https://inshorts.com/en/news/{old_hash_id}"
            if old_hash_id
            else (obj.get("shortened_url") or "").strip()
        )
        source_url = (obj.get("source_url") or "").strip()

        articles.append({
            "id": hash_id,
            "hash_id": hash_id,
            "title": title,
            "content": (obj.get("content") or "").strip(),
            "author": (obj.get("author_name") or "").strip(),
            "source_name": (obj.get("source_name") or "").strip(),
            "source_url": source_url,
            "inshorts_url": inshorts_url,
            "url": source_url or inshorts_url,
            "category": category,
            "published_at": published_at,
        })
    return articles


def _fetch_inshorts_articles() -> tuple[list[dict], str]:
    now = time.time()
    if _inshorts_cache["articles"] and now < _inshorts_cache["expires_at"]:
        return _inshorts_cache["articles"], _inshorts_cache["as_of"]

    articles: list[dict] = []
    seen_ids: set[str] = set()

    for category in _INSHORTS_CATEGORIES:
        try:
            resp = http_req.get(
                f"https://inshorts.com/en/read/{category}",
                headers=_INSHORTS_HEADERS,
                timeout=15,
            )
            if resp.status_code != 200:
                continue
            for item in _parse_inshorts_html(resp.text, category):
                if item["hash_id"] in seen_ids:
                    continue
                seen_ids.add(item["hash_id"])
                articles.append(item)
        except Exception:
            pass

    articles.sort(
        key=lambda a: a.get("published_at") or "",
        reverse=True,
    )

    as_of = datetime.now(timezone.utc).isoformat()
    _inshorts_cache["articles"] = articles
    _inshorts_cache["as_of"] = as_of
    _inshorts_cache["expires_at"] = now + 600  # 10 min

    return articles, as_of


@app.get("/api/v1/inshorts-feed")
async def inshorts_feed():
    articles, as_of = _fetch_inshorts_articles()
    return {
        "articles": articles,
        "as_of": as_of,
        "count": len(articles),
    }


# ===================== LinkedIn Feed =====================

@app.post("/api/v1/linkedin-feed/ingest")
async def linkedin_feed_ingest(request: Request):
    """Receive LinkedIn posts from n8n. Deduplicates by URL."""
    client = get_supabase_client()
    body = await request.json()
    items = body if isinstance(body, list) else [body]
    inserted, skipped = 0, 0
    for item in items:
        url = (item.get("url") or "").strip()
        if not url:
            skipped += 1
            continue
        if client.table("linkedin_feed").select("id").eq("url", url).execute().data:
            skipped += 1
            continue
        client.table("linkedin_feed").insert({
            "name": (item.get("name") or "").strip(),
            "body": (item.get("body") or "").strip(),
            "url": url,
            "published_at": (item.get("publishedAt") or "").strip() or None,
            "likes": int(item.get("likes") or 0),
            "comments": int(item.get("comments") or 0),
            "author_url": (item.get("authorUrl") or "").strip() or None,
        }).execute()
        inserted += 1
    return {"success": True, "inserted": inserted, "skipped": skipped}


@app.get("/api/v1/linkedin-feed")
async def linkedin_feed_list():
    """Return posts not yet shown OR shown today. Marks unseen posts as shown today."""
    client = get_supabase_client()
    today = datetime.now(timezone.utc).date().isoformat()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=3)).strftime("%Y-%m-%d")

    data = (
        client.table("linkedin_feed")
        .select("*")
        .gte("published_at", cutoff)
        .or_(f"shown_on.is.null,shown_on.eq.{today}")
        .order("published_at", desc=True)
        .execute()
        .data
    )

    # Mark unseen posts as shown today
    unseen_ids = [row["id"] for row in data if not row.get("shown_on")]
    for uid in unseen_ids:
        client.table("linkedin_feed").update({"shown_on": today}).eq("id", uid).execute()

    return {"success": True, "data": data}


# ===================== News Articles (Tavily → Supabase) =====================

_NEWS_DOMAINS = [
    "inc42.com", "yourstory.com", "entrackr.com", "moneycontrol.com",
    "economictimes.indiatimes.com", "firstpost.com", "business-standard.com",
    "thehindubusinessline.com", "businessinsider.in", "indianstartupnews.com",
    "fortuneindia.com", "indiatoday.in", "indianexpress.com", "livemint.com",
    "techcrunch.com",
]

_NEWS_QUERIES = [
    "India startup founder breaking news today viral",
    "Indian billionaire businessman wealth India trending today",
    "India startup unicorn IPO funding announcement today",
    "Shark Tank India founder Indian brand viral news",
    "India business scandal controversy trending today",
    "popular Indian company startup founder news today",
    "Indian startup funding unicorn IPO India today",
    "Shark Tank India founders Indian brands D2C news today",
    "Indian founder startup valuation revenue profit India",
    "Make in India MSME Startup India news today",
    "India breaking startup business news today",
    "Indian billionaire businessman wealth India news",
    "popular Indian company brand news today",
    "Indian unicorn decacorn IPO funding announcement",
]

_INDIA_KEYWORDS = [
    "india", "indian", "shark tank", "msme", "rupee", "crore", "lakh",
    "zepto", "zomato", "swiggy", "ola", "paytm", "flipkart", "meesho",
    "mamaearth", "boat", "cred", "zerodha", "groww", "nykaa", "blinkit",
    "razorpay", "freshworks", "infosys", "tata", "reliance", "adani",
    "ambani", "mukesh", "ratan", "byju", "unacademy", "vedantu",
    "bengaluru", "bangalore", "mumbai", "delhi", "hyderabad", "pune",
    "oyo", "myntra", "bigbasket", "urban company",
    "nazara", "dream11", "khatabook", "ofbusiness",
    "namita", "anupam mittal", "aman gupta", "kunal shah", "ghazal",
    "nikhil kamath", "nithin kamath", "peyush bansal", "vineeta singh",
]

_NEWS_SOURCE_MAP = {
    "inc42.com": "Inc42", "yourstory.com": "YourStory", "entrackr.com": "Entrackr",
    "moneycontrol.com": "Moneycontrol", "economictimes.indiatimes.com": "Economic Times",
    "firstpost.com": "Firstpost", "business-standard.com": "Business Standard",
    "thehindubusinessline.com": "Hindu BL", "businessinsider.in": "Business Insider",
    "indianstartupnews.com": "Indian Startup News", "fortuneindia.com": "Fortune India",
    "indiatoday.in": "India Today", "indianexpress.com": "Indian Express",
    "livemint.com": "Mint", "techcrunch.com": "TechCrunch",
}


def _news_source_label(url: str) -> str:
    try:
        from urllib.parse import urlparse
        host = urlparse(url).hostname.replace("www.", "")
        for k, v in _NEWS_SOURCE_MAP.items():
            if k in host:
                return v
        return host
    except:
        return "News"


@app.post("/api/v1/news-articles/scrape")
def news_articles_scrape():
    """Fetch from Tavily and store in news_articles. Idempotent — skips if already scraped today."""
    import requests as req_lib

    tavily_key = os.environ.get("TAVILY_API_KEY", "")
    if not tavily_key:
        raise HTTPException(status_code=500, detail="TAVILY_API_KEY not configured on server")

    client = get_supabase_client()

    today = datetime.now(timezone.utc).date().isoformat()
    existing = client.table("news_articles").select("id").gte("created_at", today).limit(1).execute().data
    if existing:
        return {"success": True, "message": "already scraped today", "inserted": 0}

    results = []
    for query in _NEWS_QUERIES:
        try:
            r = req_lib.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": tavily_key,
                    "query": query,
                    "topic": "news",
                    "days": 2,
                    "max_results": 20,
                    "search_depth": "advanced",
                    "include_answer": False,
                    "include_domains": _NEWS_DOMAINS,
                },
                timeout=20,
            )
            results.append(r.json().get("results", []) if r.ok else [])
        except:
            results.append([])

    seen: set = set()
    items = []
    three_days_ago = datetime.now(timezone.utc) - timedelta(days=3)

    for result_list in results:
        for item in result_list:
            url = (item.get("url") or "").strip()
            if not url or url in seen or not item.get("title") or not item.get("published_date"):
                continue
            try:
                pub = datetime.fromisoformat(item["published_date"].replace("Z", "+00:00"))
                if pub.tzinfo is None:
                    pub = pub.replace(tzinfo=timezone.utc)
                if pub < three_days_ago:
                    continue
            except:
                continue
            text = f"{item['title']} {item.get('content', '')}".lower()
            if not any(k in text for k in _INDIA_KEYWORDS):
                continue
            seen.add(url)
            items.append({
                "title": item["title"],
                "url": url,
                "body": (item.get("content") or "")[:500],
                "source": _news_source_label(url),
                "published_date": item["published_date"],
            })

    inserted = 0
    for item in items:
        try:
            client.table("news_articles").insert(item).execute()
            inserted += 1
        except:
            pass

    return {"success": True, "inserted": inserted, "total_found": len(items)}


@app.get("/api/v1/news-articles")
async def news_articles_list():
    """Return news articles from the last 2 days."""
    client = get_supabase_client()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    data = (
        client.table("news_articles")
        .select("*")
        .gte("created_at", cutoff)
        .order("created_at", desc=True)
        .execute()
        .data
    )
    return {"success": True, "data": data}


# ===================== News Feed Feedback =====================

@app.post("/api/v1/news-feed/feedback")
async def news_feed_feedback(request: Request):
    """Upsert a yes/no vote for an article URL."""
    client = get_supabase_client()
    body = await request.json()
    url = (body.get("article_url") or "").strip()
    vote = body.get("vote")
    if not url or vote not in ("yes", "no"):
        raise HTTPException(status_code=400, detail="article_url and vote (yes/no) required")
    client.table("news_feed_feedback").upsert({
        "article_url": url,
        "vote": vote,
        "article_title": body.get("article_title", ""),
        "article_type": body.get("article_type", ""),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="article_url").execute()
    return {"success": True}


@app.get("/api/v1/news-feed/feedback")
async def news_feed_feedback_list():
    """Return all feedback votes."""
    client = get_supabase_client()
    data = client.table("news_feed_feedback").select("article_url,vote").execute().data
    return {"success": True, "data": data}


# ===================== News Feed Saved =====================

@app.post("/api/v1/news-feed/saved")
async def news_feed_saved_add(request: Request):
    """Save an article."""
    client = get_supabase_client()
    body = await request.json()
    url = (body.get("article_url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="article_url required")
    client.table("news_feed_saved").upsert({
        "article_url": url,
        "article_data": body.get("article_data", {}),
    }, on_conflict="article_url").execute()
    return {"success": True}


@app.delete("/api/v1/news-feed/saved/{article_url:path}")
async def news_feed_saved_remove(article_url: str):
    """Remove a saved article."""
    client = get_supabase_client()
    client.table("news_feed_saved").delete().eq("article_url", article_url).execute()
    return {"success": True}


@app.get("/api/v1/news-feed/saved")
async def news_feed_saved_list():
    """Return all saved articles."""
    client = get_supabase_client()
    data = client.table("news_feed_saved").select("article_url,article_data").order("created_at", desc=True).execute().data
    return {"success": True, "data": data}


# =============================================================================
# Playbook Experiments (BPB / XF / TECH) — Idea Tracking System
# =============================================================================
def _exp_settings_row(client, playbook: str) -> dict:
    tables = get_playbook_tables(playbook)
    data = client.table(tables.settings).select("*").limit(1).execute().data
    if data:
        return data[0]
    from datetime import date
    # Align start date with existing ideas so week filters don't show empty after settings reset.
    earliest = (
        client.table(tables.idea_bank)
        .select("day_date")
        .order("day_date")
        .limit(1)
        .execute()
        .data
        or []
    )
    start_date = str(date.today())
    if earliest and earliest[0].get("day_date"):
        start_date = str(earliest[0]["day_date"])
    inserted = client.table(tables.settings).insert({
        "view_goal": 100000,
        "experiment_start_date": start_date,
    }).execute().data
    return inserted[0] if inserted else {}


def _exp_compute_week_number(client, playbook: str, day_date_str: str) -> int:
    """Compute 1-based week number relative to experiment_start_date in playbook settings."""
    from datetime import date
    row = _exp_settings_row(client, playbook)
    start_raw = row.get("experiment_start_date") or str(date.today())
    start = date.fromisoformat(str(start_raw)[:10])
    target = date.fromisoformat(str(day_date_str)[:10])
    delta = (target - start).days
    return max(1, (delta // 7) + 1)


def _exp_week_label(client, playbook: str, week_number: int) -> str:
    """Generate 'Week N · Mon DD – Mon DD' label."""
    from datetime import date, timedelta
    row = _exp_settings_row(client, playbook)
    start_raw = row.get("experiment_start_date") or str(date.today())
    start = date.fromisoformat(str(start_raw)[:10])
    week_start = start + timedelta(weeks=week_number - 1)
    week_end = week_start + timedelta(days=6)
    try:
        fmt = lambda d: d.strftime("%b %-d")
        return f"Week {week_number} · {fmt(week_start)} – {fmt(week_end)}"
    except Exception:
        return f"Week {week_number}"


def _exp_flag_working_idea(client, playbook: str, idea: dict, view_goal: int):
    """Insert into playbook working_ideas if not already flagged for this source_id."""
    tables = get_playbook_tables(playbook)
    source_id = idea.get("id")
    existing = (
        client.table(tables.working_ideas)
        .select("id")
        .eq("source_id", source_id)
        .execute()
        .data
    )
    if existing:
        return
    client.table(tables.working_ideas).insert({
        "source_id": source_id,
        "page_handle": idea.get("page_handle", ""),
        "content_type": idea.get("content_type", "reel"),
        "topic": idea.get("topic", ""),
        "script": idea.get("script", ""),
        "views_achieved": idea.get("views", 0),
        "goal_threshold": view_goal,
        "week_number": idea.get("week_number", 1),
        "day_date": str(idea.get("day_date", "")),
    }).execute()


def _exp_idea_query(client, playbook: str):
    tables = get_playbook_tables(playbook)
    return client.table(tables.idea_bank).select("*")


def _exp_content_query(client, playbook: str):
    tables = get_playbook_tables(playbook)
    return client.table(tables.content_bank).select("*")


def _exp_working_query(client, playbook: str):
    tables = get_playbook_tables(playbook)
    return client.table(tables.working_ideas).select("*")


@app.get("/api/v1/experiment/{playbook}/settings")
async def exp_get_settings(playbook: str):
    pb = validate_playbook(playbook)
    client = get_supabase_client()
    return {"success": True, "data": _exp_settings_row(client, pb)}


@app.get("/api/v1/experiment/settings")
async def exp_get_settings_legacy():
    return await exp_get_settings(DEFAULT_PLAYBOOK)


@app.patch("/api/v1/experiment/{playbook}/settings")
async def exp_update_settings(playbook: str, req: ExpSettingsUpdate):
    from datetime import date
    pb = validate_playbook(playbook)
    client = get_supabase_client()
    tables = get_playbook_tables(pb)
    update_data = {k: v for k, v in req.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    existing = client.table(tables.settings).select("id").limit(1).execute().data or []
    if existing:
        client.table(tables.settings).update(update_data).eq("id", existing[0]["id"]).execute()
    else:
        update_data.setdefault("view_goal", 100000)
        update_data.setdefault("experiment_start_date", str(date.today()))
        client.table(tables.settings).insert(update_data).execute()
    return {"success": True, "data": _exp_settings_row(client, pb)}


@app.patch("/api/v1/experiment/settings")
async def exp_update_settings_legacy(req: ExpSettingsUpdate):
    return await exp_update_settings(DEFAULT_PLAYBOOK, req)


@app.get("/api/v1/experiment/{playbook}/idea-bank")
async def exp_list_idea_bank(
    playbook: str,
    week: int | None = None,
    page: str | None = None,
    day_date: str | None = None,
    enrich_cross: str | None = None,
):
    pb = validate_playbook(playbook)
    client = get_supabase_client()
    q = _exp_idea_query(client, pb).order("day_date", desc=False).order("created_at", desc=False)
    if day_date:
        q = q.eq("day_date", day_date)
    elif week is not None:
        q = q.eq("week_number", week)
    if page:
        q = q.eq("page_handle", page)
    data = q.execute().data or []
    do_enrich = enrich_cross not in ("0", "false", "False")
    if do_enrich:
        try:
            data = exp_enrich_ideas_cross_playbook(client, pb, data)
        except Exception as e:
            logger.warning("Cross-playbook enrich failed for %s: %s", pb, e)
    return {"success": True, "data": data}


@app.get("/api/v1/experiment/idea-bank")
async def exp_list_idea_bank_legacy(week: int | None = None, page: str | None = None, day_date: str | None = None):
    return await exp_list_idea_bank(DEFAULT_PLAYBOOK, week, page, day_date)


@app.post("/api/v1/experiment/{playbook}/idea-bank")
async def exp_create_idea(playbook: str, req: ExpIdeaCreate):
    from datetime import date
    pb = validate_playbook(playbook)
    client = get_supabase_client()
    tables = get_playbook_tables(pb)
    day_str = req.day_date or str(date.today())
    week_num = _exp_compute_week_number(client, pb, day_str)
    row = {
        "page_handle": req.page_handle,
        "content_type": req.content_type,
        "topic": req.topic,
        "script": req.script,
        "status": req.status,
        "views": req.views,
        "week_number": week_num,
        "day_date": day_str,
        "source": req.source,
        "hook_variations": req.hook_variations,
        "music_ref": req.music_ref,
        "frame_link": req.frame_link,
        "yt_url": req.yt_url,
        "yt_timestamps": req.yt_timestamps,
        "comp_link": req.comp_link,
        "kalakar_link": req.kalakar_link,
        "drive_link": req.drive_link,
        "created_by": req.created_by,
        "edited_by": req.edited_by,
        "test_result": req.test_result,
        "video_format": req.video_format,
        "content_format": req.content_format,
        "frontseat_pool": req.frontseat_pool,
        "source_pool_id": req.source_pool_id,
        "page_posting_dates": req.page_posting_dates or {},
        "page_posting_times": req.page_posting_times or {},
        "page_captions": req.page_captions or {},
        "page_live_links": req.page_live_links or {},
    }
    if req.origin_playbook and req.origin_idea_id:
        row["origin_playbook"] = validate_playbook(req.origin_playbook)
        row["origin_idea_id"] = req.origin_idea_id
    client.table(tables.idea_bank).insert(row).execute()
    verify = _exp_idea_query(client, pb).eq("day_date", day_str).order("created_at", desc=True).limit(1).execute().data
    created = verify[0] if verify else row
    if req.views > 0:
        settings = _exp_settings_row(client, pb)
        goal = settings.get("view_goal", 100000)
        if req.views >= goal:
            _exp_flag_working_idea(client, pb, created, goal)
    return {"success": True, "data": created}


@app.post("/api/v1/experiment/idea-bank")
async def exp_create_idea_legacy(req: ExpIdeaCreate):
    return await exp_create_idea(DEFAULT_PLAYBOOK, req)


@app.post("/api/v1/experiment/{target_playbook}/idea-bank/deploy-from/{source_playbook}/{source_idea_id}")
async def exp_deploy_idea_to_playbook(target_playbook: str, source_playbook: str, source_idea_id: str):
    """Copy idea name + links into another playbook; views/baselines stay per-playbook."""
    from datetime import date

    target_pb = validate_playbook(target_playbook)
    source_pb = validate_playbook(source_playbook)
    if target_pb == source_pb:
        raise HTTPException(status_code=400, detail="Cannot deploy to the same playbook")

    client = get_supabase_client()
    source_tables = get_playbook_tables(source_pb)
    source_rows = (
        client.table(source_tables.idea_bank)
        .select("*")
        .eq("id", source_idea_id)
        .limit(1)
        .execute()
        .data
    )
    if not source_rows:
        raise HTTPException(status_code=404, detail="Source idea not found")
    source = source_rows[0]

    root_pb, root_id = exp_root_origin(source_pb, source)

    target_tables = get_playbook_tables(target_pb)
    existing = (
        client.table(target_tables.idea_bank)
        .select("id")
        .eq("origin_playbook", root_pb)
        .eq("origin_idea_id", root_id)
        .limit(1)
        .execute()
        .data
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"Idea already deployed to {target_pb}")

    day_str = str(date.today())
    week_num = _exp_compute_week_number(client, target_pb, day_str)

    row = {
        "page_handle": "",
        "content_type": source.get("content_type") or "reel",
        "topic": source.get("topic") or "",
        "script": "",
        "status": "new",
        "views": 0,
        "week_number": week_num,
        "day_date": day_str,
        "source": "cross_playbook",
        "hook_variations": "",
        "music_ref": "",
        "frame_link": source.get("frame_link") or "",
        "yt_url": "",
        "yt_timestamps": "",
        "comp_link": source.get("comp_link") or "",
        "created_by": source.get("created_by") or "",
        "edited_by": "",
        "test_result": "",
        "video_format": "",
        "content_format": source.get("content_format") or "",
        "frontseat_pool": False,
        "source_pool_id": None,
        "page_posting_dates": {},
        "page_posting_times": {},
        "page_captions": {},
        "page_live_links": {},
        "page_views": {},
        "page_test_results": {},
        "origin_playbook": root_pb,
        "origin_idea_id": root_id,
    }
    client.table(target_tables.idea_bank).insert(row).execute()
    verify = (
        client.table(target_tables.idea_bank)
        .select("*")
        .eq("origin_playbook", root_pb)
        .eq("origin_idea_id", root_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    created = verify[0] if verify else row
    enriched = exp_enrich_ideas_cross_playbook(client, target_pb, [created])
    return {"success": True, "data": enriched[0]}


@app.get("/api/v1/experiment/{playbook}/idea-bank/{idea_id}")
async def exp_get_idea(playbook: str, idea_id: str):
    pb = validate_playbook(playbook)
    client = get_supabase_client()
    data = _exp_idea_query(client, pb).eq("id", idea_id).limit(1).execute().data
    if not data:
        raise HTTPException(status_code=404, detail="Idea not found")
    enriched = exp_enrich_ideas_cross_playbook(client, pb, data)
    return {"success": True, "data": enriched[0]}


@app.get("/api/v1/experiment/idea-bank/{idea_id}")
async def exp_get_idea_legacy(idea_id: str):
    return await exp_get_idea(DEFAULT_PLAYBOOK, idea_id)


@app.patch("/api/v1/experiment/{playbook}/idea-bank/{idea_id}")
async def exp_update_idea(playbook: str, idea_id: str, req: ExpIdeaUpdate):
    pb = validate_playbook(playbook)
    client = get_supabase_client()
    tables = get_playbook_tables(pb)
    update_data = {k: v for k, v in req.model_dump().items() if v is not None}
    if "day_date" in update_data:
        update_data["week_number"] = _exp_compute_week_number(client, pb, update_data["day_date"])
    client.table(tables.idea_bank).update(update_data).eq("id", idea_id).execute()
    verify = _exp_idea_query(client, pb).eq("id", idea_id).limit(1).execute().data
    updated = verify[0] if verify else {}
    if updated and ("views" in update_data or "page_views" in update_data):
        settings = _exp_settings_row(client, pb)
        goal = settings.get("view_goal", 100000)
        if exp_sum_views(updated) >= goal:
            _exp_flag_working_idea(client, pb, {**updated, "views": exp_sum_views(updated)}, goal)
    return {"success": True, "data": updated}


@app.patch("/api/v1/experiment/idea-bank/{idea_id}")
async def exp_update_idea_legacy(idea_id: str, req: ExpIdeaUpdate):
    return await exp_update_idea(DEFAULT_PLAYBOOK, idea_id, req)


@app.delete("/api/v1/experiment/{playbook}/idea-bank/{idea_id}")
async def exp_delete_idea(playbook: str, idea_id: str):
    pb = validate_playbook(playbook)
    client = get_supabase_client()
    tables = get_playbook_tables(pb)
    client.table(tables.idea_bank).delete().eq("id", idea_id).execute()
    return {"success": True}


@app.delete("/api/v1/experiment/idea-bank/{idea_id}")
async def exp_delete_idea_legacy(idea_id: str):
    return await exp_delete_idea(DEFAULT_PLAYBOOK, idea_id)


@app.post("/api/v1/experiment/{playbook}/idea-bank/migrate-posted-to-proven")
async def exp_migrate_posted_to_proven(playbook: str):
    pb = validate_playbook(playbook)
    client = get_supabase_client()
    tables = get_playbook_tables(pb)
    existing = _exp_idea_query(client, pb).eq("status", "posted").execute().data or []
    if existing:
        client.table(tables.idea_bank).update({"status": "proven_ideas"}).eq("status", "posted").execute()
    return {"success": True, "updated": len(existing)}


@app.post("/api/v1/experiment/idea-bank/migrate-posted-to-proven")
async def exp_migrate_posted_to_proven_legacy():
    return await exp_migrate_posted_to_proven(DEFAULT_PLAYBOOK)


@app.post("/api/v1/experiment/{playbook}/idea-bank/archive")
async def exp_archive_week(playbook: str, request: Request):
    pb = validate_playbook(playbook)
    body = await request.json()
    week_number = body.get("week_number")
    if not week_number:
        raise HTTPException(status_code=400, detail="week_number required")
    client = get_supabase_client()
    ideas = _exp_idea_query(client, pb).eq("week_number", week_number).execute().data or []
    if not ideas:
        return {"success": True, "archived": 0}
    settings = _exp_settings_row(client, pb)
    goal = settings.get("view_goal", 100000)
    label = _exp_week_label(client, pb, week_number)
    existing_sources = {
        r["source_id"]
        for r in (
            _exp_content_query(client, pb)
            .select("source_id")
            .eq("week_number", week_number)
            .execute()
            .data or []
        )
        if r.get("source_id")
    }
    to_insert = [i for i in ideas if i.get("id") not in existing_sources]
    if to_insert:
        rows = [{
            "source_id": i["id"],
            "page_handle": i.get("page_handle", ""),
            "content_type": i.get("content_type", "reel"),
            "topic": i.get("topic", ""),
            "script": i.get("script", ""),
            "views": i.get("views", 0),
            "status": i.get("status", "new"),
            "week_number": week_number,
            "week_label": label,
            "day_date": str(i.get("day_date", "")),
            "source": i.get("source", "original"),
            "hook_variations": i.get("hook_variations", ""),
            "music_ref": i.get("music_ref", ""),
            "frame_link": i.get("frame_link", ""),
            "yt_url": i.get("yt_url", ""),
            "yt_timestamps": i.get("yt_timestamps", ""),
            "comp_link": i.get("comp_link", ""),
            "content_format": i.get("content_format", ""),
            "created_by": i.get("created_by", ""),
            "page_views": i.get("page_views", {}),
            "page_posting_dates": i.get("page_posting_dates", {}),
            "page_posting_times": i.get("page_posting_times", {}),
            "page_captions": i.get("page_captions", {}),
            "page_live_links": i.get("page_live_links", {}),
        } for i in to_insert]
        client.table(get_playbook_tables(pb).content_bank).insert(rows).execute()
        for i in to_insert:
            if (i.get("views") or 0) >= goal:
                _exp_flag_working_idea(client, pb, i, goal)
    return {"success": True, "archived": len(to_insert), "week_label": label}


@app.post("/api/v1/experiment/idea-bank/archive")
async def exp_archive_week_legacy(request: Request):
    return await exp_archive_week(DEFAULT_PLAYBOOK, request)


@app.patch("/api/v1/experiment/{playbook}/content-bank/{item_id}")
async def exp_update_content_bank_item(playbook: str, item_id: str, request: Request):
    pb = validate_playbook(playbook)
    body = await request.json()
    allowed = {"topic", "script", "views", "status", "content_type", "source", "hook_variations",
                "music_ref", "frame_link", "yt_url", "yt_timestamps", "comp_link", "kalakar_link",
                "drive_link", "page_views",
                "created_by", "edited_by", "test_result", "video_format", "content_format", "page_handle",
                "page_posting_dates", "page_posting_times", "page_captions", "page_live_links"}
    update_data = {k: v for k, v in body.items() if k in allowed}
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    client = get_supabase_client()
    tables = get_playbook_tables(pb)
    client.table(tables.content_bank).update(update_data).eq("id", item_id).execute()
    verify = _exp_content_query(client, pb).eq("id", item_id).limit(1).execute().data
    if not verify:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True, "data": verify[0]}


@app.patch("/api/v1/experiment/content-bank/{item_id}")
async def exp_update_content_bank_item_legacy(item_id: str, request: Request):
    return await exp_update_content_bank_item(DEFAULT_PLAYBOOK, item_id, request)


@app.get("/api/v1/experiment/{playbook}/content-bank")
async def exp_list_content_bank(playbook: str, week: int | None = None, page: str | None = None):
    pb = validate_playbook(playbook)
    client = get_supabase_client()
    q = _exp_content_query(client, pb).order("day_date", desc=False).order("archived_at", desc=False)
    if week is not None:
        q = q.eq("week_number", week)
    if page:
        q = q.eq("page_handle", page)
    data = q.execute().data or []
    return {"success": True, "data": data}


@app.get("/api/v1/experiment/content-bank")
async def exp_list_content_bank_legacy(week: int | None = None, page: str | None = None):
    return await exp_list_content_bank(DEFAULT_PLAYBOOK, week, page)


@app.get("/api/v1/experiment/{playbook}/content-bank/weeks")
async def exp_list_content_bank_weeks(playbook: str):
    pb = validate_playbook(playbook)
    client = get_supabase_client()
    data = _exp_content_query(client, pb).select("week_number,week_label").order("week_number", desc=False).execute().data or []
    seen: dict[int, str] = {}
    for row in data:
        w = row.get("week_number")
        if w not in seen:
            seen[w] = row.get("week_label", f"Week {w}")
    return {"success": True, "data": [{"week_number": k, "week_label": v} for k, v in seen.items()]}


@app.get("/api/v1/experiment/content-bank/weeks")
async def exp_list_content_bank_weeks_legacy():
    return await exp_list_content_bank_weeks(DEFAULT_PLAYBOOK)


@app.get("/api/v1/experiment/{playbook}/working-ideas")
async def exp_list_working_ideas(playbook: str, week: int | None = None, page: str | None = None):
    pb = validate_playbook(playbook)
    client = get_supabase_client()
    q = _exp_working_query(client, pb).order("flagged_at", desc=True)
    if week is not None:
        q = q.eq("week_number", week)
    if page:
        q = q.eq("page_handle", page)
    data = q.execute().data or []
    return {"success": True, "data": data}


@app.get("/api/v1/experiment/working-ideas")
async def exp_list_working_ideas_legacy(week: int | None = None, page: str | None = None):
    return await exp_list_working_ideas(DEFAULT_PLAYBOOK, week, page)


@app.post("/api/v1/experiment/{playbook}/working-ideas/{idea_id}/distribute")
async def exp_distribute_working_idea(playbook: str, idea_id: str):
    pb = validate_playbook(playbook)
    client = get_supabase_client()
    tables = get_playbook_tables(pb)
    client.table(tables.working_ideas).update({"distributed": True}).eq("id", idea_id).execute()
    verify = _exp_working_query(client, pb).eq("id", idea_id).limit(1).execute().data
    return {"success": True, "data": verify[0] if verify else {}}


@app.post("/api/v1/experiment/working-ideas/{idea_id}/distribute")
async def exp_distribute_working_idea_legacy(idea_id: str):
    return await exp_distribute_working_idea(DEFAULT_PLAYBOOK, idea_id)
