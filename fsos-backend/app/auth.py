"""Who is calling, and what they may do.

The browser sends its Supabase session token. We ask Supabase who that token belongs to
(so no JWT secret is needed here), then look the person up in `people` by email and
resolve their access matrix.
"""
import asyncio
import time

import httpx
from fastapi import Depends, Header, HTTPException

from . import db
from .access import resolve_person_access
from .config import ALLOWED_EMAIL_DOMAIN, ANON_KEY, DEV_LOGIN, SUPABASE_URL

_auth_client = httpx.AsyncClient(base_url=f"{SUPABASE_URL}/auth/v1", timeout=15.0)
_token_cache: dict[str, tuple[float, dict]] = {}  # token -> (expires_at, user)
_TOKEN_TTL = 120.0

# Working out who you are costs two PostgREST round trips — the person, then their
# access overrides — and at ~150ms each that was a third of a second added to every
# request in the app, for an answer that changes maybe twice a week.
#
# So it's cached briefly, keyed by email. Fifteen seconds is short enough that nobody
# waits meaningfully for a role change, and `invalidate_caller` clears it the moment
# access is edited, so the usual case is immediate anyway.
_caller_cache: dict[str, tuple[float, dict, dict]] = {}  # email -> (expires_at, person, access)
_CALLER_TTL = 15.0


def invalidate_caller(email: str | None = None) -> None:
    """Forget cached access. Called whenever roles or overrides change."""
    if email:
        _caller_cache.pop(email.strip().lower(), None)
    else:
        _caller_cache.clear()


async def _supabase_user(token: str) -> dict:
    hit = _token_cache.get(token)
    if hit and hit[0] > time.time():
        return hit[1]
    try:
        r = await _auth_client.get("/user", headers={"Authorization": f"Bearer {token}", "apikey": ANON_KEY})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Auth service unreachable: {exc}") from exc
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Your session has expired — sign in again.")
    user = r.json()
    _token_cache[token] = (time.time() + _TOKEN_TTL, user)
    return user


async def _person_for(email: str, *, auth_user_id: str | None, name_hint: str = "") -> dict:
    email = email.strip().lower()
    person = await db.select_one("people", {"email": f"eq.{email}", "select": "*"})
    if person is None:
        # Known by email from the snoboard import? Adopt that row; otherwise create a pending one.
        person = await db.select_one("people", {"legacy_email": f"eq.{email}", "select": "*"})
    if person is None:
        name = (name_hint or email.split("@")[0]).strip()
        initials = "".join(p[0] for p in name.replace(".", " ").split()[:2]).upper() or "?"
        person = await db.insert("people", {
            "email": email, "name": name, "initials": initials, "roles": [], "streams": ["BO", "HPN"],
        })
    patch = {}
    if auth_user_id and person.get("auth_user_id") != auth_user_id:
        patch["auth_user_id"] = auth_user_id
    if not person.get("email"):
        patch["email"] = email
    if patch:
        rows = await db.update("people", {"id": f"eq.{person['id']}"}, patch)
        person = rows[0] if rows else {**person, **patch}
    return person


class Caller:
    """The signed-in person plus their resolved access matrix."""

    def __init__(self, person: dict, access: dict):
        self.person = person
        self.access = access

    @property
    def id(self) -> str:
        return self.person["id"]

    @property
    def roles(self) -> list[str]:
        return self.person.get("roles") or []

    def can(self, area: str, level: str = "view") -> bool:
        from .access import RANK
        return RANK.get(self.access.get(area, "none"), 0) >= RANK[level]


async def current_caller(
    authorization: str | None = Header(default=None),
    x_fsos_dev_email: str | None = Header(default=None),
) -> Caller:
    email, auth_user_id, name_hint = None, None, ""

    if authorization and authorization.lower().startswith("bearer "):
        user = await _supabase_user(authorization.split(" ", 1)[1].strip())
        email = (user.get("email") or "").lower()
        auth_user_id = user.get("id")
        name_hint = (user.get("user_metadata") or {}).get("full_name") or ""
    elif DEV_LOGIN and x_fsos_dev_email:
        email = x_fsos_dev_email.strip().lower()  # local development only
    if not email:
        raise HTTPException(status_code=401, detail="Sign in to use FSOS.")
    if ALLOWED_EMAIL_DOMAIN and not email.endswith(f"@{ALLOWED_EMAIL_DOMAIN}"):
        raise HTTPException(status_code=403, detail=f"FSOS is limited to @{ALLOWED_EMAIL_DOMAIN} accounts.")

    hit = _caller_cache.get(email)
    if hit and hit[0] > time.time():
        return Caller(hit[1], hit[2])

    person = await _person_for(email, auth_user_id=auth_user_id, name_hint=name_hint)
    if not person.get("active", True):
        raise HTTPException(status_code=403, detail="This account has been deactivated.")

    # Both overrides at once. Every request pays for this, and a PostgREST round trip is
    # ~150ms whatever it returns, so two in sequence is 150ms added to every single call.
    role_rows, person_rows = await asyncio.gather(
        db.select("access_role_overrides", {"select": "role,matrix"}),
        db.select("access_person_overrides", {"person_id": f"eq.{person['id']}", "select": "matrix"}),
    )
    role_overrides = {r["role"]: r["matrix"] for r in role_rows}
    person_override = person_rows[0] if person_rows else None
    access = resolve_person_access(person.get("roles") or [], (person_override or {}).get("matrix"), role_overrides)
    _caller_cache[email] = (time.time() + _CALLER_TTL, person, access)
    return Caller(person, access)


CallerDep = Depends(current_caller)
