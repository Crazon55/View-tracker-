"""Repository for reels table."""
from app.database.client import get_supabase_client


class ReelRepository:
    def __init__(self):
        self._client = get_supabase_client()

    def get_all(self):
        """Get all reels."""
        return self._client.table("reels").select("*, pages(handle, name)").order("posted_at", desc=True).execute().data

    def get_manual(self):
        """Get Stage 1 reels (manual, auto_scrape=false)."""
        return self._client.table("reels").select("*, pages(handle, name)").eq("auto_scrape", False).order("posted_at", desc=True).execute().data

    def get_auto(self):
        """Get Main IP reels (auto_scrape=true)."""
        return self._client.table("reels").select("*, pages(handle, name)").eq("auto_scrape", True).order("posted_at", desc=True).execute().data

    def get_by_page(self, page_id: str):
        """Get all reels for a specific page."""
        return self._client.table("reels").select("*").eq("page_id", page_id).order("views", desc=True).execute().data

    def create(self, data: dict):
        return self._client.table("reels").insert(data).execute().data[0]

    def upsert_scraped(self, data: dict):
        """Insert or update a scraped reel (by url)."""
        return self._client.table("reels").upsert(data, on_conflict="url").execute().data[0]

    def update(self, reel_id: str, data: dict):
        return self._client.table("reels").update(data).eq("id", reel_id).execute().data[0]

    def delete(self, reel_id: str):
        return self._client.table("reels").delete().eq("id", reel_id).execute()


def get_reel_repository():
    return ReelRepository()
