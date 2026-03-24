"""
Base Apify service with common functionality.
All platform-specific scrapers inherit from this base class.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from apify_client import ApifyClient

from app.config import get_settings
from app.database.models import CreatorData, PostMetrics, ScrapeResult


class BaseApifyScraper(ABC):
    """Abstract base class for Apify scrapers."""

    def __init__(self) -> None:
        """Initialize the Apify client."""
        settings = get_settings()
        self._client = ApifyClient(settings.apify_api_token)
        self._actor_id = self._get_actor_id()
        self._timeout_secs = self._get_timeout()

    def _get_timeout(self) -> int:
        """Get the timeout for this scraper. Override in subclasses for per-platform timeouts."""
        return get_settings().apify_timeout_sec

    @abstractmethod
    def _get_actor_id(self) -> str:
        """Get the Apify actor ID for this scraper."""
        pass

    @abstractmethod
    def _build_input(self, urls: list[str]) -> dict[str, Any]:
        """
        Build the input payload for the Apify actor.

        Args:
            urls: List of URLs to scrape.

        Returns:
            Input dictionary for the actor.
        """
        pass

    @abstractmethod
    def _parse_post(self, item: dict[str, Any], original_url: str) -> PostMetrics:
        """
        Parse a single post from the actor response.

        Args:
            item: Raw item from Apify response.
            original_url: The original URL that was scraped.

        Returns:
            Parsed PostMetrics object.
        """
        pass

    @abstractmethod
    def _parse_creator(self, item: dict[str, Any]) -> CreatorData | None:
        """
        Parse creator data from the actor response.

        Args:
            item: Raw item from Apify response.

        Returns:
            Parsed CreatorData object or None if not available.
        """
        pass

    def _is_valid_item(self, item: dict[str, Any]) -> bool:
        """
        Check if an item from the response is valid and should be processed.

        Override in subclasses for platform-specific validation.

        Args:
            item: Raw item from Apify response.

        Returns:
            True if item is valid, False to skip it.
        """
        # Default: consider all items valid
        return True

    async def scrape(self, urls: list[str], timeout_secs: int | None = None) -> ScrapeResult:
        """
        Scrape posts from the given URLs.

        Args:
            urls: List of URLs to scrape.
            timeout_secs: Optional timeout override in seconds.
                          If not provided, uses the default from settings.

        Returns:
            ScrapeResult containing posts, creators, and any errors.
        """
        if not urls:
            return ScrapeResult()

        result = ScrapeResult()
        effective_timeout = timeout_secs if timeout_secs is not None else self._timeout_secs

        try:
            # Build input and run the actor
            run_input = self._build_input(urls)
            run = self._client.actor(self._actor_id).call(
                run_input=run_input,
                timeout_secs=effective_timeout,
            )

            # Fetch results from the dataset
            items = list(
                self._client.dataset(run["defaultDatasetId"]).iterate_items()
            )

            # Track seen creators to avoid duplicates
            seen_creator_ids: set[str] = set()

            # Parse each item
            for item in items:
                try:
                    # Skip invalid items
                    if not self._is_valid_item(item):
                        continue

                    # Find matching original URL
                    original_url = self._find_matching_url(item, urls)

                    # Parse post metrics
                    post = self._parse_post(item, original_url)
                    result.posts.append(post)

                    # Parse creator data (if available and not already seen)
                    creator = self._parse_creator(item)
                    if creator and creator.profile_id not in seen_creator_ids:
                        result.creators.append(creator)
                        seen_creator_ids.add(creator.profile_id)

                except Exception as e:
                    result.errors.append(f"Error parsing item: {str(e)}")

        except Exception as e:
            result.errors.append(f"Error running actor {self._actor_id}: {str(e)}")

        return result

    def _find_matching_url(
        self, item: dict[str, Any], urls: list[str]
    ) -> str:
        """
        Find the original URL that matches the scraped item.

        Args:
            item: Scraped item from Apify.
            urls: List of original URLs.

        Returns:
            Matching URL or empty string if not found.
        """
        # Try to match by URL field in the response
        item_url = item.get("url", "") or item.get("inputUrl", "")
        if item_url:
            for url in urls:
                if self._urls_match(url, item_url):
                    return url
        return item_url or (urls[0] if urls else "")

    def _urls_match(self, url1: str, url2: str) -> bool:
        """
        Check if two URLs refer to the same post.

        Args:
            url1: First URL.
            url2: Second URL.

        Returns:
            True if URLs match, False otherwise.
        """
        # Normalize and compare
        url1_clean = url1.lower().rstrip("/").split("?")[0]
        url2_clean = url2.lower().rstrip("/").split("?")[0]
        return url1_clean == url2_clean or url1_clean in url2_clean or url2_clean in url1_clean
