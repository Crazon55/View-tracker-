"""Playbook experiment config — BPB, XF, TECH share exp_* tables via playbook_id."""

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
    "bpb": "FBS - Experiment BPB",
    "xf": "FBS - XF Playbook",
    "tech": "FBS - TECH Playbook",
}


def validate_playbook(playbook: str | None) -> str:
    pb = (playbook or DEFAULT_PLAYBOOK).strip().lower()
    if pb not in VALID_PLAYBOOKS:
        raise HTTPException(status_code=404, detail=f"Unknown playbook: {playbook}")
    return pb
