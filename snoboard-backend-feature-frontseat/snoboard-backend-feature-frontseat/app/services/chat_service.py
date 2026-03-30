"""Chat service — builds data context and calls Claude API."""

import json
import logging
from datetime import datetime, timezone

import anthropic

from app.config import get_settings
from app.database.repositories.pages import get_page_repository
from app.database.repositories.reels import get_reel_repository
from app.database.repositories.posts import get_post_repository
from app.database.repositories.ideas import get_idea_repository
from app.database.repositories.content_strategists import get_cs_repository

logger = logging.getLogger(__name__)

WINNER_THRESHOLD = 50_000


def _month_start() -> str:
    return datetime.now(timezone.utc).date().replace(day=1).isoformat()


def _build_data_context() -> str:
    """Fetch all data and build a compact summary for Claude."""
    pages = get_page_repository().get_all()
    all_reels = get_reel_repository().get_all()
    all_posts = get_post_repository().get_all()
    ideas = get_idea_repository().get_all()
    cs_list = get_cs_repository().get_all()

    month_start = _month_start()

    # Split reels by type
    main_reels = [r for r in all_reels if r.get("auto_scrape")]
    stage1_reels = [r for r in all_reels if not r.get("auto_scrape")]

    # Per-page stats
    page_lines = []
    for page in pages:
        pid = page["id"]
        p_reels = [r for r in all_reels if r["page_id"] == pid]
        p_main = [r for r in main_reels if r["page_id"] == pid]
        p_stage1 = [r for r in stage1_reels if r["page_id"] == pid]
        p_posts = [p for p in all_posts if p["page_id"] == pid]
        month_reels = [r for r in p_reels if (r.get("posted_at") or "")[:10] >= month_start]
        month_posts = [p for p in p_posts if (p.get("posted_at") or "")[:10] >= month_start]

        all_time_views = sum(r.get("views", 0) or 0 for r in p_reels) + sum(p.get("actual_views", 0) or 0 for p in p_posts)
        month_views = sum(r.get("views", 0) or 0 for r in month_reels) + sum(p.get("actual_views", 0) or 0 for p in month_posts)
        reel_type = "main" if page.get("auto_scrape") else "stage1"

        page_lines.append(
            f"| @{page['handle']} | {reel_type} | {page.get('followers_count', 0):,} | "
            f"{month_views:,} | {len(month_reels)} reels, {len(month_posts)} posts | "
            f"{all_time_views:,} | {len(p_main)} main, {len(p_stage1)} stage1, {len(p_posts)} posts |"
        )

    # Top reels this month (with dates)
    month_reels_all = [r for r in all_reels if (r.get("posted_at") or "")[:10] >= month_start]
    top_reels = sorted(month_reels_all, key=lambda r: r.get("views", 0) or 0, reverse=True)[:10]
    top_lines = []
    for r in top_reels:
        handle = r.get("pages", {}).get("handle", "?") if r.get("pages") else "?"
        posted = (r.get("posted_at") or "unknown")[:10]
        top_lines.append(f"- @{handle}: {(r.get('views', 0) or 0):,} views, posted {posted} — {r.get('url', '')}")

    # Per-page reel breakdown this month (aggregated by page + date + type)
    from collections import defaultdict
    reel_by_page_date: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for r in month_reels_all:
        handle = r.get("pages", {}).get("handle", "?") if r.get("pages") else "?"
        date = (r.get("posted_at") or "unknown")[:10]
        rtype = "main" if r.get("auto_scrape") else "stage1"
        reel_by_page_date[f"{handle}|{rtype}"][date].append(r.get("views", 0) or 0)

    reel_detail_lines = []
    for key in sorted(reel_by_page_date):
        handle, rtype = key.split("|")
        for date in sorted(reel_by_page_date[key]):
            views_list = reel_by_page_date[key][date]
            total = sum(views_list)
            reel_detail_lines.append(f"| @{handle} | {rtype} | {date} | {len(views_list)} | {total:,} |")

    # Per-page post breakdown this month (aggregated by page + date)
    month_posts_all = [p for p in all_posts if (p.get("posted_at") or p.get("created_at") or "")[:10] >= month_start]
    post_by_page_date: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for p in month_posts_all:
        handle = p.get("pages", {}).get("handle", "?") if p.get("pages") else "?"
        date = (p.get("posted_at") or p.get("created_at") or "unknown")[:10]
        post_by_page_date[handle][date].append(p.get("actual_views", 0) or 0)

    post_detail_lines = []
    for handle in sorted(post_by_page_date):
        for date in sorted(post_by_page_date[handle]):
            views_list = post_by_page_date[handle][date]
            total = sum(views_list)
            post_detail_lines.append(f"| @{handle} | {date} | {len(views_list)} | {total:,} |")

    # Idea stats
    idea_content: dict[str, list[dict]] = {idea["id"]: [] for idea in ideas}
    for reel in all_reels:
        iid = reel.get("idea_id")
        if iid and iid in idea_content:
            idea_content[iid].append({"views": reel.get("views", 0) or 0, "type": "reel"})
    for post in all_posts:
        iid = post.get("idea_id")
        if iid and iid in idea_content:
            idea_content[iid].append({"views": post.get("actual_views", 0) or 0, "type": "post"})

    idea_lines = []
    for idea in ideas[:50]:  # limit to 50 ideas
        content = idea_content.get(idea["id"], [])
        total_posts = len(content)
        total_views = sum(c["views"] for c in content)
        winners = sum(1 for c in content if c["views"] >= WINNER_THRESHOLD)
        hit_rate = (winners / total_posts * 100) if total_posts > 0 else 0
        cs_name = idea.get("content_strategists", {}).get("name", "") if idea.get("content_strategists") else ""
        idea_lines.append(
            f"| {idea.get('idea_code', '')} | {idea.get('hook', '')[:60]} | {cs_name} | "
            f"{idea.get('status', '')} | {total_posts} | {total_views:,} | {winners} | {hit_rate:.0f}% |"
        )

    # CS leaderboard
    cs_lines = []
    for cs in cs_list:
        cs_ideas = [i for i in ideas if i.get("cs_owner_id") == cs["id"]]
        cs_idea_ids = {i["id"] for i in cs_ideas}
        cs_content = []
        for iid in cs_idea_ids:
            cs_content.extend(idea_content.get(iid, []))
        cs_views = sum(c["views"] for c in cs_content)
        cs_posts = len(cs_content)
        cs_winners = sum(1 for c in cs_content if c["views"] >= WINNER_THRESHOLD)
        cs_hr = (cs_winners / cs_posts * 100) if cs_posts > 0 else 0
        cs_lines.append(
            f"| {cs['name']} | {len(cs_ideas)} ideas | {cs_posts} posts | "
            f"{cs_views:,} views | {cs_winners} winners | {cs_hr:.0f}% hit rate |"
        )

    return f"""## Pages (Instagram Accounts)
| Handle | Type | Followers | This Month Views | This Month Content | All-Time Views | All-Time Content |
{chr(10).join(page_lines) if page_lines else "No pages yet."}

## Top 10 Reels This Month
{chr(10).join(top_lines) if top_lines else "No reels this month."}

## Reels This Month (by page, type, and date)
| Handle | Type | Date | Count | Total Views |
{chr(10).join(reel_detail_lines) if reel_detail_lines else "No reels this month."}

## Posts This Month (by page and date)
| Handle | Date | Count | Total Views |
{chr(10).join(post_detail_lines) if post_detail_lines else "No posts this month."}

## Content Strategist Leaderboard
{chr(10).join(cs_lines) if cs_lines else "No content strategists yet."}

## Ideas ({len(ideas)} total)
| Code | Hook | CS Owner | Status | Posts | Views | Winners | Hit Rate |
{chr(10).join(idea_lines) if idea_lines else "No ideas yet."}

## Key Metrics
- Total pages: {len(pages)}
- Total reels (all time): {len(all_reels)}
- Total posts (all time): {len(all_posts)}
- Total ideas: {len(ideas)}
- Winner threshold: {WINNER_THRESHOLD:,} views
- Current month: {month_start}
- Current date: {datetime.now(timezone.utc).date().isoformat()}"""


SYSTEM_PROMPT = """You are View Tracker AI, an analytics assistant for Owled Media's Instagram accounts. You help the team understand content performance, identify trends, compare pages, and generate content ideas.

RESPONSE FORMAT:
Always respond with valid JSON in one of these two formats:

For text answers:
{{"type": "text", "content": "Your markdown-formatted response here"}}

For answers with chart visualizations (use ONLY when comparing numbers, showing rankings, or trends):
{{"type": "chart", "chart_type": "bar|line|pie", "title": "Chart Title", "data": [{{"name": "Label", "value": 123}}], "data_keys": {{"xKey": "name", "yKeys": ["value"]}}, "content": "Brief text summary"}}

IMPORTANT CONCEPTS:
- "Main Reels" (type=main): Reels from main IP accounts (auto-scraped), these are the primary brand accounts
- "Stage 1 Reels" (type=stage1): Reels from secondary/growth accounts (manually tracked), these are newer/smaller accounts being grown
- "Posts": Instagram carousel/image posts (not reels)
- A "winner" is a reel/post with 50,000+ views
- Idea codes follow FS-XXX format

RULES:
- Use "chart" type ONLY for comparisons, rankings, or numeric data that benefits from visualization
- For content ideation, strategy advice, or qualitative answers, use "text" type
- Format numbers with commas in text content
- Be concise but insightful
- When asked about "stage 1" accounts, filter to type=stage1 reels only
- When asked about "main" accounts, filter to type=main reels only
- You can use markdown formatting (bold, lists, headers) in the content field

AVAILABLE DATA:
{data_context}"""


async def get_chat_response(message: str, history: list[dict]) -> dict:
    """Send a message to Claude with analytics data context."""
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    data_context = _build_data_context()
    system = SYSTEM_PROMPT.format(data_context=data_context)

    # Build messages list
    messages = []
    for msg in history[-4:]:  # last 4 messages to save tokens
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": message})

    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=system,
            messages=messages,
        )
    except Exception as e:
        logger.error(f"Claude API error: {e}")
        raise

    raw_text = response.content[0].text

    # Parse JSON response
    try:
        result = json.loads(raw_text)
    except json.JSONDecodeError:
        # Try to extract JSON from the response
        start = raw_text.find("{")
        end = raw_text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                result = json.loads(raw_text[start:end])
            except json.JSONDecodeError:
                result = {"type": "text", "content": raw_text}
        else:
            result = {"type": "text", "content": raw_text}

    return result
