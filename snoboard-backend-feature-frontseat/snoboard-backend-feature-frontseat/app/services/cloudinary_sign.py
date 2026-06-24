"""Signed direct-upload params for Cloudinary (browser uploads)."""

from __future__ import annotations

import hashlib
import os
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException


def require_env(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise HTTPException(status_code=500, detail=f"Missing server env var: {name}")
    return value


def cloudinary_signature(params: dict, api_secret: str) -> str:
    signable = {
        k: v
        for k, v in params.items()
        if v is not None and k not in {"file", "api_key", "resource_type", "cloud_name"}
    }
    pairs = [f"{k}={signable[k]}" for k in sorted(signable.keys())]
    base = "&".join(pairs) + api_secret
    return hashlib.sha1(base.encode("utf-8")).hexdigest()


def build_signed_upload(*, folder: str, tags: str, context: str, expires_days: int = 30) -> dict:
    cloud_name = require_env("CLOUDINARY_CLOUD_NAME")
    api_key = require_env("CLOUDINARY_API_KEY")
    api_secret = require_env("CLOUDINARY_API_SECRET")

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=expires_days)
    timestamp = int(now.timestamp())

    params = {
        "timestamp": timestamp,
        "folder": folder,
        "tags": tags,
        "context": context,
    }
    signature = cloudinary_signature(params, api_secret)

    return {
        "cloud_name": cloud_name,
        "api_key": api_key,
        "timestamp": timestamp,
        "signature": signature,
        "upload_url": f"https://api.cloudinary.com/v1_1/{cloud_name}/auto/upload",
        "folder": folder,
        "tags": tags,
        "context": context,
        "expires_at": expires_at.isoformat(),
    }
