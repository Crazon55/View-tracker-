"""
Queue processor script — run twice daily via cron / Cloud Scheduler.

Flow:
1. Fetch up to 100 pending items from scrape_queue
2. Mark them as 'processing'
3. For each username, concurrently fetch:
   - Profile identity using coderx/instagram-profile-scraper-bio-posts
   - Reels performance using apify/instagram-reel-scraper
4. For each result:
   - Merge data in memory
   - Calculate total_views, average_views, true_er, and creator_tier
   - Upsert into creators table
   - Generate AI profile via LLM (bio + 12 captions)
5. Mark queue items as done/failed

Usage:
    python -m scripts.process_scrape_queue
"""

from __future__ import annotations

import asyncio
import logging
import statistics
import sys
import os
from datetime import datetime

# Ensure project root is on sys.path when running as a script
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from apify_client import ApifyClientAsync

from app.config import get_settings
from app.database.repositories.scrape_queue import get_scrape_queue_repository
from app.database.repositories.creator import get_creator_repository
from app.services.ai_profile import generate_ai_profile, generate_content_embedding

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

BATCH_SIZE = 100


# ── Helpers ──────────────────────────────────────────────────────────

def get_creator_tier(followers: int | None) -> str | None:
    """Classify creator by follower count."""
    if followers is None:
        return None
    if followers < 20_000:
        return "Nano"
    if followers <= 100_000:
        return "Micro"
    if followers <= 500_000:
        return "Macro"
    if followers <= 1_000_000:
        return "Mega"
    return "Celeb"


# ── Apify Scrapers ───────────────────────────────────────────────────

async def fetch_profile(client: ApifyClientAsync, username: str) -> dict | None:
    """Fetch profile identity using coderx/instagram-profile-scraper-bio-posts"""
    run_input = {"usernames": [username]}
    try:
        run = await client.actor("coderx/instagram-profile-scraper-bio-posts").call(
            run_input=run_input,
            timeout_secs=600,
        )
        async for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            return item
    except Exception as e:
        logger.error(f"Failed to fetch profile for {username}: {e}")
    return None


async def fetch_reels(client: ApifyClientAsync, username: str) -> list[dict]:
    """Fetch reels performance using apify/instagram-reel-scraper"""
    run_input = {
        "includeDownloadedVideo": False,
        "includeSharesCount": False,
        "includeTranscript": False,
        "resultsLimit": 12,
        "skipPinnedPosts": True,
        "username": [username]
    }
    reels = []
    try:
        run = await client.actor("apify/instagram-reel-scraper").call(
            run_input=run_input,
            timeout_secs=600,
        )
        async for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            reels.append(item)
    except Exception as e:
        logger.error(f"Failed to fetch reels for {username}: {e}")
    return reels


# ── Processing logic ─────────────────────────────────────────────────

async def process_username(
    username: str,
    queue_id: str,
    client: ApifyClientAsync,
    queue_repo,
    creator_repo
) -> None:
    """
    Process a single username via the Two-Step Scraping Chain
    """
    logger.info(f"Processing @{username} (Dual fetch)...")

    # --- Step 1: The Dual Fetch ---
    profile_task = asyncio.create_task(fetch_profile(client, username))
    reels_task = asyncio.create_task(fetch_reels(client, username))
    
    # Run API calls concurrently
    try:
        profile, reels = await asyncio.gather(profile_task, reels_task)
    except Exception as e:
        logger.error(f"Dual fetch failed for @{username}: {e}", exc_info=True)
        queue_repo.mark_failed(queue_id)
        return

    if not profile:
        logger.error(f"Could not fetch profile identity for @{username}.")
        queue_repo.mark_failed(queue_id)
        return

    try:
        # --- Step 2: The Math Engine ---
        video_play_counts = []
        total_likes = 0
        total_comments = 0
        total_views = 0

        for reel in reels:
            play_count = reel.get("videoPlayCount")
            if play_count is not None and play_count > 0:
                video_play_counts.append(play_count)
                total_views += play_count
                total_likes += reel.get("likesCount") or 0
                total_comments += reel.get("commentsCount") or 0

        average_views = None
        true_er = None

        if video_play_counts:
            average_views = int(statistics.median(video_play_counts))

        if total_views > 0:
            true_er = round(((total_likes + total_comments) / total_views) * 100, 2)

        followers_count = profile.get("followersCount")
        creator_tier = get_creator_tier(followers_count)

        # --- Step 3: The LLM Extraction ---
        biography = profile.get("biography") or ""
        captions = [r.get("caption") or "" for r in reels if r.get("caption")]
        
        ai_profile_data = None
        account_type = None
        
        if biography or captions:
            # AI profile (structured LLM output)
            ai_profile = generate_ai_profile(biography, captions)
            if ai_profile:
                ai_profile_data = ai_profile.model_dump()
                account_type = ai_profile_data.get("account_type")
                logger.info(f"Generated AI profile for @{username} (Type: {account_type})")
            else:
                logger.warning(f"AI profile generation failed for @{username}")


        # Merge data to match schema
        enrichment_data = {
            "name": profile.get("fullName") or username,
            "platform": "instagram",
            "social_media_handle": username,
            "profile_id": str(profile.get("id") or ""),
            "profile_url": f"https://www.instagram.com/{username}",
            "profile_image_url": profile.get("hdProfilePicUrl") or profile.get("profilePicUrl") or "",
            "account_type": account_type,
            "followers_count": followers_count,
            "posts_count": profile.get("postsCount"),
            "is_verified": profile.get("verified", False),
            "average_views": average_views,
            "total_views": None,
            "true_er": true_er,
            "creator_tier": creator_tier,
            "ai_profile": ai_profile_data,
        }

        # Remove None/empty values (but allow ai_profile to be processed if None? Handled by dict comprehension)
        enrichment_data = {
            k: v for k, v in enrichment_data.items() if v is not None and v != ""
        }

        # Upsert creator
        result = (
            creator_repo._client.table(creator_repo.TABLE_NAME)
            .upsert(enrichment_data, on_conflict="platform,social_media_handle")
            .execute()
        )
        creator_row = result.data[0] if result.data else None

        if not creator_row:
            logger.error(f"Failed to upsert creator @{username}")
            queue_repo.mark_failed(queue_id)
            return

        creator_id = creator_row["id"]

        creator_repo._client.table(creator_repo.TABLE_NAME).update(
            {"followers_updated_at": datetime.utcnow().isoformat()}
        ).eq("id", creator_id).execute()

        logger.info(
            f"Upserted creator @{username} (id={creator_id}) "
            f"tier={creator_tier} avg_views={average_views} "
            f"true_er={true_er}"
        )

        if biography or captions:
            # Content embedding (vector for similarity search)
            embedding = generate_content_embedding(biography, captions)
            if embedding:
                # pgvector expects a string like '[0.1, 0.2, ...]'
                embedding_str = "[" + ",".join(str(v) for v in embedding) + "]"
                creator_repo._client.table(creator_repo.TABLE_NAME).update(
                    {"content_embedding": embedding_str}
                ).eq("id", creator_id).execute()
                logger.info(f"Stored content embedding for @{username}")
            else:
                logger.warning(f"Embedding generation failed for @{username}")
        else:
            logger.info(f"No bio/captions for @{username}, skipping AI profile & embedding.")

        # Mark done
        queue_repo.mark_done(queue_id)

    except Exception as e:
        logger.error(f"Error processing @{username}: {e}", exc_info=True)
        queue_repo.mark_failed(queue_id)


async def main_async() -> None:
    settings = get_settings()
    queue_repo = get_scrape_queue_repository()
    creator_repo = get_creator_repository()

    reset_count = queue_repo.reset_stuck_processing(older_than_minutes=30)
    if reset_count:
        logger.info(f"Reset {reset_count} stuck processing items.")

    pending = queue_repo.get_pending(limit=BATCH_SIZE)
    if not pending:
        logger.info("No pending items in scrape queue. Exiting.")
        return

    logger.info(f"Processing {len(pending)} items from scrape queue.")

    ids = [item["id"] for item in pending]
    queue_repo.mark_processing(ids)

    apify_client = ApifyClientAsync(settings.apify_api_token)

    for item in pending:
        username = item["username"].lower().strip()
        queue_id = item["id"]
        if username:
            await process_username(username, queue_id, apify_client, queue_repo, creator_repo)
        else:
            queue_repo.mark_failed(queue_id)

    logger.info("Queue processing complete.")


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
