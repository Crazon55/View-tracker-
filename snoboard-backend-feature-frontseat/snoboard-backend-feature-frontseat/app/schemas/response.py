"""Response schemas."""
from pydantic import BaseModel


class ApiResponse(BaseModel):
    success: bool
    message: str
    data: dict | list | None = None


class ScrapeStatusResponse(BaseModel):
    success: bool
    reels_updated: int
    errors: list[str] = []
