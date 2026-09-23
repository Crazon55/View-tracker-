"""Walks one idea through the whole FSOS workflow against the real FSOS project.

Creation → approval → production → review → calendar → publication → 24h capture,
plus comments, 6-Day, Growth and Settings. This is the test that answers "is it
actually being stored?", so it checks persistence three ways:

  1. the mutation's own response,
  2. a **fresh** `GET /api/workspace` — what a browser refresh would load — done
     repeatedly, because a value that survives one reload may still be coming from
     something cached,
  3. a direct PostgREST read that never touches the API, which is the only proof the
     row is in Postgres rather than in a process somewhere.

Run with the API on http://localhost:8000 and FSOS_DEV_LOGIN=true:
    python fsos-backend/tests/test_workflow_api.py          # cleans up after itself
    python fsos-backend/tests/test_workflow_api.py --keep   # leaves the walkthrough in the app

Everything it writes is removed on exit unless --keep is given.

Run one suite at a time. Both write to the real project and tidy up after themselves,
so two copies at once will each undo the other's setup and report failures that
aren't real.
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE = "http://localhost:8000"
KEEP = "--keep" in sys.argv
ENV = Path(__file__).resolve().parent.parent / ".env"
env = dict(l.split("=", 1) for l in ENV.read_text(encoding="utf-8").splitlines() if "=" in l and not l.startswith("#"))
SB_URL, SB_KEY = env["FSOS_SUPABASE_URL"].strip(), env["FSOS_SUPABASE_SERVICE_KEY"].strip()

passed, failed = 0, 0
MARK = "[fsos-selftest]"   # every row this test makes carries it, so cleanup can't miss one


def check(label, got, want):
    global passed, failed
    ok = got == want
    passed, failed = passed + ok, failed + (not ok)
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + ("" if ok else f"\n          got  {got!r}\n          want {want!r}"))


def truthy(label, got):
    global passed, failed
    ok = bool(got)
    passed, failed = passed + ok, failed + (not ok)
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + ("" if ok else f"   got {got!r}"))


def api(method, path, *, email, body=None):
    req = urllib.request.Request(f"{BASE}{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    req.add_header("X-FSOS-Dev-Email", email)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or "null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or "null")
        except ValueError:
            return e.code, None


def supabase(path, method="GET", body=None):
    """Straight to Postgres, with no help from the API."""
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
                 "Content-Type": "application/json", "Prefer": "return=representation"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        print(f"    (supabase {method} {path} → {e.code} {e.read()[:200]})")
        return None


def refresh(email):
    """What the browser gets on a hard reload."""
    status, ws = api("GET", "/api/workspace", email=email)
    assert status == 200, ws
    return ws


def find(rows, **kw):
    return next((r for r in rows if all(r.get(k) == v for k, v in kw.items())), None)


# ───────────────────────── cast ─────────────────────────

people = supabase("people?select=id,email,name,roles&order=name&limit=200")
ips = supabase("ips?select=id,code,name&active=is.true&order=code&limit=10")
overridden = {o["person_id"] for o in supabase("access_person_overrides?select=person_id")}
admin = next(p for p in people if "Founder/Admin" in (p["roles"] or []))
# An Editor with no personal override, so section 8 tests the Editor *role* rather than
# whatever access one person happened to be given. Several imported Editors carry
# overrides granting BO Studio and Distribution — real, and correctly honoured.
editor = next(p for p in people if p["roles"] == ["Editor"] and p["id"] not in overridden)
coc = next((p for p in people if p["roles"] == ["COC"]), admin)
A, E = admin["email"], editor["email"]
IP1, IP2 = ips[0], ips[1]
TODAY = datetime.now(timezone.utc).date().isoformat()
print(f"  (admin {admin['name']}, editor {editor['name']}, COC {coc['name']}, IPs {IP1['code']} + {IP2['code']})\n")

created = {"ideas": [], "publications": [], "batches": [], "categories": []}

# ───────────────────────── 1. create ─────────────────────────
print("1. Idea created and it survives a reload")

status, made = api("POST", "/api/ideas", email=A, body={
    "stream": "BO", "title": f"{MARK} Why unit economics beat GMV", "format": "Carousel",
    "category": "Founder lessons", "brief": {"sharedHook": "The number nobody shows you"},
    "destinations": [IP1["id"], IP2["id"]],
    "versionHooks": {IP1["id"]: {"hookOverride": "Hook tuned for " + IP1["code"]}},
})
check("created", status, 200)
idea_id = made["idea"]["id"]
created["ideas"].append(idea_id)
check("code allocated", made["idea"]["code"].startswith("BO-"), True)
check("BO starts pending approval", made["idea"]["approval"]["state"], "pending")
check("one version per destination", len(made["versions"]), 2)
v1 = find(made["versions"], ipId=IP1["id"])
v2 = find(made["versions"], ipId=IP2["id"])
check("per-IP hook stored", v1["hookOverride"], "Hook tuned for " + IP1["code"])

ws = refresh(A)
idea = find(ws["ideas"], id=idea_id)
truthy("idea present after reload #1", idea)
check("title survived", idea["title"], f"{MARK} Why unit economics beat GMV")
check("brief survived", idea["brief"]["sharedHook"], "The number nobody shows you")
check("destinations survived", sorted(idea["destinations"]), sorted([IP1["id"], IP2["id"]]))
check("creator recorded", idea["creatorId"], admin["id"])
truthy("creation logged to activity", find(ws["activity"], ideaId=idea_id, type="created"))

# ───────────────────────── 2. approval ─────────────────────────
print("\n2. Approval, and who approved it")

check("approve", api("POST", f"/api/ideas/{idea_id}/approve", email=A)[0], 200)
ws = refresh(A)
idea = find(ws["ideas"], id=idea_id)
check("approved after reload", idea["approval"]["state"], "approved")
check("approver recorded", idea["approval"]["by"], admin["id"])
truthy("approval timestamped", idea["approval"]["at"])

# ───────────────────────── 3. production ─────────────────────────
print("\n3. Production: one owner, assets, review round-trip")

check("assign", api("POST", "/api/production/assign", email=A, body={
    "ideaIds": [idea_id], "ownerId": editor["id"], "deadline": TODAY,
    "reviewerId": admin["id"]})[0], 200)
ws = refresh(A)
idea = find(ws["ideas"], id=idea_id)
check("owner stored", idea["productionOwnerId"], editor["id"])
check("deadline stored", idea["deadline"], TODAY)
check("assignment moved versions into production",
      {find(ws["versions"], id=v["id"])["reviewStatus"] for v in (v1, v2)}, {"in_production"})

# The editor does the work — proving a non-admin role can write.
check("editor adds a deliverable", api("POST", f"/api/versions/{v1['id']}/links", email=E, body={
    "type": "drive", "url": "https://drive.google.com/fsos-selftest-cut-01", "label": "Cut 01"})[0], 200)
check("editor writes the caption", api("PATCH", f"/api/versions/{v1['id']}", email=E, body={
    "caption": "Revenue is vanity. Margin is sanity."})[0], 200)

ws = refresh(E)
ver = find(ws["versions"], id=v1["id"])
check("link stored", len(ver["assetLinks"]), 1)
check("link url stored", ver["assetLinks"][0]["url"], "https://drive.google.com/fsos-selftest-cut-01")
check("caption stored", ver["caption"], "Revenue is vanity. Margin is sanity.")

check("submit for review", api("POST", f"/api/production/versions/{v1['id']}/submit", email=E, body={})[0], 200)
check("awaiting review after reload", find(refresh(A)["versions"], id=v1["id"])["reviewStatus"], "awaiting_review")

# An empty version can't be submitted — the rule, not just the UI.
check("nothing goes to review without an asset",
      api("POST", f"/api/production/versions/{v2['id']}/submit", email=E, body={})[0], 400)

check("request changes", api("POST", f"/api/production/versions/{v1['id']}/request-changes", email=A, body={
    "note": f"{MARK} Tighten the first three seconds."})[0], 200)
ws = refresh(A)
check("changes_requested stored", find(ws["versions"], id=v1["id"])["reviewStatus"], "changes_requested")
note = find(ws["comments"], versionId=v1["id"])
truthy("the reason was kept as a comment", note)
check("reason text stored", note["text"], f"{MARK} Tighten the first three seconds.")
truthy("owner was notified", find(refresh(E)["notifications"], type="changes_requested"))

check("resubmit", api("POST", f"/api/production/versions/{v1['id']}/submit", email=E, body={})[0], 200)
check("approve version", api("POST", f"/api/production/versions/{v1['id']}/approve", email=A)[0], 200)
check("ready after reload", find(refresh(A)["versions"], id=v1["id"])["reviewStatus"], "ready")

# ───────────────────────── 4. comments ─────────────────────────
print("\n4. Comments, replies, resolve")

status, c = api("POST", "/api/comments", email=A, body={
    "ideaId": idea_id, "anchor": {"type": "slide", "slideId": "s2"},
    "text": f"{MARK} Lead with the number on slide 2."})
check("comment created", status, 200)
cid = c["id"]
check("reply", api("POST", f"/api/comments/{cid}/replies", email=E, body={"text": f"{MARK} Reworking it."})[0], 200)
ws = refresh(A)
root = find(ws["comments"], id=cid)
truthy("comment present after reload", root)
check("anchor survived", root["anchor"]["slideId"], "s2")
check("reply nested under it", len(root["replies"]), 1)
check("reply text stored", root["replies"][0]["text"], f"{MARK} Reworking it.")
check("reply author stored", root["replies"][0]["authorId"], editor["id"])
check("resolve", api("POST", f"/api/comments/{cid}/resolve", email=A, body={"resolved": True})[0], 200)
check("resolved after reload", find(refresh(A)["comments"], id=cid)["resolved"], True)

# ───────────────────────── 5. distribution ─────────────────────────
print("\n5. Calendar, the repetition rule, and publication")

status, placed = api("POST", "/api/distribution/place", email=A, body={
    "versionId": v1["id"], "date": TODAY, "time": "09:15"})
check("placed", status, 200)
check("no conflict for the first one", placed["conflict"], None)
pl_id = placed["placement"]["id"]

ws = refresh(A)
pl = find(ws["placements"], id=pl_id)
truthy("placement present after reload", pl)
check("date stored", pl["date"], TODAY)
check("time stored", pl["time"], "09:15:00")
check("history recorded", pl["history"][0]["action"], "Placed")

# Second version of the SAME idea on the SAME day — the repetition rule should bite.
status, clash = api("POST", "/api/distribution/place", email=A, body={"versionId": v2["id"], "date": TODAY})
check("same-day repetition refused", clash["conflict"], "same_day_repetition")
check("and nothing was placed", clash["placement"], None)
check("still one placement after reload",
      len([p for p in refresh(A)["placements"] if p["versionId"] in (v1["id"], v2["id"])]), 1)

status, forced = api("POST", "/api/distribution/place", email=A, body={
    "versionId": v2["id"], "date": TODAY, "exception": True, "reason": f"{MARK} Deliberate collaboration"})
check("exception placement allowed", status, 200)
pl2_id = forced["placement"]["id"]
pl2 = find(refresh(A)["placements"], id=pl2_id)
check("exception reason stored", pl2["exceptionReason"], f"{MARK} Deliberate collaboration")
check("exception attributed", pl2["exceptionBy"], admin["id"])

published_at = (datetime.now(timezone.utc) - timedelta(hours=26)).isoformat()
status, pub = api("POST", "/api/distribution/publish", email=A, body={
    "versionId": v1["id"], "url": "https://instagram.com/p/fsos-selftest-01", "publishedAt": published_at})
check("published", status, 200)
pub_id = pub["publicationId"]
created["publications"].append(pub_id)

ws = refresh(A)
publication = find(ws["publications"], id=pub_id)
truthy("publication present after reload", publication)
check("url stored", publication["url"], "https://instagram.com/p/fsos-selftest-01")
check("version linked", publication["versionIds"], [v1["id"]])
check("IP linked", publication["ipIds"], [IP1["id"]])
check("placement confirmed", find(ws["placements"], id=pl_id)["state"], "confirmed")

# ───────────────────────── 6. performance ─────────────────────────
print("\n6. 24-hour capture — missing is not zero, and late is visibly late")

snap = find(refresh(A)["snapshots"], publicationId=pub_id)
truthy("capture window opened on publication", snap)
check("views start missing, not zero", snap["views"], None)
truthy("due 24h after publishing", snap["dueAt"])

measured = datetime.now(timezone.utc).isoformat()
check("capture", api("POST", f"/api/performance/publications/{pub_id}/capture", email=A, body={
    "views": 148_500, "measuredAt": measured})[0], 200)
ws = refresh(A)
snap = find(ws["snapshots"], publicationId=pub_id)
check("views stored", snap["views"], 148_500)
check("late capture shows its true age (26h, not 24)", snap["ageHours"], 26)
check("recorded by", snap["recordedBy"], admin["id"])

check("a capture can be cleared back to missing",
      api("POST", f"/api/performance/publications/{pub_id}/capture", email=A,
          body={"views": None, "measuredAt": measured})[0], 200)
check("back to missing, not zero", find(refresh(A)["snapshots"], publicationId=pub_id)["views"], None)
api("POST", f"/api/performance/publications/{pub_id}/capture", email=A,
    body={"views": 148_500, "measuredAt": measured})

# ───────────────────────── 7. the tools ─────────────────────────
print("\n7. 6-Day, Growth and Settings")

before_entry = supabase(f"six_day_entries?select=*&month=eq.2026-09-01&cycle=eq.4&ip_id=eq.{IP1['id']}")
before_growth = supabase(f"growth_monthly?select=*&month=eq.2026-09-01&ip_id=eq.{IP1['id']}")
before_settings = (supabase("app_settings?select=settings&id=eq.true") or [{}])[0].get("settings") or {}

check("6-Day entry upserted", api("PUT", "/api/six-day/entries", email=A, body={
    "month": "2026-09", "cycle": 4, "ipId": IP1["id"], "views": 999_111, "reelPct": 61})[0], 200)
ws = refresh(A)
entry = find(ws["sixDay"]["entries"], month="2026-09", cycle=4, ipId=IP1["id"])
truthy("6-Day entry present after reload", entry)
check("views stored", entry["views"], 999_111)
check("reel split stored", entry["reelPct"], 61)

check("upsert again doesn't duplicate", api("PUT", "/api/six-day/entries", email=A, body={
    "month": "2026-09", "cycle": 4, "ipId": IP1["id"], "views": 999_222})[0], 200)
again = [e for e in refresh(A)["sixDay"]["entries"] if (e["month"], e["cycle"], e["ipId"]) == ("2026-09", 4, IP1["id"])]
check("still exactly one row", len(again), 1)
check("and it has the new number", again[0]["views"], 999_222)

check("followers stored", api("PUT", "/api/growth/followers", email=A, body={
    "month": "2026-09", "ipId": IP1["id"], "followersGained": 4242})[0], 200)
g = find(refresh(A)["growth"]["followers"], month="2026-09", ipId=IP1["id"])
check("followers survived reload", g["followersGained"], 4242)

status, cat = api("POST", "/api/categories", email=A, body={"name": f"{MARK} Test category", "stream": "BO"})
check("category created", status, 200)
created["categories"].append(cat["id"])
truthy("category after reload", find(refresh(A)["categories"], id=cat["id"]))

check("settings merged", api("PATCH", "/api/settings", email=A, body={
    "settings": {"thresholds": {"good": 120, "average": 60}}})[0], 200)
check("threshold survived reload", refresh(A)["settings"]["thresholds"]["good"], 120)

# ───────────────────────── 8. access is enforced ─────────────────────────
print("\n8. The API refuses what the UI hides")

check("an Editor cannot approve a BO idea", api("POST", f"/api/ideas/{idea_id}/approve", email=E)[0], 403)
check("an Editor cannot place on the calendar",
      api("POST", "/api/distribution/place", email=E, body={"versionId": v2["id"], "date": TODAY})[0], 403)
check("an Editor cannot edit Settings",
      api("PATCH", "/api/settings", email=E, body={"settings": {"x": 1}})[0], 403)
STRANGER = "fsos-selftest-stranger@owledmedia.com"
check("an unknown person gets nothing", api("GET", "/api/workspace", email=STRANGER)[0], 403)
# That request just created them: an unrecognised sign-in becomes a pending person,
# which is the point of it. Clean up, or every run adds another row to the team list.
for row in supabase(f"people?select=id&email=eq.{urllib.parse.quote(STRANGER)}") or []:
    supabase(f"people?id=eq.{row['id']}", method="DELETE")
check("the stranger row was cleaned up",
      supabase(f"people?select=id&email=eq.{urllib.parse.quote(STRANGER)}"), [])

# ───────────────────────── 9. it is really in Postgres ─────────────────────────
print("\n9. Multiple refreshes, then a read that bypasses the API entirely")

seen = []
for n in range(1, 4):
    ws = refresh(A)
    i = find(ws["ideas"], id=idea_id)
    v = find(ws["versions"], id=v1["id"])
    s = find(ws["snapshots"], publicationId=pub_id)
    seen.append((i["approval"]["state"], i["productionOwnerId"], v["reviewStatus"],
                 v["caption"], s["views"], len(find(ws["comments"], id=cid)["replies"])))
check("three consecutive reloads are identical", len(set(seen)), 1)
check("and they say what we wrote", seen[0],
      ("approved", editor["id"], "ready", "Revenue is vanity. Margin is sanity.", 148_500, 1))

row = supabase(f"ideas?select=*&id=eq.{idea_id}")[0]
check("[postgres] idea row exists", row["id"], idea_id)
check("[postgres] approval_state", row["approval_state"], "approved")
check("[postgres] production_owner_id", row["production_owner_id"], editor["id"])
check("[postgres] brief jsonb kept its shape", row["brief"]["sharedHook"], "The number nobody shows you")
vrow = supabase(f"versions?select=*&id=eq.{v1['id']}")[0]
check("[postgres] review_status", vrow["review_status"], "ready")
check("[postgres] caption", vrow["caption"], "Revenue is vanity. Margin is sanity.")
check("[postgres] asset_links jsonb", vrow["asset_links"][0]["url"], "https://drive.google.com/fsos-selftest-cut-01")
srow = supabase(f"snapshots?select=*&publication_id=eq.{pub_id}")[0]
check("[postgres] views", srow["views"], 148_500)
check("[postgres] age_hours", srow["age_hours"], 26)
prow = supabase(f"placements?select=*&id=eq.{pl_id}")[0]
check("[postgres] placement state", prow["state"], "confirmed")
check("[postgres] sort_order is the UI's `order`", prow["sort_order"], 1)

# ───────────────────────── cleanup ─────────────────────────
if KEEP:
    print(f"\n--keep: left idea {idea_id} in the database. Delete it from Settings or re-run without --keep.")
else:
    print("\ncleanup")
    for pid in created["publications"]:
        supabase(f"publications?id=eq.{pid}", method="DELETE")      # snapshots cascade
    for iid in created["ideas"]:
        supabase(f"ideas?id=eq.{iid}", method="DELETE")             # versions/placements/comments/activity cascade
    for cid_ in created["categories"]:
        supabase(f"categories?id=eq.{cid_}", method="DELETE")
    for bid in created["batches"]:
        supabase(f"batches?id=eq.{bid}", method="DELETE")

    # Put the tool rows back exactly as they were.
    if before_entry:
        supabase("six_day_entries?on_conflict=month,cycle,ip_id", method="POST", body=before_entry[0])
    else:
        supabase(f"six_day_entries?month=eq.2026-09-01&cycle=eq.4&ip_id=eq.{IP1['id']}", method="DELETE")
    if before_growth:
        supabase("growth_monthly?on_conflict=month,ip_id", method="POST", body=before_growth[0])
    else:
        supabase(f"growth_monthly?month=eq.2026-09-01&ip_id=eq.{IP1['id']}", method="DELETE")
    supabase("app_settings?id=eq.true", method="PATCH", body={"settings": before_settings})

    check("idea gone", supabase(f"ideas?select=id&id=eq.{idea_id}"), [])
    check("its versions went with it", supabase(f"versions?select=id&idea_id=eq.{idea_id}"), [])
    check("its comments went with it", supabase(f"comments?select=id&idea_id=eq.{idea_id}"), [])
    check("publication gone", supabase(f"publications?select=id&id=eq.{pub_id}"), [])
    check("snapshot went with it", supabase(f"snapshots?select=id&publication_id=eq.{pub_id}"), [])
    leftovers = supabase(f"ideas?select=id&title=like.*{urllib.parse.quote(MARK)}*")
    check("nothing left carrying the test marker", leftovers, [])
    check("settings put back",
          (supabase("app_settings?select=settings&id=eq.true") or [{}])[0].get("settings") or {},
          before_settings)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
