"""Copy an FSOS project into another FSOS project.

Written to move the database from Seoul to Mumbai. Supabase can't change a project's
region, so the move is: make a new project in the region you want, run the migrations in
`supabase/migrations/` on it, then run this to carry the rows across.

Both ends have the same schema, so this is a straight copy — no mapping, unlike
`export_from_snoboard.py`, which had to translate one shape into another.

    python supabase/migrate_region.py --check     # counts on both sides, changes nothing
    python supabase/migrate_region.py             # copy
    python supabase/migrate_region.py --force     # copy even if the target has rows

Reads both projects from the environment, so no key is ever typed on a command line:

    FSOS_SUPABASE_URL / FSOS_SUPABASE_SERVICE_KEY            the source (fsos-backend/.env)
    FSOS_TARGET_URL   / FSOS_TARGET_SERVICE_KEY              the new project

Re-running is safe: every table is upserted on its primary key, so a half-finished run
is fixed by running it again.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / "fsos-backend" / ".env")

SRC_URL = (os.getenv("FSOS_SUPABASE_URL") or "").rstrip("/")
SRC_KEY = os.getenv("FSOS_SUPABASE_SERVICE_KEY") or ""
DST_URL = (os.getenv("FSOS_TARGET_URL") or "").rstrip("/")
DST_KEY = os.getenv("FSOS_TARGET_SERVICE_KEY") or ""

# Parents before children: every foreign key must already point at something.
# The second value is what to upsert on — the table's primary key.
TABLES = [
    ("people", "id"),
    ("ips", "id"),
    ("categories", "id"),
    ("app_settings", "id"),
    ("batches", "id"),
    ("ideas", "id"),
    ("versions", "id"),
    ("placements", "id"),
    ("publications", "id"),
    ("publication_versions", "publication_id,version_id"),
    ("snapshots", "id"),
    ("comments", "id"),                       # roots before replies; see below
    ("activity", "id"),
    ("notifications", "id"),
    ("six_day_entries", "id"),
    ("six_day_top_content", "id"),
    ("six_day_actuals", "month,ip_id"),
    ("growth_monthly", "month,ip_id"),
    ("news_articles", "id"),
    ("news_feedback", "article_url"),
    ("news_rules", "category"),
    ("news_saved", "article_url"),
    ("access_role_overrides", "role"),
    ("access_person_overrides", "person_id"),
]

CHUNK = 500


def rest(url, key, path, method="GET", body=None, prefer=None):
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(f"{url}/rest/v1/{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        detail = e.read()[:400].decode(errors="replace")
        raise SystemExit(f"\n{method} {path} failed on {url.split('//')[1].split('.')[0]}:\n  {e.code} {detail}")


def fetch(url, key, table, order_by):
    """Everything in a table, paged — PostgREST caps a response at 1000 rows.

    Paging without an explicit order is how you silently skip or duplicate rows, so
    every table is ordered by its primary key, which by definition it has.
    """
    rows, offset = [], 0
    while True:
        page = rest(url, key, f"{table}?select=*&limit=1000&offset={offset}&order={order_by}") or []
        rows.extend(page)
        if len(page) < 1000:
            return rows
        offset += 1000


def preflight():
    missing = [n for n, v in (("FSOS_SUPABASE_URL", SRC_URL), ("FSOS_SUPABASE_SERVICE_KEY", SRC_KEY),
                              ("FSOS_TARGET_URL", DST_URL), ("FSOS_TARGET_SERVICE_KEY", DST_KEY)) if not v]
    if missing:
        raise SystemExit(
            "Missing: " + ", ".join(missing) + "\n\n"
            "Put the new project's values in fsos-backend/.env as FSOS_TARGET_URL and\n"
            "FSOS_TARGET_SERVICE_KEY, or export them for this shell.")
    if SRC_URL == DST_URL:
        raise SystemExit("Source and target are the same project. Nothing to do.")


def counts(url, key):
    out = {}
    for table, conflict in TABLES:
        out[table] = len(fetch(url, key, table, conflict.split(",")[0]))
    return out


def main():
    preflight()
    src_name = SRC_URL.split("//")[1].split(".")[0]
    dst_name = DST_URL.split("//")[1].split(".")[0]
    print(f"  source: {src_name}\n  target: {dst_name}\n")

    if "--check" in sys.argv:
        s, d = counts(SRC_URL, SRC_KEY), counts(DST_URL, DST_KEY)
        print(f"  {'table':26} {'source':>8} {'target':>8}")
        for table, _ in TABLES:
            if s[table] or d[table]:
                flag = "" if s[table] == d[table] else "   <-- differs"
                print(f"  {table:26} {s[table]:>8} {d[table]:>8}{flag}")
        print(f"\n  {'TOTAL':26} {sum(s.values()):>8} {sum(d.values()):>8}")
        return

    existing = sum(counts(DST_URL, DST_KEY).values())
    if existing and "--force" not in sys.argv:
        raise SystemExit(f"The target already holds {existing} rows. Re-run with --force to upsert over them.")

    moved = 0
    for table, conflict in TABLES:
        rows = fetch(SRC_URL, SRC_KEY, table, conflict.split(",")[0])
        if not rows:
            continue

        if table == "people":
            # auth.users is per-project, so those ids mean nothing in the new one. People
            # are matched by email on first sign-in and re-linked then.
            for r in rows:
                r["auth_user_id"] = None
        if table == "comments":
            # A reply points at its parent, so parents have to land first.
            rows.sort(key=lambda r: (r.get("parent_id") is not None, r.get("created_at") or ""))

        for i in range(0, len(rows), CHUNK):
            rest(DST_URL, DST_KEY, f"{table}?on_conflict={conflict}", "POST", rows[i:i + CHUNK],
                 prefer="resolution=merge-duplicates,return=minimal")
        print(f"  {table:26} {len(rows):>6} copied")
        moved += len(rows)

    print(f"\n  {moved} rows copied. Verifying…\n")
    s, d = counts(SRC_URL, SRC_KEY), counts(DST_URL, DST_KEY)
    bad = [t for t, _ in TABLES if s[t] != d[t]]
    for table, _ in TABLES:
        if s[table] or d[table]:
            print(f"  {table:26} {s[table]:>6} -> {d[table]:>6}{'   MISMATCH' if table in bad else ''}")
    if bad:
        raise SystemExit(f"\n  {len(bad)} table(s) don't match. Re-run with --force.")
    print("\n  Every table matches. The new project is a copy of the old one.")


if __name__ == "__main__":
    main()
