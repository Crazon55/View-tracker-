"""
MongoDB-compatible async Postgres layer for server.py migration.
Uses asyncpg with a subset of Motor query syntax ($in, $ne, $gte, $lte).
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

import asyncpg

JSONB_COLUMNS = {"assets_or_reference_links"}

# TEXT columns that store ISO-8601 strings. They must stay strings — asyncpg
# rejects a datetime for a text column — so skip _parse_value's str->datetime
# coercion for these (unlike real TIMESTAMPTZ columns such as created_at).
TEXT_DATE_COLUMNS = {"payment_due_date", "go_live_date_time"}

# Matches ISO datetimes AND date-only strings (e.g. "2026-05-31"), so date filters
# on TIMESTAMPTZ columns are coerced to real datetimes rather than passed as str.
ISO_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}:\d{2})?"
)


def _parse_value(v: Any) -> Any:
    if isinstance(v, str) and ISO_RE.match(v):
        try:
            d = datetime.fromisoformat(v.replace("Z", "+00:00"))
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            return v
    return v


def _row_to_doc(row: asyncpg.Record, table: str) -> dict:
    doc = dict(row)
    for col in JSONB_COLUMNS:
        if col in doc and doc[col] is not None and isinstance(doc[col], str):
            try:
                doc[col] = json.loads(doc[col])
            except json.JSONDecodeError:
                pass
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc


@dataclass
class UpdateResult:
    matched_count: int = 0
    modified_count: int = 0
    upserted_id: Optional[str] = None


@dataclass
class DeleteResult:
    deleted_count: int = 0


class Cursor:
    def __init__(self, collection: "Collection", where: str, params: List[Any], projection: dict):
        self._collection = collection
        self._where = where
        self._params = params
        self._projection = projection
        self._sort_field: Optional[str] = None
        self._sort_dir = 1
        self._limit: Optional[int] = None

    def sort(self, field: str, direction: int = 1) -> "Cursor":
        self._sort_field = field
        self._sort_dir = direction
        return self

    async def to_list(self, length: int = 1000) -> List[dict]:
        self._limit = length
        return await self._fetch()

    def __aiter__(self) -> AsyncIterator[dict]:
        return self._iter()

    async def _iter(self) -> AsyncIterator[dict]:
        rows = await self._fetch()
        for r in rows:
            yield r

    async def _fetch(self) -> List[dict]:
        cols = self._collection._select_columns(self._projection)
        order = ""
        if self._sort_field:
            direction = "ASC" if self._sort_dir >= 0 else "DESC"
            order = f' ORDER BY "{self._sort_field}" {direction}'
        limit = f" LIMIT {int(self._limit)}" if self._limit else ""
        sql = f'SELECT {cols} FROM "{self._collection.table}" WHERE {self._where}{order}{limit}'
        pool = await self._collection.db.get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(sql, *self._params)
        return [_row_to_doc(r, self._collection.table) for r in rows]


class Collection:
    def __init__(self, db: "Database", table: str):
        self.db = db
        self.table = table

    def _select_columns(self, projection: Optional[dict]) -> str:
        if not projection or projection == {"_id": 0}:
            return "*"
        include = [k for k, v in projection.items() if k != "_id" and v]
        if not include:
            return "*"
        return ", ".join(f'"{c}"' for c in include)

    def _build_where(self, filt: dict) -> Tuple[str, List[Any]]:
        if filt.get("_id") == "__none__":
            return "FALSE", []
        if not filt:
            return "TRUE", []

        clauses: List[str] = []
        params: List[Any] = []
        idx = 1

        for key, val in filt.items():
            if key == "_id":
                continue
            col = f'"{key}"'
            if isinstance(val, dict):
                if "$in" in val:
                    items = val["$in"]
                    if not items:
                        return "FALSE", []
                    placeholders = ", ".join(f"${idx + i}" for i in range(len(items)))
                    clauses.append(f"{col} IN ({placeholders})")
                    params.extend(items)
                    idx += len(items)
                elif "$ne" in val:
                    ne = val["$ne"]
                    if ne is False:
                        clauses.append(f"({col} IS TRUE OR {col} IS NULL)")
                    elif ne is True:
                        clauses.append(f"({col} IS FALSE OR {col} IS NULL)")
                    else:
                        clauses.append(f"({col} IS DISTINCT FROM ${idx})")
                        params.append(ne)
                        idx += 1
                elif "$gte" in val or "$lte" in val:
                    if "$gte" in val:
                        clauses.append(f"{col} >= ${idx}")
                        params.append(val["$gte"] if key in TEXT_DATE_COLUMNS else _parse_value(val["$gte"]))
                        idx += 1
                    if "$lte" in val:
                        clauses.append(f"{col} <= ${idx}")
                        params.append(val["$lte"] if key in TEXT_DATE_COLUMNS else _parse_value(val["$lte"]))
                        idx += 1
                else:
                    raise ValueError(f"Unsupported operator in filter: {val}")
            else:
                if val is None:
                    clauses.append(f"{col} IS NULL")
                else:
                    clauses.append(f"{col} = ${idx}")
                    params.append(val if key in TEXT_DATE_COLUMNS else _parse_value(val))
                    idx += 1

        return " AND ".join(clauses) if clauses else "TRUE", params

    async def find_one(self, filt: dict, projection: Optional[dict] = None) -> Optional[dict]:
        where, params = self._build_where(filt)
        cols = self._select_columns(projection)
        sql = f'SELECT {cols} FROM "{self.table}" WHERE {where} LIMIT 1'
        pool = await self.db.get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(sql, *params)
        return _row_to_doc(row, self.table) if row else None

    def find(self, filt: dict, projection: Optional[dict] = None) -> Cursor:
        where, params = self._build_where(filt)
        return Cursor(self, where, params, projection or {"_id": 0})

    async def insert_one(self, doc: dict) -> None:
        await self.insert_many([doc])

    async def insert_many(self, docs: List[dict]) -> None:
        if not docs:
            return
        pool = await self.db.get_pool()
        async with pool.acquire() as conn:
            for doc in docs:
                row = dict(doc)
                for col in JSONB_COLUMNS:
                    if col in row and not isinstance(row[col], str):
                        row[col] = json.dumps(row[col])
                cols = list(row.keys())
                placeholders = ", ".join(f"${i + 1}" for i in range(len(cols)))
                col_names = ", ".join(f'"{c}"' for c in cols)
                vals = [row[c] if c in TEXT_DATE_COLUMNS else _parse_value(row[c]) for c in cols]
                sql = f'INSERT INTO "{self.table}" ({col_names}) VALUES ({placeholders})'
                await conn.execute(sql, *vals)

    async def update_one(
        self,
        filt: dict,
        update: dict,
        upsert: bool = False,
    ) -> UpdateResult:
        set_doc = update.get("$set", update)
        where, params = self._build_where(filt)
        pool = await self.db.get_pool()
        async with pool.acquire() as conn:
            existing = await conn.fetchrow(
                f'SELECT * FROM "{self.table}" WHERE {where} LIMIT 1', *params
            )
            if not existing:
                if not upsert:
                    return UpdateResult(matched_count=0)
                # upsert: merge filter keys into new row
                new_row = {k: v for k, v in filt.items() if not isinstance(v, dict)}
                new_row.update(set_doc)
                if self.table == "seeding_payments" and "payment_id" not in new_row:
                    from uuid import uuid4
                    new_row.setdefault("payment_id", f"pay_{uuid4().hex[:12]}")
                await self.insert_one(new_row)
                return UpdateResult(matched_count=0, modified_count=1, upserted_id=new_row.get(list(filt.keys())[0]))

            set_parts: List[str] = []
            set_params: List[Any] = list(params)
            base = len(params) + 1
            for i, (k, v) in enumerate(set_doc.items()):
                set_parts.append(f'"{k}" = ${base + i}')
                if k in JSONB_COLUMNS and not isinstance(v, str):
                    set_params.append(json.dumps(v))
                elif k in TEXT_DATE_COLUMNS:
                    set_params.append(v)
                else:
                    set_params.append(_parse_value(v))
            set_sql = ", ".join(set_parts)
            sql = f'UPDATE "{self.table}" SET {set_sql} WHERE {where}'
            result = await conn.execute(sql, *set_params)
            count = int(result.split()[-1]) if result else 0
            return UpdateResult(matched_count=1, modified_count=count)

    async def delete_one(self, filt: dict) -> DeleteResult:
        where, params = self._build_where(filt)
        pool = await self.db.get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(f'DELETE FROM "{self.table}" WHERE {where}', *params)
        count = int(result.split()[-1]) if result else 0
        return DeleteResult(deleted_count=count)

    async def delete_many(self, filt: dict) -> DeleteResult:
        return await self.delete_one(filt)

    async def count_documents(self, filt: dict) -> int:
        where, params = self._build_where(filt)
        pool = await self.db.get_pool()
        async with pool.acquire() as conn:
            val = await conn.fetchval(f'SELECT COUNT(*) FROM "{self.table}" WHERE {where}', *params)
        return int(val or 0)


@dataclass
class Database:
    dsn: str
    _pool: Optional[asyncpg.Pool] = field(default=None, repr=False)

    async def get_pool(self) -> asyncpg.Pool:
        if self._pool is None:
            # statement_cache_size=0 is required for Supabase's transaction pooler
            # (pgbouncer in transaction mode does not support prepared statements).
            self._pool = await asyncpg.create_pool(
                self.dsn, min_size=1, max_size=10, statement_cache_size=0
            )
        return self._pool

    async def close(self) -> None:
        if self._pool:
            await self._pool.close()
            self._pool = None

    # Tables are namespaced `seeding_` in the FSOS Supabase (see
    # migrations/seeding_integration_v1.sql). The property names below stay bare
    # so the ported server.py keeps calling db.deals / db.users unchanged.
    #   users         -> seeding_profiles (identity anchor synced from auth)
    #   user_sessions -> seeding_user_sessions (deprecated after JWT cutover)
    @property
    def users(self) -> Collection:
        return Collection(self, "seeding_profiles")

    @property
    def user_sessions(self) -> Collection:
        return Collection(self, "seeding_user_sessions")

    @property
    def business_teams(self) -> Collection:
        return Collection(self, "seeding_business_teams")

    @property
    def monetisable_pages(self) -> Collection:
        return Collection(self, "seeding_monetisable_pages")

    @property
    def deals(self) -> Collection:
        return Collection(self, "seeding_deals")

    @property
    def deliverables(self) -> Collection:
        return Collection(self, "seeding_deliverables")

    @property
    def fulfillment_outputs(self) -> Collection:
        return Collection(self, "seeding_fulfillment_outputs")

    @property
    def internal_notes(self) -> Collection:
        return Collection(self, "seeding_internal_notes")

    @property
    def client_feedback(self) -> Collection:
        return Collection(self, "seeding_client_feedback")

    @property
    def payments(self) -> Collection:
        return Collection(self, "seeding_payments")

    @property
    def files(self) -> Collection:
        return Collection(self, "seeding_files")


_db: Optional[Database] = None


def resolve_database_dsn() -> str:
    """Resolve a Postgres DSN from env / settings (seeding uses direct asyncpg)."""
    import os
    import re
    from urllib.parse import quote_plus

    from app.config import get_settings

    settings = get_settings()
    candidates = [
        os.environ.get("DATABASE_URL", "").strip(),
        os.environ.get("SUPABASE_DB_URL", "").strip(),
        os.environ.get("POSTGRES_URL", "").strip(),
        os.environ.get("DIRECT_URL", "").strip(),
        settings.database_url.strip(),
        settings.supabase_db_url.strip(),
    ]
    for dsn in candidates:
        if dsn:
            return dsn

    password = (
        os.environ.get("SUPABASE_DB_PASSWORD", "").strip()
        or os.environ.get("DB_PASSWORD", "").strip()
        or os.environ.get("POSTGRES_PASSWORD", "").strip()
        or settings.supabase_db_password.strip()
    )
    supabase_url = (os.environ.get("SUPABASE_URL") or settings.supabase_url or "").strip().rstrip("/")
    match = re.match(r"https://([a-z0-9]+)\.supabase\.co", supabase_url, re.I)
    if password and match:
        ref = match.group(1)
        return f"postgresql://postgres:{quote_plus(password)}@db.{ref}.supabase.co:5432/postgres"

    raise RuntimeError(
        "DATABASE_URL or SUPABASE_DB_URL is required "
        "(Supabase → Project Settings → Database → Connection string → URI)"
    )


def get_database() -> Database:
    global _db
    if _db is None:
        _db = Database(dsn=resolve_database_dsn())
    return _db


class _LazyDatabase:
    """Defer DSN resolution until first use so app import does not require DB env."""

    def __getattr__(self, name: str) -> Any:
        return getattr(get_database(), name)


lazy_database = _LazyDatabase()
