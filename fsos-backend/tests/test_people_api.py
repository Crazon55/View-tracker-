"""End-to-end checks for the Users & Roles API against the real FSOS project.

Run with the API on http://localhost:8000 and FSOS_DEV_LOGIN=true:
    python fsos-backend/tests/test_people_api.py

Every change it makes is undone before it exits.
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "http://localhost:8000"
ENV = Path(__file__).resolve().parent.parent / ".env"
env = dict(l.split("=", 1) for l in ENV.read_text(encoding="utf-8").splitlines() if "=" in l and not l.startswith("#"))
SB_URL, SB_KEY = env["FSOS_SUPABASE_URL"].strip(), env["FSOS_SUPABASE_SERVICE_KEY"].strip()

passed, failed = 0, 0


def check(label, got, want):
    global passed, failed
    ok = got == want
    passed, failed = passed + ok, failed + (not ok)
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + ("" if ok else f"   got {got!r}, want {want!r}"))


def api(method, path, *, email=None, body=None):
    req = urllib.request.Request(f"{BASE}{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if email:
        req.add_header("X-FSOS-Dev-Email", email)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or "null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or "null")
        except ValueError:
            return e.code, None


def supabase(path):
    req = urllib.request.Request(f"{SB_URL}/rest/v1/{path}", headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


people = supabase("people?select=id,email,name,roles&order=name&limit=200")
overridden = {o["person_id"] for o in supabase("access_person_overrides?select=person_id")}
admin = next(p for p in people if "Founder/Admin" in (p["roles"] or []))
# Pick people with no personal override, so the assertions below see the role defaults
# and the test never edits access that was imported from snoboard.
editor = next(p for p in people if p["roles"] == ["Editor"] and p["id"] not in overridden)
pending = next(p for p in people if not p["roles"] and p["id"] not in overridden)
A, E = admin["email"], editor["email"]
print(f"  (admin {admin['name']}, editor {editor['name']}, spare {pending['name']})")

print("auth")
check("no credentials -> 401", api("GET", "/api/me")[0], 401)
check("outside the allowed domain -> 403", api("GET", "/api/me", email="someone@gmail.com")[0], 403)
check("admin is not pending", api("GET", "/api/me", email=A)[1]["pending"], False)
check("person with no roles is pending", api("GET", "/api/me", email=pending["email"])[1]["pending"], True)

print("access gating")
check("editor cannot list people", api("GET", "/api/people", email=E)[0], 403)
status, listing = api("GET", "/api/people", email=A)
check("admin can list people", status, 200)
check("all 25 people returned", len(listing["people"]), len(people))
ed = next(p for p in listing["people"] if p["id"] == editor["id"])
check("editor's resolved access: production edit", ed["access"]["production"], "edit")
check("editor's resolved access: news none", ed["access"]["news"], "none")

print("editing a person")
status, updated = api("PATCH", f"/api/people/{pending['id']}", email=A, body={"roles": ["Editor"], "matrix": {"news": "view"}})
check("assign a role + override", status, 200)
check("role applied", updated["roles"], ["Editor"])
check("override applied", updated["access"]["news"], "view")
check("override recorded", updated["accessOverride"], {"news": "view"})
check("unknown role rejected", api("PATCH", f"/api/people/{pending['id']}", email=A, body={"roles": ["Wizard"]})[0], 400)
check("unknown area rejected", api("PATCH", f"/api/people/{pending['id']}", email=A, body={"matrix": {"nope": "edit"}})[0], 400)
check("self-lockout blocked", api("PATCH", f"/api/people/{admin['id']}", email=A,
                                  body={"roles": ["Editor"], "matrix": {"users_roles": "none"}})[0], 400)
check("editor cannot edit people", api("PATCH", f"/api/people/{pending['id']}", email=E, body={"roles": ["CS"]})[0], 403)

print("role defaults")
matrix = {**{a: "none" for a in listing["areas"]}, "production": "edit", "news": "edit", "tickets": "edit"}
check("set Designer defaults", api("PUT", "/api/roles/access", email=A, body={"role": "Designer", "matrix": matrix})[0], 200)
roles = {r["role"]: r for r in api("GET", "/api/roles/access", email=A)[1]["roles"]}
check("Designer tuned", roles["Designer"]["tuned"], True)
check("Designer news now edit", roles["Designer"]["matrix"]["news"], "edit")
check("Founder/Admin cannot be tuned",
      api("PUT", "/api/roles/access", email=A, body={"role": "Founder/Admin", "matrix": {}})[0], 400)
designer = next((p for p in supabase("people?select=id,roles") if p["roles"] == ["Designer"]), None)
if designer:
    d = next(p for p in api("GET", "/api/people", email=A)[1]["people"] if p["id"] == designer["id"])
    check("role override reaches its people", d["access"]["news"], "edit")

print("cleanup")
check("reset Designer", api("DELETE", f"/api/roles/access?role={urllib.parse.quote('Designer')}", email=A)[0], 200)
check("remove the test person's access", api("DELETE", f"/api/people/{pending['id']}/access", email=A)[0], 200)
after = api("GET", "/api/people", email=A)[1]["people"]
check("test person pending again", next(p for p in after if p["id"] == pending["id"])["roles"], [])
check("no leftover override", next(p for p in after if p["id"] == pending["id"])["accessOverride"], None)
if designer:
    d = next(p for p in after if p["id"] == designer["id"])
    check("Designer back to default (news none)", d["access"]["news"], "none")

# Always put the database back, even if an assertion above failed.
api("DELETE", f"/api/people/{pending['id']}/access", email=A)
api("DELETE", f"/api/roles/access?role={urllib.parse.quote('Designer')}", email=A)
check("no person overrides left behind", {o["person_id"] for o in supabase("access_person_overrides?select=person_id")}, overridden)
check("no role overrides left behind", supabase("access_role_overrides?select=role"), [])

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
