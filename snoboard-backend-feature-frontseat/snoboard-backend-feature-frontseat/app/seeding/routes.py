"""
Frontseat Seeding — internal dashboard for brand brief inflow,
admin approval, fulfillment execution and revenue/payment tracking.
"""
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response, UploadFile, File, Form, Header, Query
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Any, Dict, Literal
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from pathlib import Path
import asyncio
import os
import logging
import uuid
import jwt

# ----------------------------- Setup -----------------------------
# Mounted inside the FSOS backend (app/main.py already load_dotenv()'d its .env).
# IMPORTANT: use lazy_database — never call get_database() at import time (crashes uvicorn
# if DATABASE_URL is unset). Pool warm-up happens in init_seeding() on startup.
from app.seeding.postgres_db import lazy_database as db
from app.seeding.storage import init_storage, put_object, get_object
from app.auth import verify_token  # shared FSOS Supabase JWT verifier

logger = logging.getLogger(__name__)

APP_NAME = os.environ.get('APP_NAME', 'frontseat-seeding')
SEED_ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get('SEED_ADMIN_EMAIL', 'jaskaran.sethi@owledmedia.com').split(',') if e.strip()}
ALLOWED_DOMAIN = os.environ.get('ALLOWED_EMAIL_DOMAIN', 'owledmedia.com').lower()
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_JWT_SECRET = os.environ.get('SUPABASE_JWT_SECRET', '')


async def require_seeding_db():
    """Fail with 503 (not 500) when Postgres isn't configured / reachable."""
    try:
        await db.ping(timeout_sec=5.0)
    except Exception as e:
        logger.warning("Seeding DB unavailable: %s", e)
        raise HTTPException(
            503,
            "Seeding database unavailable. Set DATABASE_URL or SUPABASE_DB_URL on the backend.",
        )


def _is_db_connectivity_error(exc: BaseException) -> bool:
    """True for pool / connection / timeout failures that should surface as 503."""
    import asyncpg

    if isinstance(
        exc,
        (
            asyncpg.PostgresConnectionError,
            asyncpg.InterfaceError,
            asyncpg.TooManyConnectionsError,
            TimeoutError,
            asyncio.TimeoutError,
            ConnectionError,
            OSError,
        ),
    ):
        return True
    msg = str(exc).lower()
    needles = (
        "connection was closed",
        "connection does not exist",
        "too many connections",
        "remaining connection slots",
        "timeout",
        "could not connect",
        "database unavailable",
        "pool is closing",
    )
    return any(n in msg for n in needles)


# Router mounted at /api/seeding by app/main.py (no internal prefix here).
# Every route requires a reachable seeding pool (503 if DATABASE_URL missing / down).
# Pool blips mid-request are mapped to 503 by register_seeding_middleware.
api = APIRouter(dependencies=[Depends(require_seeding_db)])

# Cached JWKS client for verifying Supabase's asymmetric (ECC/RSA) login tokens.
# PyJWKClient fetches Supabase's public keys once and caches them in memory, so
# per-login verification is a local crypto check with no network round-trip.
_jwks_client = (
    jwt.PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", cache_keys=True)
    if SUPABASE_URL else None
)

# ----------------------------- Helpers -----------------------------
def verify_supabase_jwt(access_token: str) -> dict:
    try:
        alg = jwt.get_unverified_header(access_token).get("alg", "")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid access token")
    try:
        if alg == "HS256":
            # Legacy shared-secret tokens (still-valid sessions during migration).
            if not SUPABASE_JWT_SECRET:
                raise HTTPException(500, "SUPABASE_JWT_SECRET not configured")
            return jwt.decode(
                access_token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
        # Current Supabase default: asymmetric keys verified with cached public keys.
        if not _jwks_client:
            raise HTTPException(500, "SUPABASE_URL not configured")
        signing_key = _jwks_client.get_signing_key_from_jwt(access_token)
        return jwt.decode(
            access_token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
        )
    except HTTPException:
        raise
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid access token")

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def parse_iso(v: Any) -> Optional[datetime]:
    if not v:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:
        return None


# ----------------------------- Constants -----------------------------
ROLES = {"pending", "admin", "bd", "fulfillment"}
ADMIN_REVIEW_STATUSES = ["Submitted", "Needs More Info", "Rejected", "Approved", "Cancelled"]
DEAL_STATUSES = ["Accepted", "In Progress", "Client Review", "Approved", "Scheduled", "Posted", "Completed", "Cancelled"]
DELIVERABLE_STATUSES = ["Not Started", "Writing", "Designing", "Client Review", "Approved", "Scheduled", "Posted", "Completed", "Blocked"]
PAYMENT_STATUSES = ["Not Raised", "Raised", "Payment Pending", "Partially Paid", "Paid"]
DELIVERABLE_TYPES = ["Reel", "Static", "Carousel"]
OUTPUT_TYPES = ["Writeup", "Canva Link", "Drive Link", "Google Doc Link", "Content Link", "Other"]
FEEDBACK_STATUSES = ["Open", "In Progress", "Resolved"]

# FSOS Users & Roles → seeding profile (team BD roles map to business team by name).
_FSOS_ADMIN_ROLES = frozenset({"admin", "boss_man", "ai_dev", "ai_automations", "seeding_admin"})
_FSOS_BD_TEAM_ROLES = {
    "hooc_bd": "Hooc",
    "ay_bd": "AY",
    "owled_core_bd": "OWLED Core",
    "snoball_bd": "Snoball",
}


async def _sync_seeding_from_fsos(user: dict) -> dict:
    """Align seeding role/team with FSOS user_roles when Admin assigns access there."""
    email = (user.get("email") or "").strip().lower()
    if not email:
        return user
    # Hard-coded seed admins must stay admin even if profile was provisioned as pending.
    if email in SEED_ADMIN_EMAILS:
        if user.get("role") != "admin":
            try:
                await db.users.update_one(
                    {"email": email},
                    {"$set": {"role": "admin", "business_team_id": None}},
                )
            except Exception as e:
                logger.warning("Could not elevate seed admin %s: %s", email, e)
            return {**user, "role": "admin", "business_team_id": None}
        return user
    try:
        from app.database.client import get_supabase_client
        rows = get_supabase_client().table("user_roles").select("role").eq("email", email).execute().data or []
    except Exception as e:
        logger.debug("FSOS role lookup skipped for %s: %s", email, e)
        return user
    if not rows:
        return user
    parts = [p.strip().lower() for p in str(rows[0].get("role") or "").split(",") if p.strip()]
    if not parts:
        return user

    patch: dict = {}
    if any(p in _FSOS_ADMIN_ROLES for p in parts):
        if user.get("role") != "admin":
            patch = {"role": "admin", "business_team_id": None}
    elif any(p in _FSOS_BD_TEAM_ROLES or p == "bd" for p in parts):
        team_id = user.get("business_team_id")
        for p in parts:
            team_name = _FSOS_BD_TEAM_ROLES.get(p)
            if not team_name:
                continue
            try:
                team = await db.business_teams.find_one({"team_name": team_name}, {"_id": 0})
            except Exception:
                team = None
            if not team:
                # Ensure the four BD teams exist so role assignment always scopes correctly.
                tid = new_id("team")
                try:
                    await db.business_teams.insert_one({
                        "team_id": tid,
                        "team_name": team_name,
                        "created_at": now_iso(),
                    })
                    team = {"team_id": tid, "team_name": team_name}
                except Exception:
                    try:
                        team = await db.business_teams.find_one({"team_name": team_name}, {"_id": 0})
                    except Exception:
                        team = None
            if team and team.get("team_id"):
                team_id = team["team_id"]
                break
        if user.get("role") != "bd" or (team_id and user.get("business_team_id") != team_id):
            patch = {"role": "bd"}
            if team_id:
                patch["business_team_id"] = team_id
    elif "fulfillment" in parts:
        if user.get("role") != "fulfillment":
            patch = {"role": "fulfillment", "business_team_id": None}
    elif parts == ["pending"]:
        if user.get("role") != "pending":
            patch = {"role": "pending", "business_team_id": None}

    if not patch:
        return user
    try:
        await db.users.update_one({"email": email}, {"$set": patch})
    except Exception as e:
        logger.warning("Could not sync seeding profile for %s: %s", email, e)
        return user
    return {**user, **patch}


# ----------------------------- Auth -----------------------------
async def _resolve_user(request: Request) -> dict:
    """Validate the shared FSOS Supabase JWT (Bearer) and return the seeding profile,
    auto-provisioning a 'pending' profile on first login. Replaces cookie sessions."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "Not authenticated")
    claims = verify_token(auth[7:])  # raises 401 on bad/expired token
    email = (claims.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(401, "No email in token")
    try:
        user = await db.users.find_one({"email": email}, {"_id": 0})
    except Exception as e:
        logger.warning("Seeding DB unavailable during auth: %s", e)
        raise HTTPException(
            503,
            "Seeding database unavailable. Set DATABASE_URL or SUPABASE_DB_URL on the backend.",
        )
    if not user:
        meta = claims.get("user_metadata") or {}
        user = {
            "user_id": claims.get("sub") or new_id("usr"),
            "email": email,
            "name": meta.get("full_name") or meta.get("name") or email.split("@")[0],
            "picture": meta.get("avatar_url") or meta.get("picture"),
            "role": "admin" if email in SEED_ADMIN_EMAILS else "pending",
            "business_team_id": None,
            "active": True,
        }
        try:
            await db.users.insert_one(user)
        except Exception:
            existing = await db.users.find_one({"email": email}, {"_id": 0})
            if existing:
                user = existing
            else:
                logger.warning("Could not provision seeding profile for %s", email)
                raise HTTPException(503, "Seeding database unavailable while provisioning user.")
    if user.get("active") is False:
        raise HTTPException(403, "User deactivated")
    return await _sync_seeding_from_fsos(user)


async def get_current_user(request: Request) -> dict:
    """Shared Supabase JWT → seeding profile, honouring admin `X-Impersonate-As`
    and Admin UI role preview (`X-Preview-Role` for HOOC-BD / AY-BD / etc.)."""
    user = await _resolve_user(request)
    impersonate = (request.headers.get("x-impersonate-as") or "").strip().lower()
    if impersonate and user.get("role") == "admin":
        target = await db.users.find_one({"email": impersonate}, {"_id": 0})
        if target and target.get("active") is not False:
            target["_real_admin_id"] = user["user_id"]
            target["_real_admin_email"] = user.get("email")
            return target

    preview_role = (request.headers.get("x-preview-role") or "").strip().lower()
    if preview_role and user.get("role") == "admin":
        scoped = await _apply_admin_role_preview(user, preview_role)
        if scoped is not None:
            return scoped
    return user


async def _ensure_business_team(team_name: str) -> Optional[dict]:
    try:
        team = await db.business_teams.find_one({"team_name": team_name}, {"_id": 0})
    except Exception:
        team = None
    if team:
        return team
    tid = new_id("team")
    row = {"team_id": tid, "team_name": team_name, "created_at": now_iso()}
    try:
        await db.business_teams.insert_one(dict(row))
        return row
    except Exception:
        try:
            return await db.business_teams.find_one({"team_name": team_name}, {"_id": 0})
        except Exception:
            return None


async def _apply_admin_role_preview(admin: dict, preview_role: str) -> Optional[dict]:
    """When Admin previews as a team BD (or fulfillment/pending), scope seeding like that role."""
    base = {
        **admin,
        "_preview_role": preview_role,
        "_real_admin_id": admin.get("user_id"),
        "_real_admin_email": admin.get("email"),
    }
    if preview_role in _FSOS_BD_TEAM_ROLES:
        team = await _ensure_business_team(_FSOS_BD_TEAM_ROLES[preview_role])
        if not team:
            return {**base, "role": "bd", "business_team_id": None}
        return {**base, "role": "bd", "business_team_id": team.get("team_id")}
    if preview_role == "bd":
        # Generic BD with no team — same as an unassigned BD (sees nothing until teamed).
        return {**base, "role": "bd", "business_team_id": None}
    if preview_role == "fulfillment":
        return {**base, "role": "fulfillment", "business_team_id": None}
    if preview_role == "pending":
        return {**base, "role": "pending", "business_team_id": None}
    return None


async def get_real_user(request: Request) -> dict:
    """Real session user, ignoring impersonation."""
    return await _resolve_user(request)


async def require_role(user: dict, allowed: List[str]):
    role = user.get("role")
    if role in allowed:
        return
    # Role-preview scopes an admin as BD/fulfillment — say so explicitly.
    if user.get("_preview_role") and user.get("_real_admin_id"):
        raise HTTPException(
            403,
            f"Forbidden while previewing as {user.get('_preview_role')}. Exit role preview to continue.",
        )
    raise HTTPException(403, f"Forbidden — requires one of: {allowed}")


async def require_admin(user: dict):
    """Admin-only settings (pages, users). Real admins keep access even under role preview."""
    if user.get("role") == "admin" or user.get("_real_admin_id"):
        return
    raise HTTPException(403, "Forbidden — admin access required")


def scrub_deal_for_user(deal: dict, user: dict) -> dict:
    """Remove restricted fields based on role. Fulfillment cannot see price/payment."""
    if user.get("role") == "fulfillment":
        d = {k: v for k, v in deal.items() if k not in {"price_closed_at", "payment"}}
        return d
    return deal


# ----------------------------- Pydantic Models -----------------------------
class SessionRequest(BaseModel):
    access_token: str


class AssignRoleRequest(BaseModel):
    role: Literal["pending", "admin", "bd", "fulfillment"]
    business_team_id: Optional[str] = None
    active: Optional[bool] = True


class TeamCreate(BaseModel):
    team_name: str


class PageCreate(BaseModel):
    page_name: str
    notes: Optional[str] = ""
    active: bool = True


class PageUpdate(BaseModel):
    page_name: Optional[str] = None
    notes: Optional[str] = None
    active: Optional[bool] = None


class BriefDeliverableSpec(BaseModel):
    page_id: str
    deliverable_type: Literal["Reel", "Static", "Carousel"]
    quantity: int = 1


class BriefCreate(BaseModel):
    brand_name: str
    agency_or_client_name: str
    brief_text: Optional[str] = ""
    brief_link: Optional[str] = ""
    assets_or_reference_links: Optional[List[str]] = []
    deliverables_spec: List[BriefDeliverableSpec]
    go_live_date_time: str
    price_closed_at: float
    payment_due_date: str
    notes: Optional[str] = ""
    submitted_by_team_id: Optional[str] = None


class BriefUpdate(BaseModel):
    brand_name: Optional[str] = None
    agency_or_client_name: Optional[str] = None
    brief_text: Optional[str] = None
    brief_link: Optional[str] = None
    assets_or_reference_links: Optional[List[str]] = None
    # Frontend deal cards send a newline-joined string under this alias.
    assets_links: Optional[str] = None
    go_live_date_time: Optional[str] = None
    price_closed_at: Optional[float] = None
    payment_due_date: Optional[str] = None
    notes: Optional[str] = None
    # Inline Teamwise / All-Deals editors PATCH these on /deals/{id}.
    deal_status: Optional[str] = None
    admin_review_status: Optional[str] = None
    payment_status: Optional[str] = None


class AdminReviewAction(BaseModel):
    action: Literal["Approve", "Needs More Info", "Reject", "Cancel", "Reopen", "Archive"]
    comment: Optional[str] = ""


class DealStatusUpdate(BaseModel):
    deal_status: Literal["Accepted", "In Progress", "Client Review", "Approved", "Scheduled", "Posted", "Completed", "Cancelled"]


class DeliverableUpdate(BaseModel):
    status: Optional[str] = None
    live_link: Optional[str] = None
    views: Optional[int] = None
    notes: Optional[str] = None
    assigned_fulfillment_user_id: Optional[str] = None


class DeliverableAdd(BaseModel):
    page_id: str
    deliverable_type: Literal["Reel", "Static", "Carousel"]
    quantity: int = 1


class FulfillmentOutputCreate(BaseModel):
    deal_id: str
    deliverable_id: Optional[str] = None
    output_type: Literal["Writeup", "Canva Link", "Drive Link", "Google Doc Link", "Content Link", "Other"]
    title: str
    writeup_text: Optional[str] = ""
    link: Optional[str] = ""
    file_attachment: Optional[str] = ""
    visible_to_bd: bool = True
    status: Optional[Literal["Draft", "Shared with BD", "Changes Requested", "Updated", "Approved", "Final"]] = "Draft"


class FulfillmentOutputUpdate(BaseModel):
    output_type: Optional[Literal["Writeup", "Canva Link", "Drive Link", "Google Doc Link", "Content Link", "Other"]] = None
    title: Optional[str] = None
    writeup_text: Optional[str] = None
    link: Optional[str] = None
    file_attachment: Optional[str] = None
    visible_to_bd: Optional[bool] = None
    status: Optional[Literal["Draft", "Shared with BD", "Changes Requested", "Updated", "Approved", "Final"]] = None


class InternalNoteCreate(BaseModel):
    deal_id: str
    deliverable_id: Optional[str] = None
    note_text: str


class FeedbackCreate(BaseModel):
    deal_id: str
    deliverable_id: Optional[str] = None
    output_id: Optional[str] = None
    feedback_text: str
    image_attachment: Optional[str] = ""
    file_attachment: Optional[str] = ""
    reference_link: Optional[str] = ""


class FeedbackUpdate(BaseModel):
    feedback_text: Optional[str] = None
    image_attachment: Optional[str] = None
    file_attachment: Optional[str] = None
    reference_link: Optional[str] = None
    status: Optional[Literal["Open", "In Progress", "Resolved"]] = None


class PaymentUpdate(BaseModel):
    status: Literal["Not Raised", "Raised", "Payment Pending", "Partially Paid", "Paid"]
    amount_received: Optional[float] = None
    payment_notes: Optional[str] = None


# ----------------------------- Auth Endpoints -----------------------------
@api.post("/auth/session")
async def auth_session(req: SessionRequest, response: Response):
    """Exchange Supabase access_token for an app session_token and create/update user."""
    claims = verify_supabase_jwt(req.access_token)
    email = (claims.get("email") or "").lower()
    if not email:
        raise HTTPException(401, "No email in token")
    domain = email.split("@")[-1]
    if domain != ALLOWED_DOMAIN:
        raise HTTPException(403, f"Only @{ALLOWED_DOMAIN} emails are allowed")

    meta = claims.get("user_metadata") or {}
    name = meta.get("full_name") or meta.get("name") or email.split("@")[0]
    picture = meta.get("avatar_url") or meta.get("picture")

    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    if user_doc:
        update = {
            "name": name or user_doc.get("name") or email.split("@")[0],
            "picture": picture or user_doc.get("picture"),
            "updated_at": now_iso(),
        }
        await db.users.update_one({"user_id": user_doc["user_id"]}, {"$set": update})
        user_doc.update(update)
    else:
        role = "admin" if email in SEED_ADMIN_EMAILS else "pending"
        user_doc = {
            "user_id": new_id("user"),
            "email": email,
            "name": name or email.split("@")[0],
            "picture": picture,
            "role": role,
            "business_team_id": None,
            "active": True,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.users.insert_one(dict(user_doc))

    session_token = uuid.uuid4().hex
    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    await db.user_sessions.insert_one({
        "user_id": user_doc["user_id"],
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": now_iso(),
    })

    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=True, samesite="none",
        max_age=7 * 24 * 3600, path="/",
    )
    return {"user": user_doc, "session_token": session_token}


@api.post("/auth/dev-session")
async def dev_session(payload: dict, response: Response):
    """Dev/testing helper — mint a session for any seeded user. NOT for production."""
    if os.environ.get("ENABLE_DEV_SESSION", "true").lower() not in {"true", "1", "yes"}:
        raise HTTPException(404, "Not available")
    email = (payload.get("email") or "").lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(404, "User not found")
    session_token = f"dev_{uuid.uuid4().hex}"
    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    await db.user_sessions.insert_one({
        "user_id": user["user_id"],
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": now_iso(),
    })
    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=True, samesite="none",
        max_age=7 * 24 * 3600, path="/",
    )
    return {"user": user, "session_token": session_token}


@api.get("/auth/me")
async def auth_me(request: Request, user: dict = Depends(get_current_user)):
    team = None
    if user.get("business_team_id"):
        team = await db.business_teams.find_one({"team_id": user["business_team_id"]}, {"_id": 0})
    # Strip internal impersonation breadcrumbs from the user payload, expose them at top level
    real_admin_id = user.pop("_real_admin_id", None)
    real_admin_email = user.pop("_real_admin_email", None)
    impersonating = bool(real_admin_id)
    return {
        "user": user,
        "team": team,
        "impersonating": impersonating,
        "real_admin_email": real_admin_email,
    }


@api.get("/admin/preview-targets")
async def preview_targets(real_user: dict = Depends(get_real_user)):
    """List users an admin can preview the app as. Always uses real session user."""
    if real_user.get("role") != "admin":
        raise HTTPException(403, "Admins only")
    targets = await db.users.find(
        {"email": {"$ne": real_user.get("email")}, "active": {"$ne": False}, "role": {"$in": ["pending", "bd", "fulfillment"]}},
        {"_id": 0, "user_id": 1, "email": 1, "name": 1, "role": 1, "business_team_id": 1},
    ).to_list(200)
    teams = {t["team_id"]: t["team_name"] async for t in db.business_teams.find({}, {"_id": 0})}
    for t in targets:
        t["team_name"] = teams.get(t.get("business_team_id"))
    # ordering: pending → bd → fulfillment → admin
    order = {"pending": 0, "bd": 1, "fulfillment": 2, "admin": 3}
    targets.sort(key=lambda x: (order.get(x.get("role"), 9), x.get("team_name") or "", x.get("name") or ""))
    return targets


@api.post("/auth/logout")
async def auth_logout(request: Request, response: Response):
    token = request.cookies.get("session_token") or (request.headers.get("authorization", "")[7:] if request.headers.get("authorization", "").lower().startswith("bearer ") else "")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ----------------------------- Users -----------------------------
@api.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    await require_role(user, ["admin"])
    users = await db.users.find({}, {"_id": 0}).to_list(1000)
    return users


@api.get("/users/fulfillment")
async def list_fulfillment_users(user: dict = Depends(get_current_user)):
    await require_role(user, ["admin", "fulfillment"])
    users = await db.users.find(
        {"role": "fulfillment", "active": True},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1},
    ).to_list(100)
    return users


@api.put("/users/{user_id}/assign")
async def assign_user(user_id: str, payload: AssignRoleRequest, user: dict = Depends(get_current_user)):
    await require_role(user, ["admin"])
    if payload.role == "bd" and not payload.business_team_id:
        raise HTTPException(400, "business_team_id required for BD role")
    update = {
        "role": payload.role,
        "business_team_id": payload.business_team_id if payload.role == "bd" else None,
        "active": True if payload.active is None else bool(payload.active),
        "updated_at": now_iso(),
    }
    res = await db.users.update_one({"user_id": user_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "User not found")
    return await db.users.find_one({"user_id": user_id}, {"_id": 0})


# ----------------------------- Business Teams -----------------------------
@api.get("/teams")
async def list_teams(user: dict = Depends(get_current_user)):
    return await db.business_teams.find({}, {"_id": 0}).to_list(100)


@api.post("/teams")
async def create_team(payload: TeamCreate, user: dict = Depends(get_current_user)):
    await require_role(user, ["admin"])
    t = {"team_id": new_id("team"), "team_name": payload.team_name, "created_at": now_iso()}
    await db.business_teams.insert_one(dict(t))
    return t


# ----------------------------- Monetisable Pages -----------------------------
@api.get("/pages")
async def list_pages(only_active: bool = True, user: dict = Depends(get_current_user)):
    """Deal-eligible pages. Defaults to active-only (brief + monetisation catalog)."""
    q = {"active": True} if only_active else {}
    return await db.monetisable_pages.find(q, {"_id": 0}).to_list(1000)


@api.post("/pages")
async def create_page(payload: PageCreate, user: dict = Depends(get_current_user)):
    await require_admin(user)
    name = (payload.page_name or "").strip()
    if not name:
        raise HTTPException(400, "Page name is required")
    p = {
        "page_id": new_id("page"),
        "page_name": name,
        "active": payload.active,
        "notes": (payload.notes or "").strip(),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    try:
        await db.monetisable_pages.insert_one(dict(p))
    except Exception as e:
        logger.exception("create_page failed for %s", name)
        msg = str(e)
        if "seeding_monetisable_pages" in msg and (
            "does not exist" in msg.lower() or "undefinedtable" in msg.lower()
        ):
            raise HTTPException(
                503,
                "Monetisable pages table is missing. Run migrations/seeding_integration_v1.sql on Supabase.",
            )
        if _is_db_connectivity_error(e):
            raise HTTPException(
                503,
                "Seeding database unavailable. Set DATABASE_URL or SUPABASE_DB_URL on the backend.",
            )
        raise HTTPException(500, f"Couldn't save page: {msg[:240]}")
    return p


@api.put("/pages/{page_id}")
async def update_page(page_id: str, payload: PageUpdate, user: dict = Depends(get_current_user)):
    await require_admin(user)
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    upd["updated_at"] = now_iso()
    res = await db.monetisable_pages.update_one({"page_id": page_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Page not found")
    return await db.monetisable_pages.find_one({"page_id": page_id}, {"_id": 0})


@api.delete("/pages/{page_id}")
async def delete_page(page_id: str, user: dict = Depends(get_current_user)):
    await require_admin(user)
    res = await db.monetisable_pages.delete_one({"page_id": page_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Page not found")
    return {"deleted": page_id}


# ----------------------------- Briefs / Deals -----------------------------
async def _enrich_deals(deals: List[dict]) -> List[dict]:
    """Batch-attach submitter + team info (avoids N+1 pool exhaustion)."""
    if not deals:
        return deals
    user_ids = list({d.get("submitted_by_user_id") for d in deals if d.get("submitted_by_user_id")})
    team_ids = list({d.get("submitted_by_team_id") for d in deals if d.get("submitted_by_team_id")})
    users_map: Dict[str, dict] = {}
    teams_map: Dict[str, dict] = {}
    if user_ids:
        users = await db.users.find(
            {"user_id": {"$in": user_ids}},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1},
        ).to_list(len(user_ids) + 10)
        users_map = {
            u["user_id"]: {"name": u.get("name"), "email": u.get("email")}
            for u in users
            if u.get("user_id")
        }
    if team_ids:
        teams = await db.business_teams.find(
            {"team_id": {"$in": team_ids}},
            {"_id": 0, "team_id": 1, "team_name": 1},
        ).to_list(len(team_ids) + 10)
        teams_map = {
            t["team_id"]: {"team_name": t.get("team_name")}
            for t in teams
            if t.get("team_id")
        }
    for deal in deals:
        uid = deal.get("submitted_by_user_id")
        tid = deal.get("submitted_by_team_id")
        deal["submitted_by_user"] = users_map.get(uid) if uid else None
        deal["submitted_by_team"] = teams_map.get(tid) if tid else None
    return deals


async def _enrich_deal(deal: dict) -> dict:
    """Add submitter and team info to a deal."""
    enriched = await _enrich_deals([deal])
    return enriched[0]


async def _attach_payment_status(deal: dict) -> dict:
    """Flatten payments.status → deal.payment_status for the frontend cards."""
    payment = await db.payments.find_one({"deal_id": deal["deal_id"]}, {"_id": 0, "status": 1, "amount_received": 1, "payment_due_date": 1})
    if payment:
        deal["payment"] = payment
        deal["payment_status"] = payment.get("status") or "Not Raised"
    else:
        deal["payment_status"] = deal.get("payment_status") or "Not Raised"
    return deal


def _deal_role_filter(user: dict) -> dict:
    """Mongo filter based on role to enforce data scoping."""
    if user["role"] == "admin":
        return {}
    if user["role"] == "bd":
        team_id = user.get("business_team_id")
        # No team assigned → see nothing (never leak other teams' deals).
        if not team_id:
            return {"_id": "__none__"}
        return {"submitted_by_team_id": team_id}
    if user["role"] == "fulfillment":
        return {"admin_review_status": "Approved"}
    return {"_id": "__none__"}  # pending users get nothing


@api.post("/briefs")
async def create_brief(payload: BriefCreate, user: dict = Depends(get_current_user)):
    await require_role(user, ["bd", "admin"])
    if not (payload.brief_text or payload.brief_link):
        raise HTTPException(400, "Either brief_text or brief_link is required")
    if not payload.deliverables_spec:
        raise HTTPException(400, "At least one deliverable required")

    team_id = user.get("business_team_id")
    if user["role"] == "admin":
        if not payload.submitted_by_team_id:
            raise HTTPException(400, "submitted_by_team_id required when admin submits on behalf of a team")
        team = await db.business_teams.find_one({"team_id": payload.submitted_by_team_id}, {"_id": 0})
        if not team:
            raise HTTPException(400, "Invalid team")
        team_id = payload.submitted_by_team_id
    else:
        # BD: always stamp the deal with THEIR team — never accept another team's id from the client.
        if not team_id:
            raise HTTPException(400, "BD user must belong to a team")
        team_id = user["business_team_id"]

    deal_id = new_id("deal")
    deal = {
        "deal_id": deal_id,
        "brand_name": payload.brand_name,
        "agency_or_client_name": payload.agency_or_client_name,
        "brief_text": payload.brief_text or "",
        "brief_link": payload.brief_link or "",
        "assets_or_reference_links": payload.assets_or_reference_links or [],
        "price_closed_at": float(payload.price_closed_at),
        "payment_due_date": payload.payment_due_date,
        "go_live_date_time": payload.go_live_date_time,
        "submitted_by_user_id": user["user_id"],
        "submitted_by_team_id": team_id,
        "admin_review_status": "Submitted",
        "deal_status": None,
        "rejection_reason": "",
        "needs_more_info_comment": "",
        "approved_by_admin_id": None,
        "approved_at": None,
        "notes": payload.notes or "",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.deals.insert_one(dict(deal))

    # Expand spec → individual deliverables
    pages = {p["page_id"]: p async for p in db.monetisable_pages.find({}, {"_id": 0})}
    delivs = []
    for spec in payload.deliverables_spec:
        page = pages.get(spec.page_id)
        if not page:
            continue
        for _ in range(max(1, int(spec.quantity))):
            d = {
                "deliverable_id": new_id("dlv"),
                "deal_id": deal_id,
                "page_id": spec.page_id,
                "page_name": page["page_name"],
                "deliverable_type": spec.deliverable_type,
                "go_live_date_time": payload.go_live_date_time,
                "status": "Not Started",
                "assigned_fulfillment_user_id": None,
                "live_link": "",
                "views": 0,
                "notes": "",
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
            delivs.append(d)
    if delivs:
        await db.deliverables.insert_many([dict(d) for d in delivs])

    # Create payment row (admin/bd visible only)
    await db.payments.insert_one({
        "payment_id": new_id("pay"),
        "deal_id": deal_id,
        "status": "Not Raised",
        "payment_due_date": payload.payment_due_date,
        "amount_received": 0.0,
        "payment_notes": "",
        "last_updated_by": user["user_id"],
        "last_updated_at": now_iso(),
    })

    return await _enrich_deal(deal)


@api.post("/deals")
async def create_deal_compat(request: Request, user: dict = Depends(get_current_user)):
    """Frontend Submit Brief posts here; map to /briefs and force BD team from profile
    so one BD cannot attribute deals to another team's id."""
    await require_role(user, ["bd", "admin"])
    body = await request.json()
    drafts = body.get("deliverable_drafts") or body.get("deliverables_spec") or []
    specs = []
    for d in drafts:
        if not d.get("page_id"):
            continue
        specs.append(BriefDeliverableSpec(
            page_id=str(d["page_id"]),
            deliverable_type=d.get("deliverable_type") or "Reel",
            quantity=max(1, int(d.get("quantity") or 1)),
        ))
    assets = body.get("assets_or_reference_links")
    if assets is None and body.get("assets_links"):
        assets = [ln.strip() for ln in str(body["assets_links"]).splitlines() if ln.strip()]
    team_from_body = None
    submitted = body.get("submitted_by_team") or {}
    if isinstance(submitted, dict):
        team_from_body = submitted.get("team_id")
    team_from_body = team_from_body or body.get("submitted_by_team_id")

    # BD always uses their assigned team — never trust client team_id (isolation).
    if user["role"] == "bd":
        submitted_by_team_id = user.get("business_team_id")
        if not submitted_by_team_id:
            raise HTTPException(400, "BD user must belong to a team — ask Admin to assign HOOC/AY/OWLED Core/Snoball BD")
    else:
        submitted_by_team_id = team_from_body

    payload = BriefCreate(
        brand_name=body.get("brand_name") or body.get("agency_or_client_name") or "",
        agency_or_client_name=body.get("agency_or_client_name") or body.get("brand_name") or "",
        brief_text=body.get("brief_text") or "",
        brief_link=body.get("brief_link") or "",
        assets_or_reference_links=assets or [],
        deliverables_spec=specs,
        go_live_date_time=str(body.get("go_live_date_time") or ""),
        price_closed_at=float(body.get("price_closed_at") or 0),
        payment_due_date=str(body.get("payment_due_date") or ""),
        notes=body.get("notes") or "",
        submitted_by_team_id=submitted_by_team_id,
    )
    return await create_brief(payload, user)


@api.get("/deals")
async def list_deals(
    user: dict = Depends(get_current_user),
    admin_review_status: Optional[str] = None,
    deal_status: Optional[str] = None,
    payment_status: Optional[str] = None,
    team_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
):
    if user.get("role") == "pending":
        raise HTTPException(403, "Pending approval")
    try:
        q = _deal_role_filter(user)
        if admin_review_status:
            q["admin_review_status"] = admin_review_status
        if deal_status:
            q["deal_status"] = deal_status
        if team_id and user["role"] == "admin":
            q["submitted_by_team_id"] = team_id
        if from_date or to_date:
            date_q: Dict[str, Any] = {}
            if from_date:
                date_q["$gte"] = from_date
            if to_date:
                date_q["$lte"] = to_date
            if date_q:
                q["created_at"] = date_q

        deals = await db.deals.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
        payments_map: Dict[str, dict] = {}
        if user["role"] in {"admin", "bd"}:
            deal_ids = [d["deal_id"] for d in deals]
            if deal_ids:
                payments = await db.payments.find(
                    {"deal_id": {"$in": deal_ids}},
                    {"_id": 0, "deal_id": 1, "status": 1, "amount_received": 1, "payment_due_date": 1},
                ).to_list(2000)
                payments_map = {p["deal_id"]: p for p in payments}

        out = []
        deals = await _enrich_deals(deals)
        for d in deals:
            d = scrub_deal_for_user(d, user)
            if user["role"] in {"admin", "bd"}:
                pay = payments_map.get(d["deal_id"])
                d["payment"] = pay
                d["payment_status"] = (pay or {}).get("status") or "Not Raised"
            out.append(d)

        if payment_status and user["role"] in {"admin", "bd"}:
            out = [d for d in out if (d.get("payment_status") or "Not Raised") == payment_status]

        return out
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("list_deals failed")
        raise HTTPException(503, f"Seeding deals query failed: {e}")


@api.get("/deals/{deal_id}")
async def get_deal(deal_id: str, user: dict = Depends(get_current_user)):
    deal = await db.deals.find_one({"deal_id": deal_id}, {"_id": 0})
    if not deal:
        raise HTTPException(404, "Deal not found")
    # role enforcement
    if user["role"] == "bd" and deal.get("submitted_by_team_id") != user.get("business_team_id"):
        raise HTTPException(403, "Forbidden")
    if user["role"] == "fulfillment" and deal.get("admin_review_status") != "Approved":
        raise HTTPException(403, "Forbidden")
    if user["role"] == "pending":
        raise HTTPException(403, "Pending approval")

    deal = await _enrich_deal(deal)
    delivs = await db.deliverables.find({"deal_id": deal_id}, {"_id": 0}).to_list(500)
    outputs = await db.fulfillment_outputs.find({"deal_id": deal_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    if user["role"] == "bd":
        # BD sees outputs only when marked visible AND not in Draft
        outputs = [o for o in outputs if o.get("visible_to_bd") and o.get("status") != "Draft"]
    feedback = await db.client_feedback.find({"deal_id": deal_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    payment = None
    if user["role"] in {"admin", "bd"}:
        payment = await db.payments.find_one({"deal_id": deal_id}, {"_id": 0})
    notes = []
    if user["role"] in {"admin", "fulfillment"}:
        notes = await db.internal_notes.find({"deal_id": deal_id}, {"_id": 0}).sort("created_at", -1).to_list(500)

    deal = scrub_deal_for_user(deal, user)
    return {
        "deal": deal,
        "deliverables": delivs,
        "fulfillment_outputs": outputs,
        "client_feedback": feedback,
        "payment": payment,
        "internal_notes": notes,
    }


@api.put("/deals/{deal_id}")
@api.patch("/deals/{deal_id}")
async def update_deal(deal_id: str, payload: BriefUpdate, user: dict = Depends(get_current_user)):
    if user["role"] not in {"admin", "bd"}:
        raise HTTPException(403, "Forbidden")
    deal = await db.deals.find_one({"deal_id": deal_id}, {"_id": 0})
    if not deal:
        raise HTTPException(404, "Deal not found")
    # only admin can edit accepted/approved deals
    if deal.get("admin_review_status") == "Approved" and user["role"] != "admin":
        raise HTTPException(403, "Only admin can edit approved deals")
    # BD can edit only own team's submitted briefs
    if user["role"] == "bd":
        if deal.get("submitted_by_team_id") != user.get("business_team_id"):
            raise HTTPException(403, "Forbidden")
        if deal.get("admin_review_status") not in {"Submitted", "Needs More Info"}:
            raise HTTPException(403, "BD can only edit before approval")

    raw = payload.model_dump(exclude_unset=True)
    # payment_status lives on seeding_payments, not seeding_deals
    payment_status = raw.pop("payment_status", None)
    assets_links = raw.pop("assets_links", None)
    if assets_links is not None and "assets_or_reference_links" not in raw:
        links = [ln.strip() for ln in str(assets_links).splitlines() if ln.strip()]
        raw["assets_or_reference_links"] = links

    if "deal_status" in raw and raw["deal_status"] is not None and raw["deal_status"] not in DEAL_STATUSES:
        raise HTTPException(400, f"Invalid deal_status: {raw['deal_status']}")
    if "admin_review_status" in raw and raw["admin_review_status"] not in ADMIN_REVIEW_STATUSES + ["Archived"]:
        raise HTTPException(400, f"Invalid admin_review_status: {raw['admin_review_status']}")

    # Keep review + deal status in sync when cancelling from the review control.
    if raw.get("admin_review_status") == "Cancelled" and "deal_status" not in raw:
        raw["deal_status"] = "Cancelled"

    if user["role"] == "bd":
        # BD must not flip review / deal status via the generic update.
        raw.pop("admin_review_status", None)
        raw.pop("deal_status", None)
        payment_status = None

    upd = {k: v for k, v in raw.items() if v is not None or k in {"deal_status", "notes", "brief_text", "brief_link"}}
    if user["role"] == "bd" and deal.get("admin_review_status") == "Needs More Info":
        upd["admin_review_status"] = "Submitted"
        upd["needs_more_info_comment"] = ""

    if upd:
        upd["updated_at"] = now_iso()
        await db.deals.update_one({"deal_id": deal_id}, {"$set": upd})
        if "payment_due_date" in upd:
            await db.payments.update_one(
                {"deal_id": deal_id},
                {"$set": {
                    "payment_due_date": upd["payment_due_date"],
                    "last_updated_by": user["user_id"],
                    "last_updated_by_name": user.get("name"),
                    "last_updated_at": now_iso(),
                }},
            )

    if payment_status is not None:
        if payment_status not in PAYMENT_STATUSES:
            raise HTTPException(400, f"Invalid payment_status: {payment_status}")
        await db.payments.update_one(
            {"deal_id": deal_id},
            {"$set": {
                "status": payment_status,
                "last_updated_by": user["user_id"],
                "last_updated_by_name": user.get("name"),
                "last_updated_at": now_iso(),
            }},
            upsert=True,
        )

    updated = await db.deals.find_one({"deal_id": deal_id}, {"_id": 0})
    updated = await _enrich_deal(updated)
    if user["role"] in {"admin", "bd"}:
        updated = await _attach_payment_status(updated)
    return scrub_deal_for_user(updated, user)


@api.post("/deals/{deal_id}/review")
async def admin_review(deal_id: str, payload: AdminReviewAction, user: dict = Depends(get_current_user)):
    await require_role(user, ["admin"])
    deal = await db.deals.find_one({"deal_id": deal_id}, {"_id": 0})
    if not deal:
        raise HTTPException(404, "Deal not found")
    upd: Dict[str, Any] = {"updated_at": now_iso()}
    if payload.action == "Approve":
        upd["admin_review_status"] = "Approved"
        upd["deal_status"] = "Accepted"
        upd["approved_by_admin_id"] = user["user_id"]
        upd["approved_at"] = now_iso()
    elif payload.action == "Needs More Info":
        if not payload.comment:
            raise HTTPException(400, "Comment required for Needs More Info")
        upd["admin_review_status"] = "Needs More Info"
        upd["needs_more_info_comment"] = payload.comment
    elif payload.action == "Reject":
        upd["admin_review_status"] = "Rejected"
        upd["rejection_reason"] = payload.comment or ""
    elif payload.action == "Cancel":
        upd["admin_review_status"] = "Cancelled"
        upd["deal_status"] = "Cancelled"
    elif payload.action == "Reopen":
        # Reset a Rejected/Cancelled/Archived/Approved deal back to Submitted so nothing is a dead end.
        upd["admin_review_status"] = "Submitted"
        upd["deal_status"] = None
        upd["rejection_reason"] = ""
        upd["needs_more_info_comment"] = ""
        upd["approved_by_admin_id"] = None
        upd["approved_at"] = None
    elif payload.action == "Archive":
        # Archived deals drop out of the dashboard/overview (status-driven) but stay
        # visible under the "Archived" filter on the Deals page.
        upd["admin_review_status"] = "Archived"
    await db.deals.update_one({"deal_id": deal_id}, {"$set": upd})
    return await db.deals.find_one({"deal_id": deal_id}, {"_id": 0})


@api.put("/deals/{deal_id}/status")
async def update_deal_status(deal_id: str, payload: DealStatusUpdate, user: dict = Depends(get_current_user)):
    await require_role(user, ["admin", "fulfillment"])
    deal = await db.deals.find_one({"deal_id": deal_id}, {"_id": 0})
    if not deal:
        raise HTTPException(404, "Deal not found")
    if deal.get("admin_review_status") != "Approved":
        raise HTTPException(400, "Deal not approved yet")
    await db.deals.update_one({"deal_id": deal_id}, {"$set": {"deal_status": payload.deal_status, "updated_at": now_iso()}})
    return await db.deals.find_one({"deal_id": deal_id}, {"_id": 0})


# ----------------------------- Deliverables -----------------------------
def _check_deliverable_spec_access(user: dict, deal: dict):
    """Admin can always edit deliverable spec; BD only before approval."""
    if user["role"] == "admin":
        return
    if user["role"] == "bd":
        if deal.get("submitted_by_team_id") != user.get("business_team_id"):
            raise HTTPException(403, "Forbidden")
        if deal.get("admin_review_status") in {"Submitted", "Needs More Info"}:
            return
    raise HTTPException(403, "Only admin can modify deliverables after approval")


async def _expand_deliverable_rows(deal_id: str, deal: dict, spec: DeliverableAdd) -> List[dict]:
    page = await db.monetisable_pages.find_one({"page_id": spec.page_id}, {"_id": 0})
    if not page:
        raise HTTPException(400, "Invalid page")
    rows = []
    for _ in range(max(1, int(spec.quantity))):
        rows.append({
            "deliverable_id": new_id("dlv"),
            "deal_id": deal_id,
            "page_id": spec.page_id,
            "page_name": page["page_name"],
            "deliverable_type": spec.deliverable_type,
            "go_live_date_time": deal.get("go_live_date_time"),
            "status": "Not Started",
            "assigned_fulfillment_user_id": None,
            "live_link": "",
            "views": 0,
            "notes": "",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })
    return rows


@api.post("/deals/{deal_id}/deliverables")
async def add_deliverables(deal_id: str, payload: DeliverableAdd, user: dict = Depends(get_current_user)):
    if user["role"] not in {"admin", "bd"}:
        raise HTTPException(403, "Forbidden")
    deal = await db.deals.find_one({"deal_id": deal_id}, {"_id": 0})
    if not deal:
        raise HTTPException(404, "Deal not found")
    _check_deliverable_spec_access(user, deal)
    rows = await _expand_deliverable_rows(deal_id, deal, payload)
    if rows:
        await db.deliverables.insert_many([dict(r) for r in rows])
    await db.deals.update_one({"deal_id": deal_id}, {"$set": {"updated_at": now_iso()}})
    return rows


@api.delete("/deliverables/{deliverable_id}")
async def delete_deliverable(deliverable_id: str, user: dict = Depends(get_current_user)):
    if user["role"] not in {"admin", "bd"}:
        raise HTTPException(403, "Forbidden")
    deliv = await db.deliverables.find_one({"deliverable_id": deliverable_id}, {"_id": 0})
    if not deliv:
        raise HTTPException(404, "Deliverable not found")
    deal = await db.deals.find_one({"deal_id": deliv["deal_id"]}, {"_id": 0})
    if not deal:
        raise HTTPException(404, "Deal not found")
    _check_deliverable_spec_access(user, deal)
    count = await db.deliverables.count_documents({"deal_id": deliv["deal_id"]})
    if count <= 1:
        raise HTTPException(400, "Cannot remove the last deliverable on a deal")
    await db.deliverables.delete_one({"deliverable_id": deliverable_id})
    await db.deals.update_one({"deal_id": deliv["deal_id"]}, {"$set": {"updated_at": now_iso()}})
    return {"ok": True}


@api.put("/deliverables/{deliverable_id}")
async def update_deliverable(deliverable_id: str, payload: DeliverableUpdate, user: dict = Depends(get_current_user)):
    await require_role(user, ["admin", "fulfillment"])
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "No fields to update")
    upd["updated_at"] = now_iso()
    res = await db.deliverables.update_one({"deliverable_id": deliverable_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Deliverable not found")
    return await db.deliverables.find_one({"deliverable_id": deliverable_id}, {"_id": 0})


@api.get("/deliverables")
async def list_deliverables(user: dict = Depends(get_current_user), status: Optional[str] = None):
    if user.get("role") == "pending":
        raise HTTPException(403, "Pending approval")
    deal_filter = _deal_role_filter(user)
    deals = await db.deals.find(deal_filter, {"_id": 0, "deal_id": 1, "brand_name": 1, "go_live_date_time": 1}).to_list(1000)
    deal_map = {d["deal_id"]: d for d in deals}
    q: Dict[str, Any] = {"deal_id": {"$in": list(deal_map.keys())}}
    if status:
        q["status"] = status
    delivs = await db.deliverables.find(q, {"_id": 0}).to_list(2000)
    for d in delivs:
        d["brand_name"] = deal_map.get(d["deal_id"], {}).get("brand_name")
    return delivs


# ----------------------------- Fulfillment Outputs -----------------------------
@api.post("/outputs")
async def create_output(payload: FulfillmentOutputCreate, user: dict = Depends(get_current_user)):
    await require_role(user, ["fulfillment", "admin"])
    o = {
        "output_id": new_id("out"),
        "deal_id": payload.deal_id,
        "deliverable_id": payload.deliverable_id,
        "output_type": payload.output_type,
        "title": payload.title,
        "writeup_text": payload.writeup_text or "",
        "link": payload.link or "",
        "file_attachment": payload.file_attachment or "",
        "visible_to_bd": payload.visible_to_bd,
        "status": payload.status or "Draft",
        "created_by": user["user_id"],
        "created_by_name": user.get("name"),
        "created_by_role": user.get("role"),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.fulfillment_outputs.insert_one(dict(o))
    return o


@api.put("/outputs/{output_id}")
async def update_output(output_id: str, payload: FulfillmentOutputUpdate, user: dict = Depends(get_current_user)):
    await require_role(user, ["fulfillment", "admin"])
    existing = await db.fulfillment_outputs.find_one({"output_id": output_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Output not found")
    # fulfillment can edit only their own; admin can edit anything
    if user["role"] == "fulfillment" and existing.get("created_by") != user["user_id"]:
        raise HTTPException(403, "Fulfillment users can only edit their own outputs")
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "No fields to update")
    upd["updated_at"] = now_iso()
    await db.fulfillment_outputs.update_one({"output_id": output_id}, {"$set": upd})
    return await db.fulfillment_outputs.find_one({"output_id": output_id}, {"_id": 0})


@api.delete("/outputs/{output_id}")
async def delete_output(output_id: str, user: dict = Depends(get_current_user)):
    existing = await db.fulfillment_outputs.find_one({"output_id": output_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Output not found")
    if user["role"] != "admin" and existing.get("created_by") != user["user_id"]:
        raise HTTPException(403, "Only admin or the author can delete this output")
    await db.fulfillment_outputs.delete_one({"output_id": output_id})
    # cascade delete associated comments
    await db.client_feedback.delete_many({"output_id": output_id})
    return {"ok": True}


# ----------------------------- Internal Notes -----------------------------
@api.post("/notes")
async def create_note(payload: InternalNoteCreate, user: dict = Depends(get_current_user)):
    await require_role(user, ["fulfillment", "admin"])
    n = {
        "note_id": new_id("note"),
        "deal_id": payload.deal_id,
        "deliverable_id": payload.deliverable_id,
        "note_text": payload.note_text,
        "created_by": user["user_id"],
        "created_by_name": user.get("name"),
        "created_at": now_iso(),
    }
    await db.internal_notes.insert_one(dict(n))
    return n


# ----------------------------- Client Feedback / Comments -----------------------------
async def _check_deal_access(user: dict, deal: dict):
    """Ensure user can access this deal. Raises 403 if not."""
    if user["role"] == "pending":
        raise HTTPException(403, "Pending approval")
    if user["role"] == "bd" and deal.get("submitted_by_team_id") != user.get("business_team_id"):
        raise HTTPException(403, "Forbidden")
    if user["role"] == "fulfillment" and deal.get("admin_review_status") != "Approved":
        raise HTTPException(403, "Forbidden")


@api.post("/feedback")
async def create_feedback(payload: FeedbackCreate, user: dict = Depends(get_current_user)):
    await require_role(user, ["bd", "admin", "fulfillment"])
    deal = await db.deals.find_one({"deal_id": payload.deal_id}, {"_id": 0})
    if not deal:
        raise HTTPException(404, "Deal not found")
    await _check_deal_access(user, deal)

    team_name = None
    if user.get("business_team_id"):
        team = await db.business_teams.find_one({"team_id": user["business_team_id"]}, {"_id": 0, "team_name": 1})
        team_name = team and team.get("team_name")

    f = {
        "feedback_id": new_id("fb"),
        "deal_id": payload.deal_id,
        "deliverable_id": payload.deliverable_id,
        "output_id": payload.output_id,
        "feedback_text": payload.feedback_text,
        "image_attachment": payload.image_attachment or "",
        "file_attachment": payload.file_attachment or "",
        "reference_link": payload.reference_link or "",
        "status": "Open",
        "added_by_user_id": user["user_id"],
        "added_by_name": user.get("name"),
        "added_by_role": user.get("role"),
        "added_by_team": team_name,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.client_feedback.insert_one(dict(f))
    return f


@api.put("/feedback/{feedback_id}")
async def update_feedback(feedback_id: str, payload: FeedbackUpdate, user: dict = Depends(get_current_user)):
    existing = await db.client_feedback.find_one({"feedback_id": feedback_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")

    deal = await db.deals.find_one({"deal_id": existing["deal_id"]}, {"_id": 0})
    if deal:
        await _check_deal_access(user, deal)

    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "No fields")

    content_keys = {"feedback_text", "image_attachment", "file_attachment", "reference_link"}
    is_content_edit = bool(content_keys & set(upd.keys()))
    # Author can edit own content; admin can edit anyone's; others can only change status
    if is_content_edit and user["role"] != "admin" and existing.get("added_by_user_id") != user["user_id"]:
        raise HTTPException(403, "Only the author or admin can edit this comment")

    upd["updated_at"] = now_iso()
    await db.client_feedback.update_one({"feedback_id": feedback_id}, {"$set": upd})
    return await db.client_feedback.find_one({"feedback_id": feedback_id}, {"_id": 0})


@api.delete("/feedback/{feedback_id}")
async def delete_feedback(feedback_id: str, user: dict = Depends(get_current_user)):
    existing = await db.client_feedback.find_one({"feedback_id": feedback_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    if user["role"] != "admin" and existing.get("added_by_user_id") != user["user_id"]:
        raise HTTPException(403, "Only the author or admin can delete this comment")
    await db.client_feedback.delete_one({"feedback_id": feedback_id})
    return {"ok": True}


# ----------------------------- Payments -----------------------------
@api.put("/payments/{deal_id}")
async def update_payment(deal_id: str, payload: PaymentUpdate, user: dict = Depends(get_current_user)):
    await require_role(user, ["admin", "bd"])
    deal = await db.deals.find_one({"deal_id": deal_id}, {"_id": 0})
    if not deal:
        raise HTTPException(404, "Deal not found")
    if user["role"] == "bd" and deal.get("submitted_by_team_id") != user.get("business_team_id"):
        raise HTTPException(403, "Forbidden")
    if user["role"] != "admin":
        if payload.amount_received is not None:
            raise HTTPException(403, "Only admin can update amount received")
        if payload.payment_notes is not None:
            raise HTTPException(403, "Only admin can update payment notes")
    upd: Dict[str, Any] = {
        "status": payload.status,
        "last_updated_by": user["user_id"],
        "last_updated_by_name": user.get("name"),
        "last_updated_at": now_iso(),
    }
    if payload.amount_received is not None:
        upd["amount_received"] = payload.amount_received
    if payload.payment_notes is not None:
        upd["payment_notes"] = payload.payment_notes
    await db.payments.update_one({"deal_id": deal_id}, {"$set": upd}, upsert=True)
    return await db.payments.find_one({"deal_id": deal_id}, {"_id": 0})


# ----------------------------- File Upload -----------------------------
@api.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if user["role"] == "pending":
        raise HTTPException(403, "Pending approval")
    ext = file.filename.split(".")[-1].lower() if "." in (file.filename or "") else "bin"
    if ext not in {"jpg", "jpeg", "png", "gif", "webp", "pdf", "doc", "docx", "txt", "csv", "xlsx"}:
        raise HTTPException(400, "Unsupported file type")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 10MB)")
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    result = put_object(path, data, file.content_type or "application/octet-stream")
    file_id = new_id("file")
    record = {
        "file_id": file_id,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type,
        "size": result.get("size", len(data)),
        "uploaded_by": user["user_id"],
        "is_deleted": False,
        "created_at": now_iso(),
    }
    await db.files.insert_one(dict(record))
    return {"file_id": file_id, "url": f"/api/files/{file_id}", "original_filename": file.filename, "content_type": file.content_type}


@api.get("/files/{file_id}")
async def download_file(file_id: str, request: Request, auth: Optional[str] = Query(None)):
    # Resolve user via cookie/header (preferred) or ?auth= query token (for <img>)
    user = None
    try:
        user = await get_current_user(request)
    except HTTPException:
        if auth:
            sess = await db.user_sessions.find_one({"session_token": auth}, {"_id": 0})
            if not sess:
                raise HTTPException(401, "Bad token")
            exp = parse_iso(sess.get("expires_at"))
            if exp and exp < datetime.now(timezone.utc):
                raise HTTPException(401, "Session expired")
            user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
            if not user or user.get("active") is False or user.get("role") == "pending":
                raise HTTPException(403, "Forbidden")
        else:
            raise
    rec = await db.files.find_one({"file_id": file_id, "is_deleted": False}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Not found")
    data, ct = get_object(rec["storage_path"])
    return Response(content=data, media_type=rec.get("content_type") or ct)


# ----------------------------- Reports / Dashboard -----------------------------
@api.get("/reports/overview")
async def reports_overview(
    user: dict = Depends(get_current_user),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
):
    if user["role"] == "pending":
        raise HTTPException(403, "Pending")

    try:
        return await _reports_overview_body(user, from_date, to_date)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("reports_overview failed")
        raise HTTPException(503, f"Seeding overview query failed: {e}")


async def _reports_overview_body(user: dict, from_date: Optional[str], to_date: Optional[str]):
    q = _deal_role_filter(user)
    date_q: Dict[str, Any] = {}
    if from_date:
        date_q["$gte"] = from_date
    if to_date:
        date_q["$lte"] = to_date
    if date_q:
        q["created_at"] = date_q

    deals = await db.deals.find(q, {"_id": 0}).to_list(2000)
    approved = [d for d in deals if d.get("admin_review_status") == "Approved"]
    # Cancelled deals stay in Approved history but drop out of revenue / payment totals.
    revenue_deals = [d for d in approved if d.get("deal_status") != "Cancelled"]
    completed = [d for d in revenue_deals if d.get("deal_status") == "Completed"]
    pending_review = [d for d in deals if d.get("admin_review_status") == "Submitted"]
    needs_info = [d for d in deals if d.get("admin_review_status") == "Needs More Info"]

    # Revenue totals are admin-facing; BD/fulfillment dashboards do not surface them.
    revenue = (
        sum(float(d.get("price_closed_at") or 0) for d in revenue_deals)
        if user["role"] == "admin"
        else 0
    )

    # team-wise revenue (admin only)
    team_revenue = []
    team_deals = []
    if user["role"] == "admin":
        teams = await db.business_teams.find({}, {"_id": 0}).to_list(100)
        for t in teams:
            t_approved = [d for d in revenue_deals if d.get("submitted_by_team_id") == t["team_id"]]
            team_revenue.append({
                "team_id": t["team_id"],
                "team_name": t["team_name"],
                "revenue": sum(float(d.get("price_closed_at") or 0) for d in t_approved),
                "deals": len(t_approved),
            })
            team_deals.append({"team_name": t["team_name"], "count": len(t_approved)})

    # payments
    deal_ids = [d["deal_id"] for d in revenue_deals]
    deal_price_by_id = {d["deal_id"]: float(d.get("price_closed_at") or 0) for d in revenue_deals}
    payments = []
    if user["role"] != "fulfillment":
        payments = await db.payments.find({"deal_id": {"$in": deal_ids}}, {"_id": 0}).to_list(2000)
    payment_pending = [p for p in payments if p.get("status") in {"Not Raised", "Raised", "Payment Pending", "Partially Paid"}]
    payment_pending_amount = sum(
        max(0.0, deal_price_by_id.get(p["deal_id"], 0.0) - float(p.get("amount_received") or 0))
        for p in payment_pending
    )

    # views from deliverables
    deliv_q = {"deal_id": {"$in": deal_ids}}
    delivs = await db.deliverables.find(deliv_q, {"_id": 0}).to_list(5000)
    total_views = sum(int(d.get("views") or 0) for d in delivs)
    blocked = [d for d in delivs if d.get("status") == "Blocked"]

    # revenue over time (admin + bd; fulfillment gets empty)
    revenue_over_time: List[Dict[str, Any]] = []
    if user["role"] != "fulfillment":
        def parse_day(iso: str):
            try:
                return datetime.fromisoformat(iso.replace("Z", "+00:00")).date()
            except Exception:
                return None

        start_day = parse_day(from_date) if from_date else None
        end_day = parse_day(to_date) if to_date else None
        if not end_day:
            end_day = datetime.now(timezone.utc).date()
        if not start_day:
            start_day = end_day.replace(day=1)

        rev_q = _deal_role_filter(user)
        rev_q["admin_review_status"] = "Approved"
        all_approved = await db.deals.find(rev_q, {"_id": 0}).to_list(2000)

        buckets: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"revenue": 0.0, "deals": 0})
        cur = start_day
        while cur <= end_day:
            buckets[cur.isoformat()] = {"revenue": 0.0, "deals": 0}
            cur += timedelta(days=1)

        for d in all_approved:
            if d.get("deal_status") == "Cancelled":
                continue
            day = parse_day(d.get("approved_at") or d.get("created_at") or "")
            if not day or day < start_day or day > end_day:
                continue
            key = day.isoformat()
            buckets[key]["revenue"] += float(d.get("price_closed_at") or 0)
            buckets[key]["deals"] += 1

        revenue_over_time = [
            {"date": k, "revenue": v["revenue"], "deals": v["deals"]}
            for k, v in sorted(buckets.items())
        ]

    # team-wise views (admin)
    team_views = []
    team_payments = []
    if user["role"] == "admin":
        teams = await db.business_teams.find({}, {"_id": 0}).to_list(100)
        for t in teams:
            t_deal_ids = [d["deal_id"] for d in revenue_deals if d.get("submitted_by_team_id") == t["team_id"]]
            t_views = sum(int(dv.get("views") or 0) for dv in delivs if dv["deal_id"] in t_deal_ids)
            team_views.append({"team_name": t["team_name"], "views": t_views})

            t_payments = [p for p in payments if p["deal_id"] in t_deal_ids]
            t_pending = [p for p in t_payments if p.get("status") in {"Not Raised", "Raised", "Payment Pending", "Partially Paid"}]
            t_pending_amount = sum(
                max(0.0, deal_price_by_id.get(p["deal_id"], 0.0) - float(p.get("amount_received") or 0))
                for p in t_pending
            )
            t_paid = [p for p in t_payments if p.get("status") == "Paid"]
            team_payments.append({
                "team_id": t["team_id"],
                "team_name": t["team_name"],
                "revenue": sum(float(d.get("price_closed_at") or 0) for d in revenue_deals if d.get("submitted_by_team_id") == t["team_id"]),
                "deals_approved": len(t_deal_ids),
                "payment_pending_count": len(t_pending),
                "payment_pending_amount": t_pending_amount,
                "payment_paid_count": len(t_paid),
                "by_status": {
                    status: len([p for p in t_payments if p.get("status") == status])
                    for status in ["Not Raised", "Raised", "Payment Pending", "Partially Paid", "Paid"]
                },
            })

    return {
        "revenue_closed": revenue,
        "deals_approved": len(revenue_deals),
        "deals_submitted_pending": len(pending_review),
        "deals_needs_info": len(needs_info),
        "deals_completed": len(completed),
        "payment_pending_count": len(payment_pending),
        "payment_pending_amount": payment_pending_amount,
        "total_views": total_views,
        "blocked_deliverables": len(blocked),
        "team_revenue": team_revenue,
        "team_deals": team_deals,
        "team_views": team_views,
        "team_payments": team_payments,
        "revenue_over_time": revenue_over_time,
    }


# ----------------------------- Seed -----------------------------
@api.post("/seed")
async def seed(force: bool = False):
    """Seed default teams, pages, users and sample deals. Idempotent."""
    existing_teams = await db.business_teams.count_documents({})
    if existing_teams and not force:
        return {"ok": True, "skipped": True, "message": "Already seeded. Use ?force=true to re-run."}

    # Teams
    team_defs = ["Snoball", "Hooc", "OWLED Core", "AY"]
    team_ids = {}
    for tname in team_defs:
        existing = await db.business_teams.find_one({"team_name": tname}, {"_id": 0})
        if existing:
            team_ids[tname] = existing["team_id"]
            continue
        tid = new_id("team")
        await db.business_teams.insert_one({"team_id": tid, "team_name": tname, "created_at": now_iso()})
        team_ids[tname] = tid

    # Pages
    page_defs = ["101x Founders", "Biz India", "Startup by Dog", "India Startup Story", "Founders in India", "Indian Founders Co", "Startupcoded"]
    page_ids = {}
    for pname in page_defs:
        existing = await db.monetisable_pages.find_one({"page_name": pname}, {"_id": 0})
        if existing:
            page_ids[pname] = existing["page_id"]
            continue
        pid = new_id("page")
        await db.monetisable_pages.insert_one({
            "page_id": pid, "page_name": pname, "active": True, "notes": "",
            "created_at": now_iso(), "updated_at": now_iso(),
        })
        page_ids[pname] = pid

    # Users
    user_defs = [
        ("jaskaran.sethi@owledmedia.com", "Jaskaran Sethi", "admin", None),
        ("snoball.bd@owledmedia.com", "Snoball BD", "bd", "Snoball"),
        ("hooc.bd@owledmedia.com", "Hooc BD", "bd", "Hooc"),
        ("core.bd@owledmedia.com", "OWLED Core BD", "bd", "OWLED Core"),
        ("ay.bd@owledmedia.com", "AY BD", "bd", "AY"),
        ("om@owledmedia.com", "Om", "fulfillment", None),
        ("pending.test@owledmedia.com", "New Joiner", "pending", None),
    ]
    user_ids = {}
    for email, name, role, team_name in user_defs:
        existing = await db.users.find_one({"email": email}, {"_id": 0})
        if existing:
            user_ids[email] = existing["user_id"]
            # Make sure role is correctly assigned
            await db.users.update_one({"user_id": existing["user_id"]}, {"$set": {
                "role": role,
                "business_team_id": team_ids.get(team_name) if team_name else None,
                "active": True,
            }})
            continue
        uid = new_id("user")
        await db.users.insert_one({
            "user_id": uid, "email": email, "name": name, "picture": None,
            "role": role, "business_team_id": team_ids.get(team_name) if team_name else None,
            "active": True, "created_at": now_iso(), "updated_at": now_iso(),
        })
        user_ids[email] = uid

    # Sample deals
    sample_count = await db.deals.count_documents({})
    if sample_count == 0 or force:
        now = datetime.now(timezone.utc)
        samples = [
            # 1. Submitted, pending
            dict(brand="Razorpay", agency="Direct", bd="snoball.bd@owledmedia.com", price=180000,
                 status="Submitted", deal_status=None, days=2,
                 delivs=[("Biz India", "Reel", 1), ("101x Founders", "Static", 2)],
                 brief="Series of posts to push Razorpay's new SME credit product."),
            # 2. Needs more info
            dict(brand="CRED", agency="Wavemaker", bd="hooc.bd@owledmedia.com", price=240000,
                 status="Needs More Info", deal_status=None, days=4, comment="Need exact creative direction & target audience persona.",
                 delivs=[("Startup by Dog", "Carousel", 2)],
                 brief="Brand awareness carousel for new CRED Garage launch."),
            # 3. Rejected
            dict(brand="ToothlessFoods", agency="Direct", bd="ay.bd@owledmedia.com", price=45000,
                 status="Rejected", deal_status=None, days=6, comment="Budget below threshold for this brand category.",
                 delivs=[("Founders in India", "Static", 1)],
                 brief="Single static post for early-stage D2C food brand."),
            # 4. Approved + active
            dict(brand="Notion", agency="Direct", bd="core.bd@owledmedia.com", price=520000,
                 status="Approved", deal_status="In Progress", days=10,
                 delivs=[("Startupcoded", "Reel", 1), ("Indian Founders Co", "Carousel", 2), ("India Startup Story", "Static", 1)],
                 brief="Founder-focused campaign showing Notion AI use cases for Indian startups."),
            # 5. Approved + completed
            dict(brand="Zoho", agency="Direct", bd="snoball.bd@owledmedia.com", price=320000,
                 status="Approved", deal_status="Completed", days=25,
                 delivs=[("101x Founders", "Reel", 2)],
                 brief="Zoho CRM launch reels series targeting bootstrapped founders."),
        ]

        for i, s in enumerate(samples):
            bd_user_id = user_ids[s["bd"]]
            bd_user = await db.users.find_one({"user_id": bd_user_id}, {"_id": 0})
            deal_id = new_id("deal")
            created = (now - timedelta(days=s["days"])).isoformat()
            go_live = (now + timedelta(days=14)).isoformat() if s["status"] != "Approved" or s.get("deal_status") != "Completed" else (now - timedelta(days=2)).isoformat()
            deal = {
                "deal_id": deal_id,
                "brand_name": s["brand"], "agency_or_client_name": s["agency"],
                "brief_text": s["brief"], "brief_link": "",
                "assets_or_reference_links": [],
                "price_closed_at": float(s["price"]),
                "payment_due_date": (now + timedelta(days=30)).isoformat(),
                "go_live_date_time": go_live,
                "submitted_by_user_id": bd_user_id,
                "submitted_by_team_id": bd_user["business_team_id"],
                "admin_review_status": s["status"],
                "deal_status": s.get("deal_status"),
                "rejection_reason": s.get("comment", "") if s["status"] == "Rejected" else "",
                "needs_more_info_comment": s.get("comment", "") if s["status"] == "Needs More Info" else "",
                "approved_by_admin_id": user_ids["jaskaran.sethi@owledmedia.com"] if s["status"] == "Approved" else None,
                "approved_at": created if s["status"] == "Approved" else None,
                "notes": "",
                "created_at": created,
                "updated_at": now_iso(),
            }
            await db.deals.insert_one(dict(deal))

            # deliverables
            for page_name, dtype, qty in s["delivs"]:
                pid = page_ids[page_name]
                for k in range(qty):
                    is_completed = s.get("deal_status") == "Completed"
                    is_in_progress = s.get("deal_status") == "In Progress"
                    dv_status = "Completed" if is_completed else ("Designing" if is_in_progress and k == 0 else ("Writing" if is_in_progress else "Not Started"))
                    if is_in_progress and page_name == "Indian Founders Co":
                        dv_status = "Blocked"
                    await db.deliverables.insert_one({
                        "deliverable_id": new_id("dlv"),
                        "deal_id": deal_id,
                        "page_id": pid, "page_name": page_name,
                        "deliverable_type": dtype,
                        "go_live_date_time": go_live,
                        "status": dv_status,
                        "assigned_fulfillment_user_id": user_ids["om@owledmedia.com"] if s["status"] == "Approved" else None,
                        "live_link": "https://instagram.com/p/sample" if is_completed else "",
                        "views": (35000 + i * 12000 + k * 4500) if is_completed else 0,
                        "notes": "",
                        "created_at": created, "updated_at": now_iso(),
                    })

            # payment row
            pay_status = "Paid" if s.get("deal_status") == "Completed" else ("Raised" if s["status"] == "Approved" else "Not Raised")
            await db.payments.insert_one({
                "payment_id": new_id("pay"),
                "deal_id": deal_id,
                "status": pay_status,
                "payment_due_date": deal["payment_due_date"],
                "amount_received": float(s["price"]) if pay_status == "Paid" else 0.0,
                "payment_notes": "",
                "last_updated_by": user_ids["jaskaran.sethi@owledmedia.com"],
                "last_updated_by_name": "Jaskaran Sethi",
                "last_updated_at": now_iso(),
            })

            # Outputs for In Progress deal
            if s.get("deal_status") == "In Progress":
                out_id_1 = new_id("out")
                out_id_2 = new_id("out")
                await db.fulfillment_outputs.insert_one({
                    "output_id": out_id_1, "deal_id": deal_id, "deliverable_id": None,
                    "output_type": "Google Doc Link", "title": "Notion launch — script v1",
                    "writeup_text": "First draft of the founder-narrative script.",
                    "link": "https://docs.google.com/document/d/sample",
                    "file_attachment": "", "visible_to_bd": True,
                    "status": "Shared with BD",
                    "created_by": user_ids["om@owledmedia.com"],
                    "created_by_name": "Om", "created_by_role": "fulfillment",
                    "created_at": now_iso(), "updated_at": now_iso(),
                })
                await db.fulfillment_outputs.insert_one({
                    "output_id": out_id_2, "deal_id": deal_id, "deliverable_id": None,
                    "output_type": "Canva Link", "title": "Carousel — design v1",
                    "writeup_text": "Carousel hero design, 10 slides.",
                    "link": "https://canva.com/design/sample",
                    "file_attachment": "", "visible_to_bd": True,
                    "status": "Changes Requested",
                    "created_by": user_ids["om@owledmedia.com"],
                    "created_by_name": "Om", "created_by_role": "fulfillment",
                    "created_at": now_iso(), "updated_at": now_iso(),
                })
                # sample comment from BD on the canva output
                await db.client_feedback.insert_one({
                    "feedback_id": new_id("fb"), "deal_id": deal_id, "deliverable_id": None,
                    "output_id": out_id_2,
                    "feedback_text": "Client wants the headline on slide 1 to lead with the founder, not the product. Can we swap them?",
                    "image_attachment": "", "file_attachment": "", "reference_link": "",
                    "status": "Open",
                    "added_by_user_id": user_ids["core.bd@owledmedia.com"],
                    "added_by_name": "OWLED Core BD",
                    "added_by_role": "bd", "added_by_team": "OWLED Core",
                    "created_at": now_iso(), "updated_at": now_iso(),
                })
                # fulfillment response on the same output
                await db.client_feedback.insert_one({
                    "feedback_id": new_id("fb"), "deal_id": deal_id, "deliverable_id": None,
                    "output_id": out_id_2,
                    "feedback_text": "Got it — swapping the order, will share v2 by EOD.",
                    "image_attachment": "", "file_attachment": "", "reference_link": "",
                    "status": "In Progress",
                    "added_by_user_id": user_ids["om@owledmedia.com"],
                    "added_by_name": "Om", "added_by_role": "fulfillment", "added_by_team": None,
                    "created_at": now_iso(), "updated_at": now_iso(),
                })
                await db.internal_notes.insert_one({
                    "note_id": new_id("note"), "deal_id": deal_id, "deliverable_id": None,
                    "note_text": "Designer is on leave Wed-Thu, may slip by 1 day.",
                    "created_by": user_ids["om@owledmedia.com"], "created_by_name": "Om",
                    "created_at": now_iso(),
                })

    return {"ok": True, "seeded": True}


@api.get("/")
async def root():
    return {"app": "Frontseat Seeding", "ok": True}


# ----------------------------- Lifecycle (called by FSOS app/main.py) -----------------------------
async def init_seeding():
    """Init storage + warm the asyncpg pool. Data is already migrated, so no auto-seed.

    Missing DATABASE_URL must not crash the process — the rest of FSOS still runs.
    Log a one-line warning (no traceback) so PM2 error logs don't look like a crash-loop.
    """
    try:
        init_storage()
    except Exception as e:
        logger.warning("Seeding storage init skipped: %s", e)
    try:
        await db.ping(timeout_sec=5.0)
        logger.info("Seeding Postgres pool ready")
        # Soft-ensure monetisable pages table exists (idempotent).
        try:
            pool = await db.get_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    create table if not exists public.seeding_monetisable_pages (
                        page_id       text primary key,
                        page_name     text not null,
                        fsos_page_id  uuid,
                        active        boolean not null default true,
                        notes         text not null default '',
                        created_at    timestamptz not null default now(),
                        updated_at    timestamptz not null default now()
                    )
                    """
                )
        except Exception as e:
            logger.warning("Could not ensure seeding_monetisable_pages: %s", e)
    except Exception as e:
        logger.warning(
            "Seeding DB unavailable (set DATABASE_URL or SUPABASE_DB_URL in .env to enable /api/seeding): %s",
            e,
        )


async def close_seeding():
    try:
        await db.close()
    except Exception:
        pass


async def seeding_connectivity_middleware(request: Request, call_next):
    """Turn seeding pool/connection failures into 503 instead of opaque 500s."""
    path = request.url.path or ""
    try:
        return await call_next(request)
    except HTTPException:
        raise
    except Exception as exc:
        if path.startswith("/api/seeding") and _is_db_connectivity_error(exc):
            logger.warning("Seeding DB connectivity error on %s: %s", path, exc)
            return JSONResponse(
                status_code=503,
                content={
                    "detail": "Seeding database unavailable. Set DATABASE_URL or SUPABASE_DB_URL on the backend.",
                },
            )
        # Non-seeding (or non-connectivity) errors: do not swallow — re-raise for FastAPI handlers.
        raise


def register_seeding_middleware(app: FastAPI) -> None:
    app.middleware("http")(seeding_connectivity_middleware)
