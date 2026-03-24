"""Repository for pages table."""
from app.database.client import get_supabase_client


class PageRepository:
    def __init__(self):
        self._client = get_supabase_client()

    def get_all(self):
        return self._client.table("pages").select("*").order("created_at", desc=True).execute().data

    def get_auto_scrape(self):
        """Get pages marked for auto-scraping (Main IPs)."""
        return self._client.table("pages").select("*").eq("auto_scrape", True).execute().data

    def get_by_id(self, page_id: str):
        result = self._client.table("pages").select("*").eq("id", page_id).execute().data
        return result[0] if result else None

    def get_by_handle(self, handle: str):
        result = self._client.table("pages").select("*").eq("handle", handle.lower()).execute().data
        return result[0] if result else None

    def create(self, data: dict):
        return self._client.table("pages").insert(data).execute().data[0]

    def update(self, page_id: str, data: dict):
        return self._client.table("pages").update(data).eq("id", page_id).execute().data[0]

    def delete(self, page_id: str):
        return self._client.table("pages").delete().eq("id", page_id).execute()


def get_page_repository():
    return PageRepository()
