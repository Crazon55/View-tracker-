"""FSOS access model, server side.

Mirrors fsos-frontend/src/domain/access.js — keep the two in sync. The frontend hides
what you can't use; this decides what you're actually allowed to do.
"""
from fastapi import HTTPException

AREAS = [
    "command_room", "bo_studio", "hpn_desk", "production", "distribution", "performance",
    "news", "pintu", "six_day", "growth", "users_roles", "settings",
]
LEVELS = ("none", "view", "edit")
RANK = {"none": 0, "view": 1, "edit": 2}
LOCKED_ROLE = "Founder/Admin"

_WORKSPACE = {a: "edit" for a in ("command_room", "bo_studio", "hpn_desk", "production", "distribution", "performance")}


def _m(**levels) -> dict:
    return {a: levels.get(a, "none") for a in AREAS}


ROLE_ACCESS_DEFAULTS: dict[str, dict] = {
    "Founder/Admin": {a: "edit" for a in AREAS},
    "COA": {a: "edit" for a in AREAS},
    "Short-form Lead": _m(**_WORKSPACE, news="edit", pintu="view", six_day="edit", growth="view"),
    "CS": _m(command_room="edit", bo_studio="edit", hpn_desk="edit", production="edit", performance="edit",
             news="edit", pintu="view", six_day="view", growth="view"),
    "Designer": _m(production="edit", pintu="view", growth="view"),
    "Editor": _m(production="edit", pintu="view", growth="view"),
    "COC": _m(command_room="edit", distribution="edit", performance="edit",
              news="view", six_day="edit", growth="view"),
}


def resolve_role_access(role: str, role_overrides: dict | None = None) -> dict:
    base = ROLE_ACCESS_DEFAULTS.get(role) or {a: "none" for a in AREAS}
    if role == LOCKED_ROLE:
        return base
    override = (role_overrides or {}).get(role)
    return {**base, **override} if override else base


def resolve_person_access(roles: list[str], person_override: dict | None = None, role_overrides: dict | None = None) -> dict:
    matrix = {a: "none" for a in AREAS}
    for role in roles or []:
        role_matrix = resolve_role_access(role, role_overrides)
        for area in AREAS:
            if RANK[role_matrix[area]] > RANK[matrix[area]]:
                matrix[area] = role_matrix[area]
    if LOCKED_ROLE in (roles or []):
        return matrix
    return {**matrix, **(person_override or {})} if person_override else matrix


def grants_beyond(matrix: dict, ceiling: dict, previous: dict | None = None) -> str | None:
    """The first area where `matrix` raises access above `ceiling`, otherwise None.

    Used to stop privilege escalation: you can't hand out more than you hold. Areas that
    `previous` already granted are ignored, so you can still *lower* someone who currently
    outranks you.
    """
    for area, level in matrix.items():
        rank = RANK.get(level, 0)
        if rank > RANK.get(ceiling.get(area, "none"), 0) and rank > RANK.get((previous or {}).get(area, "none"), 0):
            return area
    return None


def require(matrix: dict, area: str, level: str = "view") -> None:
    """Raise 403 unless the matrix grants at least `level` on `area`."""
    if RANK.get(matrix.get(area, "none"), 0) < RANK[level]:
        raise HTTPException(status_code=403, detail=f"You need {level} access to {area}.")
