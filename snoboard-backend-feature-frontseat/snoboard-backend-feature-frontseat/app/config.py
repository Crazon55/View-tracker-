"""
Application configuration using Pydantic Settings.
Loads configuration from environment variables.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Apify Configuration
    apify_api_token: str
    apify_timeout_sec: int = 300  # Default fallback timeout (5 minutes)

    # Supabase Configuration
    supabase_url: str
    supabase_key: str

    # Apify Actor IDs
    instagram_actor_id: str = "apify/instagram-post-scraper"
    instagram_profile_actor_id: str = "xMc5Ga1oCONPmWJIa"

    # Service URL (for internal self-calls)
    service_url: str = "http://localhost:8001"


@lru_cache
def get_settings() -> Settings:
    """
    Get cached settings instance.
    Uses lru_cache to avoid reloading settings on every call.
    """
    return Settings()
