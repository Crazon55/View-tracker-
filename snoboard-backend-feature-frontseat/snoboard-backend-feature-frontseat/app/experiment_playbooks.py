"""Playbook experiments — BPB, XF, TECH each use their own database tables."""

from dataclasses import dataclass

from fastapi import HTTPException

VALID_PLAYBOOKS = frozenset({"bpb", "xf", "tech"})
DEFAULT_PLAYBOOK = "bpb"

PLAYBOOK_PAGES: dict[str, list[str]] = {
    "bpb": [
        "indianfoundersco",
        "indianbusinesscom",
        "indiastartupstory",
        "indiafounderscore",
        "foundersinindia",
        "startupcoded",
        "bizzindia",
        "101xfounders",
        "thechangingorder",
        "indiahappeningnow",
    ],
    "xf": [
        "entrepreneurial.india",
        "startupcoded",
    ],
    "tech": [
        "101xtechnology",
        "indiantechdaily",
        "ai.cracked",
    ],
}

PLAYBOOK_NICHE_NAMES: dict[str, str] = {
    "bpb": "FBS - The Bizz playbook",
    "xf": "FBS - XF Playbook",
    "tech": "FBS - TECH Playbook",
}


@dataclass(frozen=True)
class PlaybookTables:
    """Physical Supabase tables for one playbook (fully isolated)."""

    idea_bank: str
    content_bank: str
    working_ideas: str
    settings: str


# BPB keeps legacy exp_* tables (existing Experiment X data).
# XF and TECH each have their own table set — no shared rows.
PLAYBOOK_TABLES: dict[str, PlaybookTables] = {
    "bpb": PlaybookTables(
        idea_bank="exp_idea_bank",
        content_bank="exp_content_bank",
        working_ideas="exp_working_ideas",
        settings="exp_settings",
    ),
    "xf": PlaybookTables(
        idea_bank="xf_idea_bank",
        content_bank="xf_content_bank",
        working_ideas="xf_working_ideas",
        settings="xf_settings",
    ),
    "tech": PlaybookTables(
        idea_bank="tech_idea_bank",
        content_bank="tech_content_bank",
        working_ideas="tech_working_ideas",
        settings="tech_settings",
    ),
}


def validate_playbook(playbook: str | None) -> str:
    pb = (playbook or DEFAULT_PLAYBOOK).strip().lower()
    if pb not in VALID_PLAYBOOKS:
        raise HTTPException(status_code=404, detail=f"Unknown playbook: {playbook}")
    return pb


def get_playbook_tables(playbook: str | None) -> PlaybookTables:
    pb = validate_playbook(playbook)
    return PLAYBOOK_TABLES[pb]


def exp_sum_views(idea: dict) -> int:
    """Total views from page_views map, falling back to views column."""
    page_views = idea.get("page_views") or {}
    if page_views:
        return sum(int(v or 0) for v in page_views.values())
    return int(idea.get("views") or 0)


def exp_root_origin(source_playbook: str, idea: dict) -> tuple[str, str]:
    """Trace to the playbook + id that originally created the idea."""
    op = (idea.get("origin_playbook") or "").strip().lower()
    oid = idea.get("origin_idea_id")
    if op and oid:
        return op, str(oid)
    return source_playbook, str(idea["id"])


def exp_find_deployments(client, origin_playbook: str, origin_idea_id: str) -> dict[str, list[dict]]:
    """Deployments in other playbooks linked to a root origin idea."""
    result: dict[str, list[dict]] = {}
    for pb in VALID_PLAYBOOKS:
        if pb == origin_playbook:
            continue
        tables = get_playbook_tables(pb)
        rows = (
            client.table(tables.idea_bank)
            .select("*")
            .eq("origin_playbook", origin_playbook)
            .eq("origin_idea_id", origin_idea_id)
            .execute()
            .data
            or []
        )
        if rows:
            result[pb] = rows
    return result


def exp_enrich_ideas_cross_playbook(client, playbook: str, ideas: list[dict]) -> list[dict]:
    """Attach cross-playbook view breakdown to native (origin) ideas."""
    if not ideas:
        return ideas

    native_ids = [str(i["id"]) for i in ideas if not i.get("origin_playbook")]
    deployments_by_origin: dict[str, dict[str, list[dict]]] = {oid: {} for oid in native_ids}

    if native_ids:
        for pb in VALID_PLAYBOOKS:
            if pb == playbook:
                continue
            tables = get_playbook_tables(pb)
            rows = (
                client.table(tables.idea_bank)
                .select("origin_idea_id, views, page_views")
                .eq("origin_playbook", playbook)
                .in_("origin_idea_id", native_ids)
                .execute()
                .data
                or []
            )
            for row in rows:
                oid = str(row.get("origin_idea_id") or "")
                if oid in deployments_by_origin:
                    deployments_by_origin[oid].setdefault(pb, []).append(row)

    enriched: list[dict] = []
    for idea in ideas:
        item = dict(idea)
        if item.get("origin_playbook"):
            item["deployed_from"] = {
                "playbook": item["origin_playbook"],
                "idea_id": str(item.get("origin_idea_id") or ""),
            }
        else:
            oid = str(item["id"])
            deps = deployments_by_origin.get(oid) or {}
            if deps:
                breakdown: dict[str, int] = {"own": exp_sum_views(item)}
                for pb, rows in deps.items():
                    breakdown[pb] = sum(exp_sum_views(r) for r in rows)
                breakdown["total"] = sum(breakdown.values())
                item["cross_playbook_views"] = breakdown
                item["deployed_to_playbooks"] = sorted(deps.keys())
        enriched.append(item)
    return enriched


def _pages_from_idea_maps(row: dict, include_handle: bool = False) -> list[str]:
    """Pages this idea has already run on, from history maps (not today's pool assignment)."""
    pages: set[str] = set()
    for key in ("page_live_links", "page_posting_dates", "page_views"):
        m = row.get(key) or {}
        if isinstance(m, dict):
            for p in m:
                t = str(p).strip().lstrip("@")
                if t:
                    pages.add(t)
    if include_handle:
        for p in str(row.get("page_handle") or "").split(","):
            t = p.strip().lstrip("@")
            if t:
                pages.add(t)
    return sorted(pages)


def exp_attach_previously_posted(client, playbook: str, ideas: list[dict]) -> list[dict]:
    """Stamp previously_posted_pages on Ideas Pool cards so Content Distribution can
    warn before re-posting. Uses maps already on the row; if a Send happened before
    those were copied, look up the origin idea (+ same-topic siblings) once."""
    if not ideas:
        return ideas

    need: list[dict] = []
    for idea in ideas:
        maps = _pages_from_idea_maps(idea, include_handle=False)
        if maps:
            idea["previously_posted_pages"] = maps
            continue
        if idea.get("frontseat_pool") and idea.get("origin_idea_id"):
            need.append(idea)
        else:
            idea["previously_posted_pages"] = []

    if not need:
        return ideas

    by_pb: dict[str, list[str]] = {}
    for idea in need:
        op = str(idea.get("origin_playbook") or playbook).strip().lower()
        if op not in VALID_PLAYBOOKS:
            op = playbook
        by_pb.setdefault(op, []).append(str(idea["origin_idea_id"]))

    pages_by_origin: dict[tuple[str, str], list[str]] = {}
    pages_by_topic: dict[tuple[str, str], list[str]] = {}
    origin_topic: dict[tuple[str, str], str] = {}

    for pb, ids in by_pb.items():
        uniq = list(dict.fromkeys(ids))
        tables = get_playbook_tables(pb)
        origins = (
            client.table(tables.idea_bank)
            .select("id,topic,page_handle,page_views,page_live_links,page_posting_dates")
            .in_("id", uniq)
            .execute()
            .data
            or []
        )
        topics: list[str] = []
        for row in origins:
            oid = str(row.get("id") or "")
            pages_by_origin[(pb, oid)] = _pages_from_idea_maps(row, include_handle=True)
            topic = str(row.get("topic") or "").strip()
            if topic:
                origin_topic[(pb, oid)] = topic
                topics.append(topic)
        topics = list(dict.fromkeys(topics))
        if not topics:
            continue
        siblings = (
            client.table(tables.idea_bank)
            .select("topic,status,page_handle,page_views,page_live_links,page_posting_dates")
            .in_("topic", topics)
            .limit(200)
            .execute()
            .data
            or []
        )
        bucket: dict[str, set[str]] = {}
        for row in siblings:
            topic = str(row.get("topic") or "").strip()
            if not topic:
                continue
            posted = str(row.get("status") or "").strip().lower() == "posted"
            pages = _pages_from_idea_maps(row, include_handle=posted)
            if not pages:
                continue
            bucket.setdefault(topic.lower(), set()).update(pages)
        for topic_key, pages in bucket.items():
            pages_by_topic[(pb, topic_key)] = sorted(pages)

    for idea in need:
        op = str(idea.get("origin_playbook") or playbook).strip().lower()
        oid = str(idea.get("origin_idea_id") or "")
        topic = origin_topic.get((op, oid), "")
        idea["previously_posted_pages"] = (
            pages_by_topic.get((op, topic.lower()))
            or pages_by_origin.get((op, oid))
            or []
        )
    return ideas

