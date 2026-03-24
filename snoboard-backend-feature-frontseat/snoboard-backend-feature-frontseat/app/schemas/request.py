"""Request schemas."""
from pydantic import BaseModel
from datetime import datetime


class PageCreate(BaseModel):
    handle: str
    name: str | None = None
    profile_url: str | None = None
    auto_scrape: bool = False


class PageUpdate(BaseModel):
    handle: str | None = None
    name: str | None = None
    profile_url: str | None = None
    followers_count: int | None = None
    auto_scrape: bool | None = None


class ScrapeRequest(BaseModel):
    since_date: str | None = None  # YYYY-MM-DD, defaults to last Monday


class PostCreate(BaseModel):
    page_id: str
    url: str
    expected_views: int = 0
    actual_views: int = 0


class PostUpdate(BaseModel):
    expected_views: int | None = None
    actual_views: int | None = None


class ReelCreate(BaseModel):
    page_id: str
    url: str
    views: int = 0
    posted_at: str | None = None
    auto_scrape: bool = False


class ReelUpdate(BaseModel):
    views: int | None = None
    posted_at: str | None = None
