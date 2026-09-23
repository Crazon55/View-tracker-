"""Users & Roles: people, their roles, and per-person / per-role access overrides."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..access import (
    AREAS, LEVELS, LOCKED_ROLE, ROLE_ACCESS_DEFAULTS,
    grants_beyond, require, resolve_person_access, resolve_role_access,
)
from ..auth import Caller, current_caller

router = APIRouter(prefix="/api/people", tags=["people"])
# Separate prefix: "/api/people/roles/..." would be captured by "/api/people/{person_id}/...".
roles_router = APIRouter(prefix="/api/roles", tags=["roles"])

ROLES = ["Founder/Admin", "Short-form Lead", "CS", "COA", "Designer", "Editor", "COC"]
PERSON_FIELDS = "id,name,email,initials,color,roles,streams,skills,active"


def _valid_matrix(matrix: dict) -> dict:
    bad_area = next((a for a in matrix if a not in AREAS), None)
    if bad_area:
        raise HTTPException(status_code=400, detail=f"Unknown area: {bad_area}")
    bad_level = next((v for v in matrix.values() if v not in LEVELS), None)
    if bad_level:
        raise HTTPException(status_code=400, detail=f"Unknown level: {bad_level}")
    return matrix


def _valid_roles(roles: list[str]) -> list[str]:
    bad = next((r for r in roles if r not in ROLES), None)
    if bad:
        raise HTTPException(status_code=400, detail=f"Unknown role: {bad}")
    return roles


def _no_escalation(caller: Caller, granting: dict, previous: dict | None, what: str) -> None:
    """Managing access doesn't mean owning the place: you can only hand out what you hold."""
    area = grants_beyond(granting, caller.access, previous)
    if area:
        raise HTTPException(
            status_code=403,
            detail=f"You can't give {what} {granting[area]} access to {area.replace('_', ' ')} "
                   "— you don't have it yourself.",
        )


def _guard_locked_role(caller: Caller, before: list[str], after: list[str]) -> None:
    """Only a Founder/Admin hands out — or takes away — Founder/Admin."""
    if LOCKED_ROLE in set(before) ^ set(after) and LOCKED_ROLE not in caller.roles:
        raise HTTPException(status_code=403, detail=f"Only a {LOCKED_ROLE} can grant or remove the {LOCKED_ROLE} role.")


async def _last_admin(person_id: str) -> bool:
    admins = await db.select("people", {"select": "id", "roles": f"cs.{{\"{LOCKED_ROLE}\"}}"})
    return [a["id"] for a in admins] == [person_id]


async def _overrides() -> tuple[dict, dict]:
    role_rows = await db.select("access_role_overrides", {"select": "role,matrix"})
    person_rows = await db.select("access_person_overrides", {"select": "person_id,matrix"})
    return ({r["role"]: r["matrix"] for r in role_rows}, {r["person_id"]: r["matrix"] for r in person_rows})


class PersonPatch(BaseModel):
    roles: list[str] | None = None
    matrix: dict[str, str] | None = None   # null clears the person's override
    clear_matrix: bool = False
    # Profile fields, edited from Settings → People.
    name: str | None = None
    streams: list[str] | None = None
    skills: list[str] | None = None
    active: bool | None = None


class RoleMatrix(BaseModel):
    # Role travels in the body, not the path: "Founder/Admin" contains a slash.
    role: str
    matrix: dict[str, str] = Field(default_factory=dict)


class NewPerson(BaseModel):
    name: str
    email: str | None = None
    roles: list[str] = Field(default_factory=list)
    streams: list[str] = Field(default_factory=lambda: ["BO", "HPN"])
    skills: list[str] = Field(default_factory=list)


@router.get("")
async def list_people(caller: Caller = Depends(current_caller)):
    """Everyone, with their effective access. Needs view on Users & Roles."""
    require(caller.access, "users_roles", "view")
    people = await db.select("people", {"select": PERSON_FIELDS, "order": "name"})
    role_overrides, person_overrides = await _overrides()
    for p in people:
        p["accessOverride"] = person_overrides.get(p["id"])
        p["access"] = resolve_person_access(p.get("roles") or [], p["accessOverride"], role_overrides)
    return {"people": people, "roles": ROLES, "areas": AREAS}


@router.patch("/{person_id}")
async def update_person(person_id: str, patch: PersonPatch, caller: Caller = Depends(current_caller)):
    require(caller.access, "users_roles", "edit")
    person = await db.select_one("people", {"id": f"eq.{person_id}", "select": "*"})
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    before = person.get("roles") or []
    roles = _valid_roles(patch.roles) if patch.roles is not None else before
    role_overrides, person_overrides = await _overrides()
    _guard_locked_role(caller, before, roles)
    if LOCKED_ROLE in before and LOCKED_ROLE not in roles and await _last_admin(person_id):
        raise HTTPException(status_code=400, detail=f"{person['name']} is the last {LOCKED_ROLE}.")

    # What they'd end up with, and what they have now — so we can allow lowering but not raising.
    override = _valid_matrix(patch.matrix) if patch.matrix else None
    effective = resolve_person_access(roles, override, role_overrides)
    current = resolve_person_access(before, person_overrides.get(person_id), role_overrides)
    _no_escalation(caller, effective, current, person["name"])

    # Don't let yourself lose the ability to manage access.
    if person_id == caller.id and LOCKED_ROLE not in roles and effective.get("users_roles") != "edit":
        raise HTTPException(status_code=400, detail="That would remove your own access to Users & Roles.")

    # Deactivating yourself would lock you out on the next request.
    if patch.active is False and person_id == caller.id:
        raise HTTPException(status_code=400, detail="You can't deactivate your own account.")
    if patch.active is False and LOCKED_ROLE in roles and await _last_admin(person_id):
        raise HTTPException(status_code=400, detail=f"{person['name']} is the last {LOCKED_ROLE}.")

    profile = {k: v for k, v in (
        ("name", patch.name.strip() if patch.name else None),
        ("streams", patch.streams),
        ("skills", patch.skills),
        ("active", patch.active),
    ) if v is not None}
    if patch.roles is not None:
        profile["roles"] = roles
    if profile:
        await db.update("people", {"id": f"eq.{person_id}"}, profile)
    if patch.clear_matrix or patch.matrix == {}:
        await db.delete("access_person_overrides", {"person_id": f"eq.{person_id}"})
    elif patch.matrix is not None:
        await db.insert("access_person_overrides",
                        {"person_id": person_id, "matrix": _valid_matrix(patch.matrix)},
                        upsert_on="person_id")

    return await person_detail(person_id, caller)


@router.post("")
async def add_person(body: NewPerson, caller: Caller = Depends(current_caller)):
    require(caller.access, "users_roles", "edit")
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    roles = _valid_roles(body.roles)
    _guard_locked_role(caller, [], roles)
    role_overrides, _ = await _overrides()
    _no_escalation(caller, resolve_person_access(roles, None, role_overrides), None, name)
    initials = "".join(p[0] for p in name.replace(".", " ").split()[:2]).upper() or "?"
    return await db.insert("people", {
        "name": name,
        "email": (body.email or "").strip().lower() or None,
        "initials": initials,
        "roles": roles,
        "streams": body.streams,
        "skills": body.skills,
    })


@router.delete("/{person_id}/access")
async def remove_access(person_id: str, caller: Caller = Depends(current_caller)):
    """Clear someone's roles and overrides — they keep their history but see 'pending access'."""
    require(caller.access, "users_roles", "edit")
    if person_id == caller.id:
        raise HTTPException(status_code=400, detail="You can't remove your own access.")
    person = await db.select_one("people", {"id": f"eq.{person_id}", "select": "name,roles"})
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    _guard_locked_role(caller, person.get("roles") or [], [])
    if LOCKED_ROLE in (person.get("roles") or []) and await _last_admin(person_id):
        raise HTTPException(status_code=400, detail=f"{person['name']} is the last {LOCKED_ROLE}.")
    await db.update("people", {"id": f"eq.{person_id}"}, {"roles": []})
    await db.delete("access_person_overrides", {"person_id": f"eq.{person_id}"})
    return {"ok": True}


@roles_router.get("/access")
async def role_access(caller: Caller = Depends(current_caller)):
    require(caller.access, "users_roles", "view")
    role_overrides, _ = await _overrides()
    return {
        "roles": [
            {"role": r, "matrix": resolve_role_access(r, role_overrides),
             "default": ROLE_ACCESS_DEFAULTS.get(r, {}), "tuned": r in role_overrides}
            for r in ROLES
        ]
    }


@roles_router.put("/access")
async def set_role_access(body: RoleMatrix, caller: Caller = Depends(current_caller)):
    require(caller.access, "users_roles", "edit")
    if body.role == LOCKED_ROLE:
        raise HTTPException(status_code=400, detail=f"{LOCKED_ROLE} always has full access.")
    _valid_roles([body.role])
    role_overrides, _ = await _overrides()
    # Otherwise you could raise a role you hold — or could give yourself — to full access.
    _no_escalation(caller, {**resolve_role_access(body.role), **_valid_matrix(body.matrix)},
                   resolve_role_access(body.role, role_overrides), f"the {body.role} role")
    await db.insert("access_role_overrides", {"role": body.role, "matrix": body.matrix}, upsert_on="role")
    return {"ok": True}


class RoleName(BaseModel):
    role: str


@roles_router.post("/access/reset")
async def reset_role_access(body: RoleName, caller: Caller = Depends(current_caller)):
    """A POST with the role in the body: role names contain a slash, and URLs get logged."""
    require(caller.access, "users_roles", "edit")
    _valid_roles([body.role])
    role_overrides, _ = await _overrides()
    _no_escalation(caller, resolve_role_access(body.role),
                   resolve_role_access(body.role, role_overrides), f"the {body.role} role")
    await db.delete("access_role_overrides", {"role": f"eq.{body.role}"})
    return {"ok": True}


async def person_detail(person_id: str, caller: Caller) -> dict:
    person = await db.select_one("people", {"id": f"eq.{person_id}", "select": PERSON_FIELDS})
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    role_overrides, person_overrides = await _overrides()
    person["accessOverride"] = person_overrides.get(person_id)
    person["access"] = resolve_person_access(person.get("roles") or [], person["accessOverride"], role_overrides)
    return person
