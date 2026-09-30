"""Settings is admins-only. Pure access rules: no database, safe to run any time."""
from app.access import AREAS, resolve_person_access, resolve_role_access

ADMINS = {"Founder/Admin", "COA"}
ROLES = ["Founder/Admin", "COA", "Short-form Lead", "CS", "Designer", "Editor", "COC"]


def test_only_admin_roles_get_settings_by_default():
    for role in ROLES:
        assert resolve_role_access(role, {})["settings"] == ("edit" if role in ADMINS else "none")


def test_role_override_cannot_grant_or_remove_settings():
    overrides = {"Designer": {"settings": "view"}, "Editor": {"settings": "edit"}, "COA": {"settings": "none"}}
    assert resolve_role_access("Designer", overrides)["settings"] == "none"
    assert resolve_role_access("Editor", overrides)["settings"] == "none"
    assert resolve_role_access("COA", overrides)["settings"] == "edit"


def test_person_override_cannot_grant_settings():
    for level in ("view", "edit"):
        assert resolve_person_access(["Designer"], {"settings": level}, {})["settings"] == "none"
        assert resolve_person_access(["CS", "Short-form Lead"], {"settings": level}, {})["settings"] == "none"


def test_admin_role_keeps_settings_and_other_areas_follow_overrides():
    assert resolve_person_access(["Designer", "COA"], {"settings": "none"}, {})["settings"] == "edit"
    assert resolve_person_access(["Designer"], {"news": "edit", "settings": "edit"}, {})["news"] == "edit"
    assert set(resolve_person_access(["Designer"], None, {})) == set(AREAS)
