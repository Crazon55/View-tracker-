"""FastAPI app for Instagram View Tracker."""
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.database.repositories.pages import get_page_repository
from app.database.repositories.posts import get_post_repository
from app.database.repositories.reels import get_reel_repository
from app.database.repositories.dashboard_views import get_dashboard_views_repository
from app.database.repositories.content_strategists import get_cs_repository
from app.database.repositories.ideas import get_idea_repository
from app.schemas.request import (
    PageCreate, PageUpdate, PostCreate, PostUpdate,
    ReelCreate, ReelUpdate, ScrapeRequest,
    CSCreate, CSUpdate, IdeaCreate, IdeaUpdate,
    ChatRequest, ContentEntryCreate, ContentEntryUpdate,
)
from app.schemas.response import ScrapeStatusResponse

app = FastAPI(title="View Tracker", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Health (no auth) ---
@app.get("/health")
async def health():
    return {"status": "ok"}


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
    current_month = _month_start()

    # Fetch all content entries
    all_entries = client.table("content_entries").select("*").execute().data or []
    month_entries = [e for e in all_entries if (e.get("upload_date") or "")[:10] >= current_month]

    # Also include legacy reels/posts
    all_reels = get_reel_repository().get_all()
    all_posts = get_post_repository().get_all()

    # Current month views from content entries
    total_entry_views = sum(e.get("views", 0) or 0 for e in month_entries)
    # Legacy current month
    month_reels = _filter_current_month(all_reels, "posted_at")
    month_posts = _filter_current_month(all_posts, "posted_at")
    total_reel_views = sum(r.get("views", 0) or 0 for r in month_reels) + sum(e.get("views", 0) or 0 for e in month_entries if e.get("content_type") == "reel")
    total_post_views = sum(p.get("actual_views", 0) or 0 for p in month_posts) + sum(e.get("views", 0) or 0 for e in month_entries if e.get("content_type") != "reel")
    total_views = total_reel_views + total_post_views

    # All-time per page
    page_stats = []
    for page in pages:
        pid = page["id"]
        # Content entries for this page
        page_entries = [e for e in all_entries if e.get("page_id") == pid]
        page_month_entries = [e for e in page_entries if (e.get("upload_date") or "")[:10] >= current_month]
        # Legacy
        page_reels = [r for r in all_reels if r["page_id"] == pid]
        page_posts = [p for p in all_posts if p["page_id"] == pid]
        page_month_reels = [r for r in month_reels if r["page_id"] == pid]
        page_month_posts = [p for p in month_posts if p["page_id"] == pid]

        # Monthly views (content entries + legacy)
        month_views = (
            sum(e.get("views", 0) or 0 for e in page_month_entries) +
            sum(r.get("views", 0) or 0 for r in page_month_reels) +
            sum(p.get("actual_views", 0) or 0 for p in page_month_posts)
        )
        # All time views
        all_time_views = (
            sum(e.get("views", 0) or 0 for e in page_entries) +
            sum(r.get("views", 0) or 0 for r in page_reels) +
            sum(p.get("actual_views", 0) or 0 for p in page_posts)
        )

        reel_views = sum(r.get("views", 0) or 0 for r in page_month_reels) + sum(e.get("views", 0) or 0 for e in page_month_entries if e.get("content_type") == "reel")
        post_views = sum(p.get("actual_views", 0) or 0 for p in page_month_posts) + sum(e.get("views", 0) or 0 for e in page_month_entries if e.get("content_type") != "reel")

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
    data = req.model_dump(exclude_none=True)
    try:
        idea = get_idea_repository().create(data)
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


# --- Growth Data ---
@app.get("/api/v1/growth")
async def get_growth_data():
    from app.database.client import get_supabase_client
    from datetime import datetime
    client = get_supabase_client()
    data = client.table("growth_data").select("*").order("month", desc=True).execute().data or []

    # Add current month live data from content_entries + reels
    now = datetime.utcnow()
    current_month = f"{now.year}-{now.month:02d}-01"
    current_month_prefix = f"{now.year}-{now.month:02d}"

    # Check if current month already has growth_data entries
    existing_months = {d.get("month", "")[:7] for d in data}
    if current_month_prefix not in existing_months:
        # Fetch all pages
        pages = client.table("pages").select("id,handle,name,stage,followers_count").execute().data or []
        # Fetch content_entries for current month
        entries = client.table("content_entries").select("page_id,views,upload_date,created_at").execute().data or []
        # Fetch reels for current month
        all_reels = get_reel_repository().get_all()

        for page in pages:
            page_id = page["id"]
            handle = page.get("handle", "")
            stage = page.get("stage", 1)

            # Views from content_entries this month
            entry_views = sum(
                (e.get("views") or 0) for e in entries
                if e.get("page_id") == page_id
                and ((e.get("upload_date") or e.get("created_at") or "")[:7] == current_month_prefix)
            )
            # Views from reels this month
            reel_views = sum(
                (r.get("views") or 0) for r in all_reels
                if r.get("page_id") == page_id
                and ((r.get("posted_at") or "")[:7] == current_month_prefix)
            )
            total_views = entry_views + reel_views
            if total_views > 0:
                data.append({
                    "id": f"live-{page_id}",
                    "handle": handle,
                    "stage": stage,
                    "month": current_month,
                    "views": total_views,
                    "followers_gained": 0,
                    "category": page.get("category", ""),
                })

    return {"success": True, "data": data}
