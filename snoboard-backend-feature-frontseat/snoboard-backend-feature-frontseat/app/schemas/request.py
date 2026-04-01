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
    posted_at: str | None = None
    idea_id: str | None = None


class ReelCreate(BaseModel):
    page_id: str
    url: str
    views: int = 0
    posted_at: str | None = None
    auto_scrape: bool = False
    idea_id: str | None = None


class ReelUpdate(BaseModel):
    views: int | None = None
    posted_at: str | None = None
    idea_id: str | None = None


class PostUpdate(BaseModel):
    expected_views: int | None = None
    actual_views: int | None = None
    posted_at: str | None = None
    idea_id: str | None = None


# --- Content Strategists ---
class CSCreate(BaseModel):
    name: str
    role: str | None = None


class CSUpdate(BaseModel):
    name: str | None = None
    role: str | None = None


# --- Ideas ---
class IdeaCreate(BaseModel):
    hook: str
    cs_owner_id: str | None = None
    format: str = "reel"
    source: str = "original"
    status: str = "active"
    notes: str | None = None
    distributed_to: list[str] | None = None


class IdeaUpdate(BaseModel):
    hook: str | None = None
    cs_owner_id: str | None = None
    format: str | None = None
    source: str | None = None
    status: str | None = None
    notes: str | None = None
    distributed_to: list[str] | None = None


# --- Chat ---
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
