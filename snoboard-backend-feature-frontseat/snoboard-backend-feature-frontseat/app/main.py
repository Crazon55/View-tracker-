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
    """Aggregated stats for the dashboard hero + per-page bento cards.
    Only shows current month's data on the frontend (resets on 1st).
    """
    pages = get_page_repository().get_all()
    all_reels = get_reel_repository().get_all()
    all_posts = get_post_repository().get_all()

    # Filter to current month only
    month_reels = _filter_current_month(all_reels, "posted_at")
    month_posts = _filter_current_month(all_posts, "posted_at")
    current_month = _month_start()

    total_reel_views = sum(r.get("views", 0) or 0 for r in month_reels)
    total_post_views = sum(p.get("actual_views", 0) or 0 for p in month_posts)
    total_views = total_reel_views + total_post_views

    # All-time: sum ALL reels + posts views (not just current month)
    all_time_reel_totals: dict[str, int] = {}
    all_time_post_totals: dict[str, int] = {}
    for r in all_reels:
        pid = r["page_id"]
        all_time_reel_totals[pid] = all_time_reel_totals.get(pid, 0) + (r.get("views", 0) or 0)
    for p in all_posts:
        pid = p["page_id"]
        all_time_post_totals[pid] = all_time_post_totals.get(pid, 0) + (p.get("actual_views", 0) or 0)

    # Per-page stats
    # Build all-time counts per page
    all_time_reel_counts: dict[str, int] = {}
    all_time_post_counts: dict[str, int] = {}
    for r in all_reels:
        pid = r["page_id"]
        all_time_reel_counts[pid] = all_time_reel_counts.get(pid, 0) + 1
    for p in all_posts:
        pid = p["page_id"]
        all_time_post_counts[pid] = all_time_post_counts.get(pid, 0) + 1

    page_stats = []
    for page in pages:
        pid = page["id"]
        page_reels = [r for r in month_reels if r["page_id"] == pid]
        page_posts = [p for p in month_posts if p["page_id"] == pid]

        page_reel_views = sum(r.get("views", 0) or 0 for r in page_reels)
        page_post_views = sum(p.get("actual_views", 0) or 0 for p in page_posts)
        reel_likes = sum(r.get("likes", 0) or 0 for r in page_reels)
        reel_comments = sum(r.get("comments", 0) or 0 for r in page_reels)

        top_reels = sorted(page_reels, key=lambda r: r.get("views", 0) or 0, reverse=True)[:5]

        page_stats.append({
            "id": pid,
            "handle": page["handle"],
            "name": page.get("name"),
            "profile_url": page.get("profile_url"),
            "auto_scrape": page.get("auto_scrape", False),
            "followers_count": page.get("followers_count", 0),
            "total_views": page_reel_views + page_post_views,
            "all_time_views": all_time_reel_totals.get(pid, 0) + all_time_post_totals.get(pid, 0),
            "reel_views": page_reel_views,
            "post_views": page_post_views,
            "total_likes": reel_likes,
            "total_comments": reel_comments,
            "reels_count": len(page_reels),
            "posts_count": len(page_posts),
            "all_time_reels_count": all_time_reel_counts.get(pid, 0),
            "all_time_posts_count": all_time_post_counts.get(pid, 0),
            "top_reels": top_reels,
        })

    total_all_time = sum(all_time_reel_totals.values()) + sum(all_time_post_totals.values())

    return {
        "success": True,
        "data": {
            "total_views": total_views,
            "total_all_time_views": total_all_time,
            "total_reel_views": total_reel_views,
            "total_post_views": total_post_views,
            "total_reels": len(month_reels),
            "total_posts": len(month_posts),
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
