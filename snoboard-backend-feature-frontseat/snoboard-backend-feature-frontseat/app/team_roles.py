"""Team role helpers — deprecated roles, departed members, DB cleanup."""

DEPRECATED_ROLES = frozenset({"ops_manager"})
REMOVED_PEOPLE = frozenset({"pranesh", "samiksha"})


def parse_role_list(role: str) -> list[str]:
    return [r.strip() for r in (role or "").split(",") if r.strip()]


def sanitize_role_string(role: str) -> str:
    return ",".join(r for r in parse_role_list(role) if r not in DEPRECATED_ROLES)


def is_removed_person(email: str, name: str) -> bool:
    hay = f"{email} {name}".lower()
    return any(p in hay for p in REMOVED_PEOPLE)


def role_contains_deprecated(role: str) -> bool:
    return bool(parse_role_list(role) & DEPRECATED_ROLES)


def cleanup_team_roles(client) -> dict:
    """Remove departed members and strip/delete deprecated roles from user_roles."""
    rows = client.table("user_roles").select("email,name,role").execute().data or []
    removed: list[str] = []
    updated: list[str] = []

    for row in rows:
        email = (row.get("email") or "").strip().lower()
        name = row.get("name") or ""
        role = row.get("role") or ""

        if is_removed_person(email, name):
            client.table("user_roles").delete().eq("email", email).execute()
            removed.append(email)
            continue

        clean = sanitize_role_string(role)
        if clean == role:
            continue

        if not clean:
            client.table("user_roles").delete().eq("email", email).execute()
            removed.append(email)
        else:
            client.table("user_roles").update({"role": clean}).eq("email", email).execute()
            updated.append(email)

    return {"removed": removed, "updated": updated}


def cleanup_content_strategists(client) -> dict:
    """Remove departed members from content_strategists roster."""
    rows = client.table("content_strategists").select("id,name").execute().data or []
    removed: list[str] = []
    for row in rows:
        name = row.get("name") or ""
        if any(p in name.lower() for p in REMOVED_PEOPLE):
            client.table("content_strategists").delete().eq("id", row["id"]).execute()
            removed.append(name)
    return {"removed": removed}
