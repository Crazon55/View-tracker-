"""FSOS access model, server side.

Mirrors fsos-frontend/src/domain/access.js — keep the two in sync. The frontend hides
what you can't use; this decides what you're actually allowed to do.
"""
from fastapi import HTTPException

AREAS = [
    "command_room", "bo_studio", "hpn_desk", "production", "distribution", "performance",
    "news", "tickets", "pintu", "six_day", "growth", "users_roles", "settings",
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
    "Short-form Lead": _m(**_WORKSPACE, news="edit", tickets="edit", pintu="view", six_day="edit", growth="view"),
    "CS": _m(command_room="edit", bo_studio="edit", hpn_desk="edit", production="edit", performance="edit",
             news="edit", tickets="edit", pintu="view", six_day="view", growth="view"),
    "Designer": _m(production="edit", tickets="edit", pintu="view", growth="view"),
    "Editor": _m(production="edit", tickets="edit", pintu="view", growth="view"),
    "COC": _m(command_room="edit", distribution="edit", performance="edit",
              news="view", tickets="edit", six_day="edit", growth="view"),
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


def require(matrix: dict, area: str, level: str = "view") -> None:
    """Raise 403 unless the matrix grants at least `level` on `area`."""
    if RANK.get(matrix.get(area, "none"), 0) < RANK[level]:
        raise HTTPException(status_code=403, detail=f"You need {level} access to {area}.")
