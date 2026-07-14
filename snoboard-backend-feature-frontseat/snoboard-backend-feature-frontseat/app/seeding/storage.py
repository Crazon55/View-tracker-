"""Supabase Storage adapter for file uploads."""
from __future__ import annotations

import logging
import os
from typing import Optional, Tuple

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
STORAGE_BUCKET = os.environ.get("SUPABASE_STORAGE_BUCKET", "uploads")


def _headers() -> dict:
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(500, "Storage not configured")
    return {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "apikey": SUPABASE_SERVICE_KEY,
    }


def storage_available() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)


def put_object(path: str, data: bytes, content_type: str) -> dict:
    url = f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{path}"
    with httpx.Client(timeout=120) as client:
        r = client.post(
            url,
            headers={**_headers(), "Content-Type": content_type, "x-upsert": "true"},
            content=data,
        )
        if r.status_code not in (200, 201):
            logger.error("Storage upload failed: %s %s", r.status_code, r.text)
            raise HTTPException(500, "Storage upload failed")
    return {"path": path, "size": len(data)}


def get_object(path: str) -> Tuple[bytes, str]:
    url = f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{path}"
    with httpx.Client(timeout=60) as client:
        r = client.get(url, headers=_headers())
        if r.status_code != 200:
            raise HTTPException(404, "File not found in storage")
        ct = r.headers.get("Content-Type", "application/octet-stream")
        return r.content, ct


def init_storage() -> Optional[str]:
    if storage_available():
        logger.info("Supabase storage ready (bucket=%s)", STORAGE_BUCKET)
        return "supabase"
    logger.warning("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — storage disabled")
    return None
