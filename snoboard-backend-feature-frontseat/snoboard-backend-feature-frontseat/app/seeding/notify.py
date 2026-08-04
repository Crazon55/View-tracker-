"""
Seeding → Supabase `notifications` inserts.

Reuses the Idea Engine notifications table so Realtime + Web Audio chime
on the frontend fire without a seeding-specific poller.
"""
from __future__ import annotations

import logging
import os
from typing import Iterable, List, Optional, Set

from app.seeding.postgres_db import lazy_database as db

logger = logging.getLogger(__name__)

# Keep in sync with routes.SEED_ADMIN_EMAIL so admins always receive submit pings
# even before their seeding profile role is stamped.
SEED_ADMIN_EMAILS = {
    e.strip().lower()
    for e in os.environ.get("SEED_ADMIN_EMAIL", "jaskaran.sethi@owledmedia.com").split(",")
    if e.strip()
}


def _norm_email(value: Optional[str]) -> str:
    return (value or "").strip().lower()


async def email_for_user_id(user_id: Optional[str]) -> Optional[str]:
    if not user_id:
        return None
    try:
        row = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1})
    except Exception as e:
        logger.warning("email_for_user_id failed: %s", e)
        return None
    em = _norm_email((row or {}).get("email"))
    return em or None


async def emails_for_role(role: str) -> List[str]:
    """All active emails for admin or fulfillment (seeding DB + FSOS user_roles)."""
    role = (role or "").strip().lower()
    if role not in {"admin", "fulfillment"}:
        return []

    found: Set[str] = set()

    if role == "admin":
        found.update(_norm_email(e) for e in SEED_ADMIN_EMAILS if _norm_email(e))

    try:
        rows = await db.users.find(
            {"active": {"$ne": False}, "role": role},
            {"_id": 0, "email": 1},
        ).to_list(500)
        for u in rows:
            em = _norm_email(u.get("email"))
            if em:
                found.add(em)
    except Exception as e:
        logger.warning("emails_for_role seeding lookup failed: %s", e)

    try:
        from app.database.client import get_supabase_client
        fsos = get_supabase_client().table("user_roles").select("email,role").execute().data or []
        for row in fsos:
            parts = {
                p.strip().lower()
                for p in str(row.get("role") or "").split(",")
                if p.strip()
            }
            # Match exact role token, or "admin" inside compound FSOS roles.
            if role not in parts and not any(role == p or p.endswith(f"_{role}") for p in parts):
                continue
            em = _norm_email(row.get("email"))
            if em:
                found.add(em)
    except Exception as e:
        logger.warning("emails_for_role FSOS lookup failed: %s", e)

    return sorted(found)


def notify_emails(
    emails: Iterable[str],
    *,
    type: str,
    deal_id: str,
    brand: str,
    from_name: Optional[str],
    message: str,
    exclude_email: Optional[str] = None,
) -> None:
    """Best-effort insert into public.notifications. Never raises."""
    skip = _norm_email(exclude_email)
    recipients = sorted({_norm_email(e) for e in emails if _norm_email(e) and _norm_email(e) != skip})
    if not recipients or not deal_id:
        return

    rows = [
        {
            "user_email": email,
            "type": type,
            "idea_id": deal_id,
            "idea_title": brand or "Seeding brief",
            "from_name": from_name or "Seeding",
            "message": message,
            "tracker_type": "seeding",
        }
        for email in recipients
    ]

    try:
        from app.database.client import get_supabase_client
        get_supabase_client().table("notifications").insert(rows).execute()
        logger.info("seeding notify (%s) → %s", type, ", ".join(recipients))
    except Exception as e:
        logger.warning("seeding notify insert failed (%s): %s", type, e)


async def notify_admins_brief_submitted(deal: dict, actor: dict) -> None:
    brand = deal.get("brand_name") or deal.get("agency_or_client_name") or "a brief"
    name = actor.get("name") or actor.get("email") or "BD"
    emails = await emails_for_role("admin")
    notify_emails(
        emails,
        type="seeding_brief_submitted",
        deal_id=deal.get("deal_id") or "",
        brand=brand,
        from_name=name,
        message=f'{name} submitted brief for "{brand}"',
        exclude_email=actor.get("email"),
    )


async def notify_fulfillment_brief_approved(deal: dict, actor: dict) -> None:
    brand = deal.get("brand_name") or deal.get("agency_or_client_name") or "a brief"
    name = actor.get("name") or actor.get("email") or "Admin"
    emails = await emails_for_role("fulfillment")
    notify_emails(
        emails,
        type="seeding_brief_approved",
        deal_id=deal.get("deal_id") or "",
        brand=brand,
        from_name=name,
        message=f'"{brand}" approved — ready for fulfillment',
        exclude_email=actor.get("email"),
    )


async def notify_bd_fulfillment_update(deal: dict, actor: dict, detail: str = "updated the brief") -> None:
    """Ping the BD who submitted the brief when fulfillment makes a meaningful change."""
    if actor.get("role") != "fulfillment":
        return
    bd_email = await email_for_user_id(deal.get("submitted_by_user_id"))
    if not bd_email:
        return
    brand = deal.get("brand_name") or deal.get("agency_or_client_name") or "your brief"
    name = actor.get("name") or actor.get("email") or "Fulfillment"
    notify_emails(
        [bd_email],
        type="seeding_fulfillment_update",
        deal_id=deal.get("deal_id") or "",
        brand=brand,
        from_name=name,
        message=f'{name} {detail} on "{brand}"',
        exclude_email=actor.get("email"),
    )
