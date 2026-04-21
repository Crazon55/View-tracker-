"""FastAPI app for Instagram View Tracker."""
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, HTTPException, Request
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

    month_reels = _filter_current_month(all_reels, "posted_at")
    month_posts = _filter_current_month(all_posts, "posted_at")

    # 6-day tracker overrides for the current month:
    # - If `six_day_monthly_actuals.actual_views` exists for a page/month, use it as the source of truth
    # - Else fall back to sum of `six_day_entries.views` for that month
    # For reels/posts split, use `reel_pct`/`post_pct` from cycle entries, and if actual overrides exist,
    # scale the cycle split to match the actual total.
    six_entries = (
        client.table("six_day_entries")
        .select("page_id,views,reel_pct,post_pct,month")
        .eq("month", current_month)
        .execute()
        .data
        or []
    )
    six_actuals = (
        client.table("six_day_monthly_actuals")
        .select("page_id,actual_views,month")
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

    actual_total: dict[str, int] = {}
    for a in six_actuals:
        pid = a.get("page_id")
        if not pid:
            continue
        actual_total[pid] = int(a.get("actual_views") or 0)

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

        # All-time views (still uses content_entries + legacy so historical IP pages stay intact)
        all_time_views = (
            sum(e.get("views", 0) or 0 for e in page_entries) +
            sum(r.get("views", 0) or 0 for r in page_reels) +
            sum(p.get("actual_views", 0) or 0 for p in page_posts)
        )

        # Monthly views = 6-day tracker ONLY (cycle sum, or actual override if present).
        # This makes the Dashboard "Total Ecosystem Reach" match the 6-day tracker total exactly.
        base_total = cycle_total.get(pid, 0)
        base_reel = float(cycle_reel.get(pid, 0.0))
        base_post = float(cycle_post.get(pid, 0.0))

        if pid in actual_total:
            target_total = actual_total[pid]
            ratio = (target_total / base_total) if base_total > 0 else 0.0
            month_views = target_total
            reel_views = int(round(base_reel * ratio))
            post_views = int(round(base_post * ratio))
        else:
            month_views = base_total
            reel_views = int(round(base_reel))
            post_views = int(round(base_post))

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

    # Totals — computed from per-page stats so they stay consistent after 6-day overrides.
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


@app.post("/api/v1/user-role")
async def set_user_role(req: dict):
    from app.database.client import get_supabase_client
    client = get_supabase_client()
    email = req.get("email")
    role = req.get("role")
    name = req.get("name", "")
    if not email or not role:
        raise HTTPException(status_code=400, detail="email and role required")
    # Upsert
    existing = client.table("user_roles").select("id").eq("email", email).execute().data
    if existing:
        entry = client.table("user_roles").update({"role": role, "name": name}).eq("email", email).execute().data[0]
    else:
        entry = client.table("user_roles").insert({"email": email, "role": role, "name": name}).execute().data[0]
    return {"success": True, "data": entry}


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

    # --- Merge 6-day tracker into growth: reconciled IG actuals override; else cycle sums ---
    # Also derive per-page/month reel_views + post_views from 6-day reel_pct/post_pct so
    # the dashboard graph can plot Reels and Posts as separate lines.
    six_entries = client.table("six_day_entries").select("page_id,month,views,reel_pct,post_pct").execute().data or []
    six_actuals = client.table("six_day_monthly_actuals").select("page_id,month,actual_views").execute().data or []

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

    actual_map: dict[tuple[str, str], int] = {}
    for a in six_actuals:
        pid, mon = a.get("page_id"), a.get("month")
        if not pid or not mon:
            continue
        mp = mon[:7] if isinstance(mon, str) else str(mon)[:7]
        actual_map[(pid, mp)] = int(a.get("actual_views") or 0)

    six_keys = set(cycle_sum.keys()) | set(actual_map.keys())

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
        if k in actual_map:
            row["views"] = actual_map[k]
        elif cycle_sum.get(k, 0) > 0:
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
        if (pid, mp) in actual_map:
            total = actual_map[(pid, mp)]
        else:
            total = cycle_sum.get((pid, mp), 0)
        if (pid, mp) not in actual_map and total <= 0:
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
    "indianfoundersco",
    "startupbydog",
    "founderswtf",
    "entrepreneursindia.co",
    "richindianceo",
    "therisingfounder",
    "millionaire.founders",
    "indianbusinesscom",
    "ceohustleadvice",
    "therealfoundr",
]

GOOFIES_HANDLES: list[str] = [
    "101xfounders",
    "foundersinindia",
    "startupcoded",
    "indiastartupstory",
    "elitefoundrs",
    "indianfoundrs",
    "startupsinthelast24hrs",
    "realindianbusiness",
    "foundersoncrack",
    "entrepreneurial.india",
    "theprimefounder",
    "indiasbestfounders",
    "businesscracked",
    "bestindianpodcast",
]


TEAM_PERFORMANCE_CONFIG: dict[str, dict] = {
    "garfields": {
        "key": "garfields",
        "label": "Garfields",
        "emoji": "\U0001F431",  # cat
        "members": ["Deepak", "Kaavya", "Swati"],
        "niche_match": ("garfields",),  # substring in tracker_niches.name (lowercase)
    },
    "goofies": {
        "key": "goofies",
        "label": "Goofies",
        "emoji": "\U0001F436",  # dog
        "members": ["Arohi", "Harish", "Pulkit"],
        "niche_match": ("goofies",),
    },
}


@app.get("/api/v1/teams/performance")
async def teams_performance():
    """Gamified leaderboard: Garfields vs Goofies.

    Aggregates tracker_postings views (per team, per-creator, per-idea, per-6-day
    window) plus idea counts by stage, so the UI can render a scoreboard
    with hall-of-fame awards and a people leaderboard.
    """
    from app.database.client import get_supabase_client
    from datetime import datetime, timedelta
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
    today = datetime.utcnow().date()
    cutoff_6d = today - timedelta(days=6)

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
                in_6d = d >= cutoff_6d and d <= today
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
            "views_6d": ts["views_6d"],
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
            "window_days": 6,
        },
    }


# --- Ideas ---
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
        "format": body.get("format"),
        "main_page_hook": body.get("main_page_hook"),
        "content_pillar": body.get("content_pillar"),
        "content_bucket": body.get("content_bucket"),
        "caption": body.get("caption"),
        "canva_link": body.get("canva_link"),
    }
    # Remove None values so Supabase doesn't store explicit nulls for optional fields
    row = {k: v for k, v in row.items() if v is not None}
    row.setdefault("title", body["title"])
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
        "type", "tags", "frame_link", "format", "main_page_hook",
        "content_pillar", "content_bucket", "caption", "canva_link",
        # Bandwidth attribution fields (allow direct admin edits)
        "base_edit_by", "base_edit_at", "pintu_set_by", "pintu_set_at",
        "posted_by", "posted_at",
    }
    allowed = {k: v for k, v in body.items() if k in allowed_keys}
    if "niche_ids" in allowed:
        allowed["niche_id"] = allowed["niche_ids"][0] if allowed["niche_ids"] else None

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
                .select("base_edit_by, pintu_set_by, posted_by")
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

    bw_keys = {"base_edit_by", "base_edit_at", "pintu_set_by", "pintu_set_at", "posted_by", "posted_at"}
    # Did the client explicitly send a bandwidth field (e.g. user editing the
    # posted_at date picker), or did they only show up from our auto-stamp
    # logic above? If user-explicit, we want a loud failure when the column
    # is missing so the frontend can surface it; otherwise we silently strip.
    user_explicit_bw = {k for k in bw_keys if k in body}

    try:
        client.table("tracker_ideas").update(allowed).eq("id", idea_id).execute()
    except Exception as e:
        msg = str(e).lower()
        is_bw_err = any(k in msg for k in bw_keys) or "column" in msg or "schema cache" in msg
        if is_bw_err and user_explicit_bw:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Bandwidth columns not in DB. "
                    "Run migrations/migration_bandwidth_fields.sql in Supabase "
                    "to enable editable posted_at / base_edit_at / pintu_set_at."
                ),
            )
        if is_bw_err:
            # Auto-stamp path: keep trackers working by dropping bw keys.
            lean = {k: v for k, v in allowed.items() if k not in bw_keys}
            if lean:
                client.table("tracker_ideas").update(lean).eq("id", idea_id).execute()
        else:
            raise
    return {"success": True}


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
    # Sync to content_entries
    try:
        _sync_posting_to_content_entry(client, posting_id)
    except Exception:
        pass
    return {"success": True}


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
async def bandwidth_tracker(days: int = 14, type: str | None = None):
    """Per-person daily bandwidth across BOTH the reel pipeline (CS + CDI)
    and the post pipeline (CW).

    Reel metrics (type=reel):
      reel_comp        source=competitor, date=created_at
      reel_og          source=original,   date=created_at
      reel_base_edits  stage==base_edit
      reel_pintu       stage==proven_ideas
      reel_posted      stage==posted

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

    # Window: last N days ending today (UTC), inclusive. E.g. days=14 -> 14
    # date buckets.
    days = max(1, min(int(days or 14), 90))
    today = _dt.now(_tz.utc).date()
    window_start = today - _td(days=days - 1)

    # Try to select the Bandwidth attribution columns; if they don't exist
    # yet (migration not run), fall back to a lean select. Everything still
    # works because the fallbacks use created_by + created_at.
    full_cols = (
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
        return window_start <= d <= today

    METRIC_KEYS = (
        # Reel pipeline (CS creates, CDI edits + posts)
        "reel_comp", "reel_og", "reel_base_edits", "reel_pintu", "reel_posted",
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
    REEL_STAGE_PINTU     = {"proven_ideas"}
    REEL_STAGE_POSTED    = {"posted"}
    POST_STAGE_EDITS     = {"scripted"}
    POST_STAGE_POSTED    = {"uploaded"}

    for idea in ideas:
        niche_team = _idea_team(idea)
        idea_id = idea.get("id")
        stage = (idea.get("stage") or "").lower()
        created_by = idea.get("created_by")
        created_at_day = _date_key(idea.get("created_at"))
        idea_type = (idea.get("type") or "reel").lower()
        source = str(idea.get("source") or "original").lower()
        pillar = str(idea.get("content_pillar") or "").strip().lower()

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
                    if pillar == "mm":
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
    while d <= today:
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
            "window_end": today.isoformat(),
            "days": days,
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
        "indianfoundersco": "Indian Founders Co",
        "startupbydog": "Startupbydog",
        "founderswtf": "Founders WTF",
        "entrepreneursindia.co": "Entrepreneursindia.co",
        "richindianceo": "Rich Indian CEO",
        "therisingfounder": "The Rising Founder",
        "millionaire.founders": "Millionaire.founders",
        "indianbusinesscom": "Indian Business Com",
        "ceohustleadvice": "CEO Hustle Advice",
        "therealfoundr": "The Real Foundr",
        # Goofies
        "101xfounders": "101xfounders",
        "foundersinindia": "Founders In India",
        "startupcoded": "Startup Coded",
        "indiastartupstory": "India Startup Story",
        "elitefoundrs": "Elite Founders",
        "indianfoundrs": "Indian Foundrs",
        "startupsinthelast24hrs": "Startupsinthelast24hrs",
        "realindianbusiness": "Real Indian Business",
        "foundersoncrack": "Foundersoncrack",
        "entrepreneurial.india": "Entrepreneurial.India",
        "theprimefounder": "The Prime Founder",
        "indiasbestfounders": "India's Best Founders",
        "businesscracked": "Business Cracked",
        "bestindianpodcast": "Best Indian Podcast",
    }

    all_handles = sorted({
        *[h.lstrip("@").strip().lower() for h in GARFIELDS_HANDLES],
        *[h.lstrip("@").strip().lower() for h in GOOFIES_HANDLES],
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

    pages = client.table("pages").select("id,handle,name,stage").order("name").execute().data or []

    entries = (
        client.table("six_day_entries")
        .select("*")
        .eq("month", month_date)
        .execute()
        .data or []
    )

    top_content = (
        client.table("six_day_top_content")
        .select("*")
        .eq("month", month_date)
        .order("views", desc=True)
        .execute()
        .data or []
    )

    actuals = (
        client.table("six_day_monthly_actuals")
        .select("*")
        .eq("month", month_date)
        .execute()
        .data or []
    )

    config = client.table("six_day_config").select("*").limit(1).execute().data
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
