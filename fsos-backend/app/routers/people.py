"""Users & Roles: people, their roles, and per-person / per-role access overrides."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..access import AREAS, LEVELS, LOCKED_ROLE, ROLE_ACCESS_DEFAULTS, require, resolve_person_access, resolve_role_access
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


async def _overrides() -> tuple[dict, dict]:
    role_rows = await db.select("access_role_overrides", {"select": "role,matrix"})
    person_rows = await db.select("access_person_overrides", {"select": "person_id,matrix"})
    return ({r["role"]: r["matrix"] for r in role_rows}, {r["person_id"]: r["matrix"] for r in person_rows})


class PersonPatch(BaseModel):
    roles: list[str] | None = None
    matrix: dict[str, str] | None = None   # null clears the person's override
    clear_matrix: bool = False


class RoleMatrix(BaseModel):
    # Role travels in the body, not the path: "Founder/Admin" contains a slash.
    role: str
    matrix: dict[str, str] = Field(default_factory=dict)


class NewPerson(BaseModel):
    name: str
    email: str | None = None
    roles: list[str] = Field(default_factory=list)
    streams: list[str] = Field(default_factory=lambda: ["BO", "HPN"])


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

    roles = _valid_roles(patch.roles) if patch.roles is not None else (person.get("roles") or [])
    # Don't let the last admin — or yourself — lose the ability to manage access.
    if person_id == caller.id and LOCKED_ROLE not in roles:
        role_overrides, _ = await _overrides()
        effective = resolve_person_access(roles, _valid_matrix(patch.matrix) if patch.matrix else None, role_overrides)
        if effective.get("users_roles") != "edit":
            raise HTTPException(status_code=400, detail="That would remove your own access to Users & Roles.")

    if patch.roles is not None:
        await db.update("people", {"id": f"eq.{person_id}"}, {"roles": roles})
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
    initials = "".join(p[0] for p in name.replace(".", " ").split()[:2]).upper() or "?"
    return await db.insert("people", {
        "name": name,
        "email": (body.email or "").strip().lower() or None,
        "initials": initials,
        "roles": _valid_roles(body.roles),
        "streams": body.streams,
    })


@router.delete("/{person_id}/access")
async def remove_access(person_id: str, caller: Caller = Depends(current_caller)):
    """Clear someone's roles and overrides — they keep their history but see 'pending access'."""
    require(caller.access, "users_roles", "edit")
    if person_id == caller.id:
        raise HTTPException(status_code=400, detail="You can't remove your own access.")
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
    await db.insert("access_role_overrides", {"role": body.role, "matrix": _valid_matrix(body.matrix)}, upsert_on="role")
    return {"ok": True}


@roles_router.delete("/access")
async def reset_role_access(role: str, caller: Caller = Depends(current_caller)):
    """`role` is a query parameter — role names can contain a slash."""
    require(caller.access, "users_roles", "edit")
    _valid_roles([role])
    await db.delete("access_role_overrides", {"role": f"eq.{role}"})
    return {"ok": True}


async def person_detail(person_id: str, caller: Caller) -> dict:
    person = await db.select_one("people", {"id": f"eq.{person_id}", "select": PERSON_FIELDS})
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    role_overrides, person_overrides = await _overrides()
    person["accessOverride"] = person_overrides.get(person_id)
    person["access"] = resolve_person_access(person.get("roles") or [], person["accessOverride"], role_overrides)
    return person
