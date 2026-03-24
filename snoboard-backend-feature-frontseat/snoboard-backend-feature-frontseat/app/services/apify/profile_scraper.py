"""
Instagram Profile Reel Scraper using Apify actor: xMc5Ga1oCONPmWJIa (apify/instagram-reel-scraper)
Scrapes all reels from given profile URLs within a date range.
"""

from __future__ import annotations

from typing import Any
from dataclasses import dataclass, field

from apify_client import ApifyClient

from app.config import get_settings


@dataclass
class ScrapedReel:
    """A single reel scraped from a profile."""
    url: str = ""
    views: int = 0
    likes: int = 0
    comments: int = 0
    posted_at: str = ""
    owner_username: str = ""
    shortcode: str = ""


@dataclass
class ProfileScrapeResult:
    """Result of scraping profiles for reels."""
    reels: list[ScrapedReel] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


class ProfileReelScraper:
    """Scrapes reels from Instagram profiles using Apify."""

    def __init__(self) -> None:
        settings = get_settings()
        self._client = ApifyClient(settings.apify_api_token)
        self._actor_id = settings.instagram_profile_actor_id

    def scrape_profiles(
        self,
        profile_urls: list[str],
        since_date: str,
        results_limit: int = 100,
    ) -> ProfileScrapeResult:
        """
        Scrape reels from profiles.

        Args:
            profile_urls: List of Instagram profile URLs.
            since_date: Only get reels posted after this date (YYYY-MM-DD).
            results_limit: Max reels per profile.

        Returns:
            ProfileScrapeResult with all scraped reels.
        """
        result = ProfileScrapeResult()

        if not profile_urls:
            return result

        try:
            run_input = {
                "username": profile_urls,
                "onlyPostsNewerThan": since_date,
                "resultsLimit": results_limit,
                "skipPinnedPosts": True,
                "includeDownloadedVideo": False,
                "includeSharesCount": False,
                "includeTranscript": False,
            }

            run = self._client.actor(self._actor_id).call(
                run_input=run_input,
                timeout_secs=get_settings().apify_timeout_sec,
            )

            items = list(
                self._client.dataset(run["defaultDatasetId"]).iterate_items()
            )

            for item in items:
                try:
                    reel = self._parse_reel(item)
                    if reel:
                        result.reels.append(reel)
                except Exception as e:
                    result.errors.append(f"Error parsing reel: {str(e)}")

        except Exception as e:
            result.errors.append(f"Scraper error: {str(e)}")

        return result

    def _parse_reel(self, item: dict[str, Any]) -> ScrapedReel | None:
        """Parse a reel from the Apify response."""
        # Only process videos (reels)
        if item.get("type") != "Video":
            return None

        views = 0
        if item.get("videoPlayCount"):
            views = int(item["videoPlayCount"])
        elif item.get("videoViewCount"):
            views = int(item["videoViewCount"])

        url = item.get("url", "")
        # Normalize to /reel/ format
        if "/p/" in url:
            url = url.replace("/p/", "/reel/")

        return ScrapedReel(
            url=url,
            views=views,
            likes=int(item.get("likesCount", 0)),
            comments=int(item.get("commentsCount", 0)),
            posted_at=item.get("timestamp", ""),
            owner_username=item.get("ownerUsername", ""),
            shortcode=item.get("shortCode", ""),
        )


# Singleton
_scraper: ProfileReelScraper | None = None

def get_profile_scraper() -> ProfileReelScraper:
    global _scraper
    if _scraper is None:
        _scraper = ProfileReelScraper()
    return _scraper
