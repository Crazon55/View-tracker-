"""Repository for dashboard_views table."""
from app.database.client import get_supabase_client


class DashboardViewsRepository:
    def __init__(self):
        self._client = get_supabase_client()

    def get_by_page(self, page_id: str):
        return self._client.table("dashboard_views").select("*").eq("page_id", page_id).order("month", desc=True).execute().data

    def get_all(self):
        return self._client.table("dashboard_views").select("*").order("month", desc=True).execute().data

    def upsert(self, data: dict):
        return self._client.table("dashboard_views").upsert(data, on_conflict="page_id,month").execute().data[0]

    def delete(self, entry_id: str):
        return self._client.table("dashboard_views").delete().eq("id", entry_id).execute()


def get_dashboard_views_repository():
    return DashboardViewsRepository()
