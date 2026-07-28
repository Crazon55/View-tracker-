"""Team role helpers — deprecated roles, departed members, DB cleanup."""

DEPRECATED_ROLES = frozenset({"ops_manager", "content_creators"})
# Deprecated roles that should become another role (not be dropped).
ROLE_MIGRATIONS: dict[str, str] = {
    "content_creators": "cs",
    "experiment-x": "experiment_x",
    "experimentx": "experiment_x",
}
# Do NOT auto-delete people on startup/deploy. That wiped live role assignments
# (e.g. pranesh.*) every time the backend restarted. Departures are handled manually.
REMOVED_PEOPLE: frozenset[str] = frozenset()


def parse_role_list(role: str) -> list[str]:
    return [r.strip() for r in (role or "").split(",") if r.strip()]


def migrate_role_list(role: str) -> list[str]:
    """Strip removed roles and migrate retired roles (e.g. content_creators → cs)."""
    out: list[str] = []
    seen: set[str] = set()
    for r in parse_role_list(role):
        if r in DEPRECATED_ROLES:
            replacement = ROLE_MIGRATIONS.get(r)
            if replacement and replacement not in seen:
                seen.add(replacement)
                out.append(replacement)
            continue
        if r not in seen:
            seen.add(r)
            out.append(r)
    return out


def sanitize_role_string(role: str) -> str:
    return ",".join(migrate_role_list(role))


def is_removed_person(email: str, name: str) -> bool:
    if not REMOVED_PEOPLE:
        return False
    hay = f"{email} {name}".lower()
    return any(p in hay for p in REMOVED_PEOPLE)


def role_contains_deprecated(role: str) -> bool:
    return bool(parse_role_list(role) & DEPRECATED_ROLES)


def cleanup_team_roles(client) -> dict:
    """Migrate/strip deprecated roles in user_roles. Does not delete people."""
    rows = client.table("user_roles").select("email,name,role").execute().data or []
    removed: list[str] = []
    updated: list[str] = []

    for row in rows:
        email = (row.get("email") or "").strip().lower()
        role = row.get("role") or ""

        # Intentional: never auto-delete by REMOVED_PEOPLE — that destroyed real assignments.

        clean = sanitize_role_string(role)
        if clean == role:
            continue

        if not clean:
            # Role string was only deprecated tokens with no migration — leave as pending rather than delete.
            client.table("user_roles").update({"role": "pending"}).eq("email", email).execute()
            updated.append(email)
        else:
            client.table("user_roles").update({"role": clean}).eq("email", email).execute()
            updated.append(email)

    return {"removed": removed, "updated": updated}


def cleanup_content_strategists(client) -> dict:
    """No-op people purge. Keep roster intact across deploys."""
    return {"removed": []}
