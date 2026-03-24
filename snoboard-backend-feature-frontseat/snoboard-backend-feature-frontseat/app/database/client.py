"""
Supabase client configuration.
Provides a singleton client instance for database operations.
"""

from functools import lru_cache

from supabase import create_client, Client

from app.config import get_settings


@lru_cache
def get_supabase_client() -> Client:
    """
    Get or create the Supabase client.

    Uses lru_cache to ensure a single client instance is reused.

    Returns:
        Supabase Client instance.
    """
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_key)
