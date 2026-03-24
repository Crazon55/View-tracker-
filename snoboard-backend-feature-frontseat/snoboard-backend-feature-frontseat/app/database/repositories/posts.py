"""Repository for posts table."""
from app.database.client import get_supabase_client


class PostRepository:
    def __init__(self):
        self._client = get_supabase_client()

    def get_all(self):
        return self._client.table("posts").select("*, pages(handle, name)").order("created_at", desc=True).execute().data

    def get_by_page(self, page_id: str):
        return self._client.table("posts").select("*, pages(handle, name)").eq("page_id", page_id).order("created_at", desc=True).execute().data

    def create(self, data: dict):
        return self._client.table("posts").insert(data).execute().data[0]

    def update(self, post_id: str, data: dict):
        return self._client.table("posts").update(data).eq("id", post_id).execute().data[0]

    def delete(self, post_id: str):
        return self._client.table("posts").delete().eq("id", post_id).execute()


def get_post_repository():
    return PostRepository()
