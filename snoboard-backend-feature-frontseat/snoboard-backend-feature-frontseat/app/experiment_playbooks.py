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
        "indiafounderbrief",
    ],
    "xf": [
        "entrepreneurial.india",
        "startupcoded",
    ],
    "tech": [
        "101xtechnology",
        "indiantechdaily",
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
