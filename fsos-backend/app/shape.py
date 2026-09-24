"""Database rows ↔ the shape the FSOS frontend works in.

The frontend's state was designed before the schema existed, so the names differ in
places (`order`/`sort_order`, `text`/`body`, `at`/`created_at`, `users`/`people`).
Rather than rename half the UI, every row crosses this module on the way out and the
way in. One place to look when a field goes missing.

`to_*` turns a row into what the browser sees; `from_*` turns a patch from the browser
into columns. `from_*` only emits keys the caller actually sent, so a PATCH stays partial.
"""
from typing import Any

# ───────────────────────── helpers ─────────────────────────


def _pick(patch: dict, mapping: dict[str, str]) -> dict:
    """Columns for the keys present in `patch`. Absent keys stay absent (partial PATCH)."""
    return {col: patch[key] for key, col in mapping.items() if key in patch}


def _iso(value: Any) -> Any:
    return value


# ───────────────────────── organisation ─────────────────────────

# The frontend calls them users; the table is `people`.
def to_user(r: dict) -> dict:
    return {
        "id": r["id"],
        "name": r.get("name"),
        "email": r.get("email"),
        "initials": r.get("initials"),
        "color": r.get("color"),
        "roles": r.get("roles") or [],
        "streams": r.get("streams") or [],
        "skills": r.get("skills") or [],
        "active": r.get("active", True),
    }


IP_COLS = {
    "code": "code", "name": "name", "handle": "handle", "hex": "hex", "active": "active",
    "group": "tracker_group", "stage": "stage", "floors": "floors", "ranges": "ranges",
    "menu": "menu", "boTarget": "bo_target", "perfTarget": "perf_target",
    "spacingMinutes": "spacing_minutes",
}


def to_ip(r: dict) -> dict:
    return {
        "id": r["id"],
        "code": r.get("code"),
        "name": r.get("name"),
        "handle": r.get("handle"),
        "hex": r.get("hex"),
        "active": r.get("active", True),
        "group": r.get("tracker_group") or "none",
        "stage": r.get("stage") or 1,
        "floors": r.get("floors") or {"posts": 0, "reels": 0},
        "ranges": r.get("ranges") or {},
        "menu": r.get("menu") or [],
        "boTarget": r.get("bo_target"),
        "perfTarget": r.get("perf_target") or {"reel": None, "post": None, "note": ""},
        "spacingMinutes": r.get("spacing_minutes"),
    }


def from_ip(patch: dict) -> dict:
    return _pick(patch, IP_COLS)


def to_category(r: dict) -> dict:
    # formatGroup is "Reel" or "Post"; Post covers Carousel and Static, the same split
    # the IP floors and cadence counting use.
    return {
        "id": r["id"],
        "name": r.get("name"),
        "stream": r.get("stream"),
        "formatGroup": r.get("format_group") or "Post",
    }


# ───────────────────────── ideas → versions ─────────────────────────

BATCH_COLS = {"name": "name", "stream": "stream", "deadline": "deadline", "reviewerId": "reviewer_id"}


def to_batch(r: dict, idea_ids: list[str] | None = None) -> dict:
    return {
        "id": r["id"],
        "name": r.get("name"),
        "stream": r.get("stream") or "BO",
        "deadline": r.get("deadline"),
        "reviewerId": r.get("reviewer_id"),
        "ideaIds": idea_ids or [],
    }


def from_batch(patch: dict) -> dict:
    return _pick(patch, BATCH_COLS)


IDEA_COLS = {
    "title": "title", "topic": "topic", "format": "format", "category": "category",
    "sources": "sources", "brief": "brief", "destinations": "destinations",
    "productionOwnerId": "production_owner_id", "previousOwners": "previous_owners",
    "reviewerId": "reviewer_id", "batchId": "batch_id", "deadline": "deadline",
    "bypassUsed": "bypass_used", "dropped": "dropped",
}


def to_idea(r: dict) -> dict:
    return {
        "id": r["id"],
        "code": r.get("code"),
        "stream": r.get("stream"),
        "title": r.get("title"),
        "topic": r.get("topic"),
        "format": r.get("format"),
        "category": r.get("category"),
        "creatorId": r.get("creator_id"),
        "createdAt": _iso(r.get("created_at")),
        "sources": r.get("sources") or [],
        "brief": r.get("brief") or {},
        "destinations": r.get("destinations") or [],
        # Three columns, one object — the UI reads idea.approval.state everywhere.
        "approval": {
            "state": r.get("approval_state") or "pending",
            "by": r.get("approved_by"),
            "at": _iso(r.get("approved_at")),
        },
        "productionOwnerId": r.get("production_owner_id"),
        "previousOwners": r.get("previous_owners") or [],
        "reviewerId": r.get("reviewer_id"),
        "batchId": r.get("batch_id"),
        "deadline": r.get("deadline"),
        "bypassUsed": r.get("bypass_used"),
        "dropped": r.get("dropped") or [],
    }


def from_idea(patch: dict) -> dict:
    cols = _pick(patch, IDEA_COLS)
    approval = patch.get("approval")
    if approval is not None:
        cols["approval_state"] = approval.get("state", "pending")
        cols["approved_by"] = approval.get("by")
        cols["approved_at"] = approval.get("at")
    return cols


VERSION_COLS = {
    "hookOverride": "hook_override", "subHook": "sub_hook", "bodyText": "body_text",
    "caption": "caption", "notesOverride": "notes_override", "assetLinks": "asset_links",
    "reviewStatus": "review_status", "revisions": "revisions",
}


def to_version(r: dict) -> dict:
    return {
        "id": r["id"],
        "ideaId": r.get("idea_id"),
        "ipId": r.get("ip_id"),
        "hookOverride": r.get("hook_override") or "",
        "subHook": r.get("sub_hook") or "",
        "bodyText": r.get("body_text") or "",
        "caption": r.get("caption") or "",
        "notesOverride": r.get("notes_override") or "",
        "assetLinks": r.get("asset_links") or [],
        "reviewStatus": r.get("review_status") or "not_started",
        "revisions": r.get("revisions") or [],
    }


def from_version(patch: dict) -> dict:
    return _pick(patch, VERSION_COLS)


# ───────────────────────── calendar → publication → views ─────────────────────────

PLACEMENT_COLS = {
    "date": "date", "time": "time", "order": "sort_order", "state": "state",
    "history": "history", "exceptionReason": "exception_reason", "exceptionBy": "exception_by",
    "exceptionAt": "exception_at", "reportedPending": "reported_pending",
}


def to_placement(r: dict) -> dict:
    return {
        "id": r["id"],
        "versionId": r.get("version_id"),
        "ipId": r.get("ip_id"),
        "date": r.get("date"),
        "time": r.get("time"),
        "order": r.get("sort_order") or 1,
        "state": r.get("state") or "pending",
        "history": r.get("history") or [],
        "exceptionReason": r.get("exception_reason"),
        "exceptionBy": r.get("exception_by"),
        "exceptionAt": _iso(r.get("exception_at")),
        "reportedPending": r.get("reported_pending", False),
    }


def from_placement(patch: dict) -> dict:
    return _pick(patch, PLACEMENT_COLS)


def to_publication(r: dict, links: list[dict]) -> dict:
    """`links` are the publication_versions rows for this publication, in insertion order."""
    return {
        "id": r["id"],
        "url": r.get("url"),
        "publishedAt": _iso(r.get("published_at")),
        "isCollab": r.get("is_collab", False),
        "versionIds": [l["version_id"] for l in links],
        "ipIds": [l["ip_id"] for l in links],
        "placementIds": [l["placement_id"] for l in links if l.get("placement_id")],
    }


def to_snapshot(r: dict) -> dict:
    return {
        "id": r["id"],
        "publicationId": r.get("publication_id"),
        "views": r.get("views"),
        "measuredAt": _iso(r.get("measured_at")),
        "ageHours": r.get("age_hours"),
        "recordedBy": r.get("recorded_by"),
        "dueAt": _iso(r.get("due_at")),
    }


# ───────────────────────── collaboration ─────────────────────────


def to_comment(r: dict, replies: list[dict] | None = None) -> dict:
    """Replies are `comments` rows with parent_id set; the UI wants them nested."""
    return {
        "id": r["id"],
        "ideaId": r.get("idea_id"),
        "versionId": r.get("version_id"),
        "anchor": r.get("anchor") or {"type": "general"},
        "text": r.get("body"),
        "authorId": r.get("author_id"),
        "at": _iso(r.get("created_at")),
        "resolved": r.get("resolved", False),
        "replies": replies or [],
    }


def to_reply(r: dict) -> dict:
    return {"id": r["id"], "authorId": r.get("author_id"), "at": _iso(r.get("created_at")), "text": r.get("body")}


def to_activity(r: dict) -> dict:
    return {
        "id": r["id"],
        "ideaId": r.get("idea_id"),
        "type": r.get("type"),
        "text": r.get("text"),
        "actorId": r.get("actor_id"),
        "at": _iso(r.get("created_at")),
    }


def to_notification(r: dict) -> dict:
    return {
        "id": r["id"],
        "userId": r.get("person_id"),   # null = everyone
        "type": r.get("type"),
        "text": r.get("text"),
        "ideaId": r.get("idea_id"),
        "publicationId": r.get("publication_id"),
        "read": r.get("read", False),
        "at": _iso(r.get("created_at")),
    }


# ───────────────────────── 6-day tracker & growth ─────────────────────────

# The UI works in "YYYY-MM"; the column is a date pinned to the first of the month.
def month_to_col(ym: str) -> str:
    return f"{ym}-01"


def month_from_col(d: str) -> str:
    return (d or "")[:7]


def to_six_day_entry(r: dict) -> dict:
    return {
        "id": r["id"],
        "month": month_from_col(r.get("month")),
        "cycle": r.get("cycle"),
        "ipId": r.get("ip_id"),
        "views": r.get("views") or 0,
        "reelPct": r.get("reel_pct"),
        "postPct": r.get("post_pct"),
        "reelPerf": r.get("reel_perf"),
        "postPerf": r.get("post_perf"),
        "filledBy": r.get("filled_by"),
    }


def to_top_content(r: dict) -> dict:
    return {
        "id": r["id"],
        "month": month_from_col(r.get("month")),
        "cycle": r.get("cycle"),
        "ipId": r.get("ip_id"),
        "link": r.get("link"),
        "views": r.get("views") or 0,
        "type": r.get("content_type") or "reel",
    }


def to_actual(r: dict) -> dict:
    return {
        "month": month_from_col(r.get("month")),
        "ipId": r.get("ip_id"),
        "actualViews": r.get("actual_views"),
        "filledBy": r.get("filled_by"),
    }


def to_growth(r: dict) -> dict:
    return {
        "month": month_from_col(r.get("month")),
        "ipId": r.get("ip_id"),
        "views": r.get("views"),
        "followersGained": r.get("followers_gained") or 0,
    }
