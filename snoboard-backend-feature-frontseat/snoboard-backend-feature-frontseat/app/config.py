"""
Application configuration using Pydantic Settings.
Loads configuration from environment variables.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=str(_BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Apify Configuration
    apify_api_token: str
    apify_timeout_sec: int = 300  # Default fallback timeout (5 minutes)

    # Supabase Configuration
    supabase_url: str
    supabase_key: str
    # Project JWT secret (Supabase → Project Settings → API → JWT Secret)
    supabase_jwt_secret: str = ""

    # Direct Postgres (seeding module — Supabase → Project Settings → Database → URI)
    database_url: str = ""
    supabase_db_url: str = ""
    supabase_db_password: str = ""

    # Apify Actor IDs
    instagram_actor_id: str = "apify/instagram-post-scraper"
    instagram_profile_actor_id: str = "xMc5Ga1oCONPmWJIa"

    # Tavily (News scraping)
    tavily_api_key: str = ""

    # Anthropic (Claude AI)
    anthropic_api_key: str = ""

    # Service URL (for internal self-calls)
    service_url: str = "http://localhost:8001"


@lru_cache
def get_settings() -> Settings:
    """
    Get cached settings instance.
    Uses lru_cache to avoid reloading settings on every call.
    """
    return Settings()
