"""Export the snoboard data FSOS keeps into one idempotent SQL import for the FSOS project.

Reads the OLD snoboard Supabase project (read-only) and writes out/fsos_import.sql,
to be run in the NEW project's SQL editor after the migrations in supabase/migrations/.
Every statement upserts on legacy ids, so the file can be re-run (e.g. again on cutover day).

    python supabase/import/export_from_snoboard.py

Credentials come from the snoboard backend .env (SUPABASE_URL / SUPABASE_KEY) unless
OLD_SUPABASE_URL / OLD_SUPABASE_KEY are set. The output contains staff emails and is
git-ignored — never commit it.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
BACKEND = REPO / "snoboard-backend-feature-frontseat" / "snoboard-backend-feature-frontseat"
OUT = HERE / "out" / "fsos_import.sql"

# ── Decisions agreed for the FSOS cutover ────────────────────────────────────
# snoboard role → FSOS role. Seeding roles (BD / fulfillment) have no FSOS
# equivalent: those people come across with no role (pending access).
ROLE_MAP = {
    "admin": "Founder/Admin",
    "boss_man": "COA",
    "ai_automations": "COA",
    "senior_cs": "Short-form Lead",
    "cs": "CS",
    "content_creators": "CS",
    "ve": "Editor",
    "editors": "Editor",
    "video_editor": "Editor",
    "carousel_designer": "Designer",
    "design": "Designer",
    "co": "COC",
    "content_ops_intern": "COC",
    "content_operator": "COC",
    "experiment_x": "COC",
}

# 6-Day Tracker groups (from snoboard SixDayTracker.tsx). Pages in these groups are
# active; every other page is imported paused.
TRACKER_GROUPS = {
    "tech": ["101xtechnology", "ai.cracked"],
    "bizz_playbook": ["indiabusinesscom", "indiafounderscore", "indianfoundersco", "indiastartupstory"],
    "bizz": ["bizzindia"],
    "x101": ["101xfounders"],
    "news": ["thechangingorder", "indiahappeningnow"],
    "founders": ["foundersinindia", "foundersindex", "startupcoded"],
}
GROUP_OF = {h: g for g, hs in TRACKER_GROUPS.items() for h in hs}

# FSOS role defaults — keep in sync with fsos-frontend/src/domain/access.js.
AREAS = ["command_room", "bo_studio", "hpn_desk", "production", "distribution", "performance",
         "news", "pintu", "six_day", "growth", "users_roles", "settings"]
WS = {"command_room": "edit", "bo_studio": "edit", "hpn_desk": "edit", "production": "edit", "distribution": "edit", "performance": "edit"}


def _m(**levels):
    return {a: levels.get(a, "none") for a in AREAS}


ROLE_DEFAULTS = {
    "Founder/Admin": {a: "edit" for a in AREAS},
    "COA": {a: "edit" for a in AREAS},
    "Short-form Lead": _m(**WS, news="edit", pintu="view", six_day="edit", growth="view"),
    "CS": _m(command_room="edit", bo_studio="edit", hpn_desk="edit", production="edit", performance="edit",
             news="edit", pintu="view", six_day="view", growth="view"),
    "Designer": _m(production="edit", pintu="view", growth="view"),
    "Editor": _m(production="edit", pintu="view", growth="view"),
    "COC": _m(command_room="edit", distribution="edit", performance="edit",
              news="view", six_day="edit", growth="view"),
}
RANK = {"none": 0, "view": 1, "edit": 2}

# snoboard per-person area → FSOS area(s). Seeding / canvas / other playbooks don't exist in FSOS.
AREA_MAP = {
    "production": ["production"], "news": ["news"], "pintu": ["pintu"],
    "six_day": ["six_day"], "growth": ["growth"], "users_roles": ["users_roles"],
    "idea_engine": ["bo_studio", "hpn_desk"], "playbook_bpb": ["distribution"],
}

PALETTE = ["#9F1239", "#2563EB", "#0D9488", "#D97706", "#4F46E5", "#059669", "#7C3AED", "#C2410C", "#1D4ED8", "#BE185D"]


# ── Old project access ───────────────────────────────────────────────────────
def load_env():
    env = {}
    p = BACKEND / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    url = os.environ.get("OLD_SUPABASE_URL") or env.get("SUPABASE_URL")
    key = os.environ.get("OLD_SUPABASE_KEY") or env.get("SUPABASE_KEY")
    if not url or not key:
        sys.exit("Set OLD_SUPABASE_URL / OLD_SUPABASE_KEY (or fill the snoboard backend .env).")
    return url.rstrip("/"), key


def fetch_all(url, key, table, order="id"):
    rows, start, page = [], 0, 1000
    while True:
        q = f"{url}/rest/v1/{table}?select=*&order={urllib.parse.quote(order)}"
        req = urllib.request.Request(q, headers={"apikey": key, "Authorization": f"Bearer {key}", "Range": f"{start}-{start + page - 1}"})
        chunk = json.load(urllib.request.urlopen(req))
        rows += chunk
        if len(chunk) < page:
            return rows
        start += page


# ── SQL helpers ──────────────────────────────────────────────────────────────
def lit(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def arr(values):
    return "array[" + ", ".join(lit(v) for v in values) + "]::text[]" if values else "'{}'::text[]"


def js(v):
    return lit(json.dumps(v, ensure_ascii=False)) + "::jsonb"


def person_ref(email):
    return f"(select id from people where legacy_email = {lit(email.strip().lower())})" if email else "null"


def ip_ref(page_id):
    return f"(select id from ips where legacy_page_id = {lit(page_id)})"


def month_of(v):
    return str(v)[:7] + "-01"


# ── Translation ──────────────────────────────────────────────────────────────
def fsos_roles(role_str):
    out = []
    for raw in (role_str or "").split(","):
        r = ROLE_MAP.get(raw.strip().lower())
        if r and r not in out:
            out.append(r)
    return out


def role_matrix(roles):
    base = {a: "none" for a in AREAS}
    for r in roles:
        for a, lvl in ROLE_DEFAULTS[r].items():
            if RANK[lvl] > RANK[base[a]]:
                base[a] = lvl
    return base


def person_override(roles, old_matrix):
    """Only areas where the person's saved snoboard access differs from their FSOS role defaults."""
    if not roles or "Founder/Admin" in roles or not old_matrix:
        return None
    base = role_matrix(roles)
    wanted = {}
    for old_area, lvl in old_matrix.items():
        for a in AREA_MAP.get(old_area, []):
            if lvl in RANK and RANK[lvl] >= RANK.get(wanted.get(a, "none"), 0):
                wanted[a] = lvl
    diff = {a: lvl for a, lvl in wanted.items() if base[a] != lvl}
    return diff or None


def initials(name):
    parts = [p for p in name.replace(".", " ").split() if p]
    return ("".join(p[0] for p in parts[:2]) or "?").upper()


def main():
    url, key = load_env()
    print(f"Reading {url} …")
    users = fetch_all(url, key, "user_roles", "name")
    pages = fetch_all(url, key, "pages", "handle")
    entries = fetch_all(url, key, "six_day_entries")
    top = fetch_all(url, key, "six_day_top_content")
    growth = fetch_all(url, key, "growth_data")
    feedback = fetch_all(url, key, "news_feed_feedback")
    saved = fetch_all(url, key, "news_feed_saved")
    access_path = BACKEND / "app" / "user_access.json"
    person_access = json.loads(access_path.read_text(encoding="utf-8")) if access_path.exists() else {}
    person_access = {k.strip().lower(): v for k, v in person_access.items()}

    sql = ["-- FSOS import from snoboard. Generated by supabase/import/export_from_snoboard.py.",
           "-- Contains staff emails: do not commit. Safe to re-run.", "begin;", ""]

    # people
    sql.append("-- people")
    pending = []
    for i, u in enumerate(users):
        email = (u.get("email") or "").strip().lower()
        if not email:
            continue
        roles = fsos_roles(u.get("role"))
        if not roles:
            pending.append(u.get("name") or email)
        name = (u.get("name") or email.split("@")[0]).strip()
        sql.append(
            "insert into people (email, legacy_email, name, initials, color, roles, streams) values "
            f"({lit(email)}, {lit(email)}, {lit(name)}, {lit(initials(name))}, {lit(PALETTE[i % len(PALETTE)])}, {arr(roles)}, array['BO','HPN']::text[]) "
            "on conflict (legacy_email) do update set name = excluded.name, roles = excluded.roles;"
        )
    sql.append("")

    # per-person access overrides
    sql.append("-- per-person access (only where it differs from FSOS role defaults)")
    overrides = 0
    for u in users:
        email = (u.get("email") or "").strip().lower()
        ov = person_override(fsos_roles(u.get("role")), person_access.get(email))
        if ov:
            overrides += 1
            sql.append(f"insert into access_person_overrides (person_id, matrix) select {person_ref(email)}, {js(ov)} "
                       "on conflict (person_id) do update set matrix = excluded.matrix;")
    sql.append("")

    # IPs
    sql.append("-- IPs (all snoboard pages; pages outside the active 6-Day roster start paused)")
    active_count = 0
    for i, p in enumerate(pages):
        handle = (p.get("handle") or "").strip().lstrip("@")
        group = GROUP_OF.get(handle.lower())
        active = group is not None
        active_count += active
        code = handle or f"page-{str(p['id'])[:8]}"
        sql.append(
            "insert into ips (code, name, handle, hex, active, tracker_group, stage, legacy_page_id) values "
            f"({lit(code)}, {lit((p.get('name') or handle or code).strip())}, {lit(handle or None)}, {lit(PALETTE[i % len(PALETTE)])}, "
            f"{lit(active)}, {lit(group or 'none')}, {int(p.get('stage') or 1) if 1 <= int(p.get('stage') or 1) <= 3 else 1}, {lit(p['id'])}) "
            "on conflict (legacy_page_id) do update set name = excluded.name, handle = excluded.handle, stage = excluded.stage, "
            "active = excluded.active, tracker_group = excluded.tracker_group;"
        )
    sql.append("")

    # 6-day
    sql.append("-- 6-Day Tracker entries")
    for e in entries:
        if not e.get("page_id"):
            continue
        sql.append(
            "insert into six_day_entries (month, cycle, ip_id, views, reel_pct, post_pct, reel_perf, post_perf, filled_by, updated_at) "
            f"select {lit(month_of(e['month']))}, {int(e['cycle_number'])}, {ip_ref(e['page_id'])}, {int(e.get('views') or 0)}, "
            f"{lit(e.get('reel_pct'))}, {lit(e.get('post_pct'))}, {lit(e.get('reel_perf'))}, {lit(e.get('post_perf'))}, "
            f"{person_ref(e.get('filled_by'))}, {lit(e.get('filled_at') or e.get('created_at'))} "
            f"where {ip_ref(e['page_id'])} is not null "
            "on conflict (month, cycle, ip_id) do update set views = excluded.views, reel_pct = excluded.reel_pct, "
            "post_pct = excluded.post_pct, reel_perf = excluded.reel_perf, post_perf = excluded.post_perf;"
        )
    sql.append("")
    sql.append("-- 6-Day topline posts / reels")
    for t in top:
        if not t.get("page_id"):
            continue
        ctype = t.get("content_type") if t.get("content_type") in ("reel", "post") else "reel"
        sql.append(
            "insert into six_day_top_content (legacy_id, month, cycle, ip_id, link, views, content_type, created_at) "
            f"select {lit(t['id'])}, {lit(month_of(t['month']))}, {int(t['cycle_number'])}, {ip_ref(t['page_id'])}, {lit(t.get('link') or '')}, "
            f"{int(t.get('views') or 0)}, {lit(ctype)}, {lit(t.get('created_at'))} where {ip_ref(t['page_id'])} is not null "
            "on conflict (legacy_id) do update set link = excluded.link, views = excluded.views, content_type = excluded.content_type;"
        )
    sql.append("")

    # growth (skip the 'total' roll-up rows; FSOS sums per IP itself)
    sql.append("-- Growth: monthly views / followers per IP (months before 6-Day tracking)")
    handle_to_page = {(p.get("handle") or "").strip().lstrip("@").lower(): p["id"] for p in pages}
    growth_rows = 0
    for g in growth:
        pid = handle_to_page.get((g.get("handle") or "").strip().lstrip("@").lower())
        if not pid:
            continue
        growth_rows += 1
        sql.append(
            "insert into growth_monthly (month, ip_id, views, followers_gained) "
            f"select {lit(month_of(g['month']))}, {ip_ref(pid)}, {lit(g.get('views'))}, {int(g.get('followers_gained') or 0)} "
            "on conflict (month, ip_id) do update set views = excluded.views, followers_gained = excluded.followers_gained;"
        )
    sql.append("")

    # news
    sql.append("-- News feed votes and saved stories")
    for f in feedback:
        if f.get("vote") not in ("yes", "no") or not f.get("article_url"):
            continue
        sql.append(
            "insert into news_feedback (article_url, vote, article_title, article_type, updated_at) values "
            f"({lit(f['article_url'].strip())}, {lit(f['vote'])}, {lit(f.get('article_title'))}, {lit(f.get('article_type'))}, {lit(f.get('updated_at'))}) "
            "on conflict (article_url) do update set vote = excluded.vote;"
        )
    for s in saved:
        if not s.get("article_url"):
            continue
        sql.append(
            f"insert into news_saved (article_url, article_data, created_at) values ({lit(s['article_url'].strip())}, {js(s.get('article_data') or {})}, {lit(s.get('created_at'))}) "
            "on conflict (article_url) do nothing;"
        )
    sql += ["", "commit;", ""]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(sql), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(REPO)}")
    print(f"  people {len(users)} (pending access: {len(pending)}), person access overrides {overrides}")
    print(f"  IPs {len(pages)} ({active_count} active, {len(pages) - active_count} paused)")
    print(f"  6-Day entries {len(entries)}, topline {len(top)}, growth rows {growth_rows}")
    print(f"  news votes {len(feedback)}, saved {len(saved)}")


if __name__ == "__main__":
    main()
