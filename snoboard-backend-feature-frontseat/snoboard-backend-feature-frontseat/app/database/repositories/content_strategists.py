"""Repository for content_strategists table."""
from app.database.client import get_supabase_client


class ContentStrategistRepository:
    def __init__(self):
        self._client = get_supabase_client()

    def get_all(self):
        return self._client.table("content_strategists").select("*").order("created_at", desc=True).execute().data

    def get_by_id(self, cs_id: str):
        result = self._client.table("content_strategists").select("*").eq("id", cs_id).execute().data
        return result[0] if result else None

    def create(self, data: dict):
        return self._client.table("content_strategists").insert(data).execute().data[0]

    def update(self, cs_id: str, data: dict):
        return self._client.table("content_strategists").update(data).eq("id", cs_id).execute().data[0]

    def delete(self, cs_id: str):
        return self._client.table("content_strategists").delete().eq("id", cs_id).execute()


def get_cs_repository():
    return ContentStrategistRepository()
