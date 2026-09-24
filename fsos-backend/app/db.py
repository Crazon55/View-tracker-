"""Thin PostgREST client for the FSOS Supabase project.

Uses the service key, so it bypasses row-level security: every route must do its own
access check (see app/access.py). Nothing else in the app talks to Supabase directly.
"""
from typing import Any

import httpx
from fastapi import HTTPException

from .config import SERVICE_KEY, SUPABASE_URL

_client = httpx.AsyncClient(
    base_url=f"{SUPABASE_URL}/rest/v1",
    headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
    timeout=20.0,
)


async def _request(method: str, path: str, *, prefer: str | None = None, json: Any = None, params: dict | None = None) -> Any:
    headers = {"Prefer": prefer} if prefer else {}
    try:
        r = await _client.request(method, path, headers=headers, json=json, params=params)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Database unreachable: {exc}") from exc
    if r.status_code >= 400:
        detail = r.text
        try:
            body = r.json()
            detail = body.get("message") or body.get("hint") or detail
        except ValueError:
            pass
        raise HTTPException(status_code=r.status_code if r.status_code < 500 else 502, detail=detail)
    if r.status_code == 204 or not r.content:
        return None
    return r.json()


async def select(table: str, params: dict | None = None) -> list[dict]:
    return await _request("GET", f"/{table}", params=params) or []


async def latest(table: str, column: str) -> tuple[str | None, int]:
    """The newest value of `column` and the table's row count, in one round trip.

    PostgREST puts the total in Content-Range when asked to count, so ordering by the
    timestamp and taking one row answers both "when did this last change" and "how many
    are there" together. The count is what makes a deletion visible: removing a row
    moves no timestamp, and without it a delete would go unnoticed until the next full
    reload. Used only by /api/pulse.
    """
    try:
        r = await _client.get(
            f"/{table}",
            params={"select": column, "order": f"{column}.desc", "limit": 1},
            headers={"Prefer": "count=exact"},
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Database unreachable: {exc}") from exc
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=r.text)
    rows = r.json() or []
    total = r.headers.get("content-range", "/0").split("/")[-1]
    return (rows[0][column] if rows else None), (int(total) if total.isdigit() else 0)


async def select_one(table: str, params: dict | None = None) -> dict | None:
    rows = await select(table, {**(params or {}), "limit": 1})
    return rows[0] if rows else None


async def insert(table: str, payload: Any, *, upsert_on: str | None = None) -> dict | list[dict]:
    params = {"on_conflict": upsert_on} if upsert_on else None
    prefer = "return=representation" + (",resolution=merge-duplicates" if upsert_on else "")
    rows = await _request("POST", f"/{table}", prefer=prefer, json=payload, params=params)
    if isinstance(payload, list):
        return rows or []
    return (rows or [{}])[0]


async def update(table: str, params: dict, payload: dict) -> list[dict]:
    return await _request("PATCH", f"/{table}", prefer="return=representation", json=payload, params=params) or []


async def delete(table: str, params: dict) -> list[dict]:
    return await _request("DELETE", f"/{table}", prefer="return=representation", params=params) or []


async def rpc(fn: str, payload: dict | None = None) -> Any:
    return await _request("POST", f"/rpc/{fn}", json=payload or {})


async def aclose() -> None:
    await _client.aclose()
