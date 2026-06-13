"""Request schemas."""
from pydantic import BaseModel
from datetime import datetime


class PageCreate(BaseModel):
    handle: str
    name: str | None = None
    profile_url: str | None = None
    auto_scrape: bool = False
    stage: int = 1


class PageUpdate(BaseModel):
    handle: str | None = None
    name: str | None = None
    profile_url: str | None = None
    followers_count: int | None = None
    auto_scrape: bool | None = None
    stage: int | None = None


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
    page_id: str | None = None
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
    hook_variations: list[str] | None = None
    cs_owner_id: str | None = None
    cdi_owner_id: str | None = None
    executor_name: str | None = None
    created_by: str | None = None
    format: str = "reel"
    source: str = "original"
    status: str = "draft"
    notes: str | None = None
    distributed_to: list[str] | None = None
    yt_url: str | None = None
    timestamps: str | None = None
    base_drive_link: str | None = None
    edited_drive_link: str | None = None
    pintu_batch_link: str | None = None
    comp_link: str | None = None
    canva_link: str | None = None
    deadline: str | None = None


class IdeaUpdate(BaseModel):
    hook: str | None = None
    hook_variations: list[str] | None = None
    cs_owner_id: str | None = None
    cdi_owner_id: str | None = None
    executor_name: str | None = None
    created_by: str | None = None
    format: str | None = None
    source: str | None = None
    status: str | None = None
    notes: str | None = None
    distributed_to: list[str] | None = None
    yt_url: str | None = None
    timestamps: str | None = None
    base_drive_link: str | None = None
    edited_drive_link: str | None = None
    pintu_batch_link: str | None = None
    comp_link: str | None = None
    canva_link: str | None = None
    deadline: str | None = None


# --- Content Entries ---
class ContentEntryCreate(BaseModel):
    page_id: str
    idea_name: str
    ips: str | None = None
    ips_to_distribute: list[str] | None = None
    content_type: str = "reel"
    created_by: str | None = None
    idea_status: str = "draft"
    upload_date: str | None = None
    frame_link: str | None = None
    content_buckets: str | None = None
    comp_link: str | None = None
    views: int = 0
    url: str | None = None
    notes: str | None = None
    deadline: str | None = None
    assigned_role: str | None = None


class ContentEntryUpdate(BaseModel):
    page_id: str | None = None
    idea_name: str | None = None
    ips: str | None = None
    ips_to_distribute: list[str] | None = None
    content_type: str | None = None
    created_by: str | None = None
    idea_status: str | None = None
    upload_date: str | None = None
    frame_link: str | None = None
    content_buckets: str | None = None
    comp_link: str | None = None
    views: int | None = None
    url: str | None = None
    notes: str | None = None
    deadline: str | None = None
    assigned_role: str | None = None


# --- Chat ---
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


# --- Experiment X ---
class ExpIdeaCreate(BaseModel):
    page_handle: str
    content_type: str = "reel"
    topic: str = ""
    script: str = ""
    status: str = "new"
    views: int = 0
    day_date: str | None = None
    source: str = "original"
    hook_variations: str = ""
    music_ref: str = ""
    frame_link: str = ""
    yt_url: str = ""
    yt_timestamps: str = ""
    comp_link: str = ""
    created_by: str = ""
    edited_by: str = ""
    test_result: str = ""
    video_format: str = ""
    frontseat_pool: bool = False
    source_pool_id: str | None = None
    page_posting_dates: dict = {}
    page_posting_times: dict = {}
    page_captions: dict = {}
    origin_playbook: str | None = None
    origin_idea_id: str | None = None


class ExpIdeaUpdate(BaseModel):
    page_handle: str | None = None
    content_type: str | None = None
    topic: str | None = None
    script: str | None = None
    status: str | None = None
    views: int | None = None
    page_views: dict | None = None
    page_test_results: dict | None = None
    day_date: str | None = None
    source: str | None = None
    hook_variations: str | None = None
    music_ref: str | None = None
    frame_link: str | None = None
    yt_url: str | None = None
    yt_timestamps: str | None = None
    comp_link: str | None = None
    created_by: str | None = None
    currently_editing_by: str | None = None
    edited_by: str | None = None
    test_result: str | None = None
    video_format: str | None = None
    frontseat_pool: bool | None = None
    source_pool_id: str | None = None
    page_posting_dates: dict | None = None
    page_posting_times: dict | None = None
    page_captions: dict | None = None


class ExpSettingsUpdate(BaseModel):
    view_goal: int | None = None
    experiment_start_date: str | None = None  # YYYY-MM-DD
