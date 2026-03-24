"""
Instagram scraper using Apify actor: apify/instagram-post-scraper
"""

from __future__ import annotations

from typing import Any

from app.config import get_settings
from app.database.models import CreatorData, PostMetrics
from app.services.apify.base import BaseApifyScraper


class InstagramScraper(BaseApifyScraper):
    """Scraper for Instagram posts and reels."""

    def _get_actor_id(self) -> str:
        """Get the Instagram actor ID."""
        return get_settings().instagram_actor_id

    def _build_input(self, urls: list[str]) -> dict[str, Any]:
        """
        Build input for the Instagram scraper.

        Expected input format for apify/instagram-post-scraper:
        {
            "resultsLimit": 1,
            "skipPinnedPosts": true,
            "username": ["https://www.instagram.com/reel/..."]
        }
        """
        # Normalize: actor only accepts /reel/, not /reels/
        normalized_urls = [
            url.replace("/reels/", "/reel/") for url in urls
        ]
        return {
            "resultsLimit": 1,
            "skipPinnedPosts": True,
            "username": normalized_urls,
        }

    def _parse_post(self, item: dict[str, Any], original_url: str) -> PostMetrics:
        """
        Parse Instagram post data.

        Field mappings from API response:
        - ownerUsername -> creator_handle
        - videoPlayCount / videoViewCount -> views
        - likesCount -> likes
        - commentsCount -> comments
        - (no shares available)
        """
        # Get views - prefer videoPlayCount, fallback to videoViewCount
        views = 0
        if item.get("videoPlayCount"):
            views = int(item["videoPlayCount"])
        elif item.get("videoViewCount"):
            views = int(item["videoViewCount"])

        likes = max(0, int(item.get("likesCount", 0)))

        return PostMetrics(
            url=item.get("url", "") or item.get("inputUrl", original_url),
            platform="instagram",
            creator_handle=item.get("ownerUsername", ""),
            views=views,
            likes=likes,
            comments=int(item.get("commentsCount", 0)),
            shares=0,  # Not available in Instagram API
            quotes=0,
            bookmarks=0,
            post_id=item.get("shortCode", "") or item.get("id", ""),
            description=item.get("caption", "")[:500] if item.get("caption") else "",
            posted_at=item.get("timestamp", ""),
        )

    def _parse_creator(self, item: dict[str, Any]) -> CreatorData | None:
        """
        Parse Instagram creator data.

        Field mappings from API response:
        - ownerUsername -> social_media_handle
        - ownerId -> profile_id
        - ownerFullName -> name
        - (followers_count not available from post data)
        - (posts_count not available from post data)
        - (is_verified not available from post data)
        """
        owner_id = item.get("ownerId")
        if not owner_id:
            return None

        username = item.get("ownerUsername", "")
        full_name = item.get("ownerFullName", "") or username

        return CreatorData(
            name=full_name,
            platform="instagram",
            social_media_handle=username,
            profile_id=str(owner_id),
            profile_url=f"https://www.instagram.com/{username}" if username else "",
            profile_image_url="",  # Not available in this response
            followers_count=None,  # Not available from post data
            posts_count=None,  # Not available from post data
            is_verified=False,  # Not available from post data
        )


# Singleton instance
_instagram_scraper: InstagramScraper | None = None


def get_instagram_scraper() -> InstagramScraper:
    """Get or create the Instagram scraper instance."""
    global _instagram_scraper
    if _instagram_scraper is None:
        _instagram_scraper = InstagramScraper()
    return _instagram_scraper
