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
        "indiantechdaily",
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

