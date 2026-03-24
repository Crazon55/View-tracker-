"""Data models for the view tracker."""
from dataclasses import dataclass, field


@dataclass
class PostMetrics:
    """Scraped post metrics from Apify."""
    url: str = ""
    platform: str = ""
    creator_handle: str = ""
    views: int = 0
    likes: int = 0
    comments: int = 0
    shares: int = 0
    quotes: int = 0
    bookmarks: int = 0
    post_id: str = ""
    description: str = ""
    posted_at: str = ""


@dataclass
class CreatorData:
    """Creator data from Apify."""
    name: str = ""
    platform: str = ""
    social_media_handle: str = ""
    profile_id: str = ""
    profile_url: str = ""
    profile_image_url: str = ""
    followers_count: int | None = None
    posts_count: int | None = None
    is_verified: bool = False


@dataclass
class ScrapeResult:
    """Result of a scraping operation."""
    posts: list[PostMetrics] = field(default_factory=list)
    creators: list[CreatorData] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
