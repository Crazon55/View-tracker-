"""Write the posting cadence onto each IP.

The plan the team works to — how many posts and reels a page owes per day, and what goes
in each slot — lived in a doc outside FSOS. This puts it on the IP rows so the calendar
can count against it and the person filling a slot can see what it is meant to be.

Re-runnable: every IP named here is overwritten wholesale, and IPs not named are left
alone. Run it again after editing PLAN below.

    python supabase/seed_cadence.py            # writes
    python supabase/seed_cadence.py --check    # reads back, writes nothing

Needs `ips.menu` to be jsonb — see migrations/20260924180000_ip_menu_jsonb.sql. Against
the old text[] column the slots are silently stringified into something that still looks
like a list, so the script reads the column type up front and refuses before it writes
anything.

Credentials come from fsos-backend/.env, which is git-ignored. This talks to whichever
project that file points at, so check it before running.
"""
import json
import os
import sys
import urllib.request
import uuid
from pathlib import Path

ENV = Path(__file__).resolve().parent.parent / "fsos-backend" / ".env"

# Stream note from the team, kept here because the slot labels below assume it:
#   A-roll clips, case study, statement / fact static and proven BO are BO.
#   News is HPN.
# "Happening" has no category behind it yet; it is a slot type, not a taxonomy entry.
PLAN = {
    "foundersinindia": {
        "floors": {"posts": 3, "reels": 3},
        "ranges": {},
        "posts": [
            "Fact Static / Proven BO",
            "News Roundup / Happening (Collab with Xf)",
            "Happening / Case study (reel to carousel)",
            "Statement",
        ],
        "reels": ["A-roll Clip", "A-roll Clip / News", "A-roll Clip / News"],
    },
    "bizzindia": {
        "floors": {"posts": 7, "reels": 5},
        "ranges": {"posts": [7, 9], "reels": [5, 6]},
        "posts": [
            "Business News Roundup", "Fact Static", "Happening", "Happening", "Happening",
            "Proven BO", "Proven BO", "Happening", "Proven BO",
        ],
        "reels": [
            "A-roll Clip Info", "A-roll Clip Info", "Case study like SBD",
            "News / Happening", "News / Happening", "News / Happening",
        ],
    },
    "indianfoundersco": {
        "floors": {"posts": 3, "reels": 2},
        "ranges": {"posts": [3, 4], "reels": [2, 3]},
        "posts": ["Fact Static", "Proven BO / Happening", "Massive Happening", "Proven BO / Happening"],
        "reels": ["A-roll Clip", "News", "Case Study", "A-roll Clip", "News"],
    },
    # To be grown like BizzIndia / StartupByDoc.
    "indiabusinesscom": {
        "floors": {"posts": 4, "reels": 4},
        "ranges": {"posts": [4, 5], "reels": [4, 5]},
        "posts": ["Fact static", "Statement", "Proven BO / Happening", "Proven BO / Happening", "Happening"],
        "reels": [
            "A-roll Clip", "A-roll Clip", "A-roll Clip / Happening",
            "A-roll Clip / Happening", "Happening", "Case study Video",
        ],
    },
    "indiafounderscore": {
        "floors": {"posts": 0, "reels": 2},
        "ranges": {},
        "posts": [],
        "reels": ["A-roll Clip (Glow edit, amazing music)", "A-roll Clip (Glow edit, amazing music)"],
    },
    "101xfounders": {
        "floors": {"posts": 3, "reels": 4},
        "ranges": {"posts": [3, 5]},
        "posts": ["Statement / Proven BO", "Case Study / Proven BO", "Happening", "Happening", "Happening"],
        "reels": ["A-roll Clip", "News", "A-roll Clip", "News"],
    },
    "startupcoded": {
        "floors": {"posts": 3, "reels": 2},
        "ranges": {"reels": [2, 3]},
        "posts": [
            "News Roundup / Happening (Collab with Xf for startup-specific news worldwide)",
            "Proven BO / Happening",
            "Proven BO / Happening",
        ],
        "reels": ["A-roll Clip", "A-roll Clip", "A-roll Clip"],
    },
    # 5-7 reels/day until reels reach the 50k baseline. No slot breakdown was given, so
    # the plan is the count alone rather than invented slots.
    "indiahappeningnow": {
        "floors": {"posts": 0, "reels": 5},
        "ranges": {"reels": [5, 7]},
        "posts": [],
        "reels": [],
    },
}


def env():
    if not ENV.exists():
        sys.exit(f"{ENV} not found — this needs the backend's Supabase credentials.")
    out = {}
    for line in ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k] = v.strip()
    return out


def main():
    cfg = env()
    url = cfg["FSOS_SUPABASE_URL"].rstrip("/")
    key = cfg["FSOS_SUPABASE_SERVICE_KEY"]
    head = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    check_only = "--check" in sys.argv

    def call(method, path, body=None):
        req = urllib.request.Request(
            f"{url}/rest/v1/{path}", method=method, headers=head,
            data=json.dumps(body).encode() if body is not None else None,
        )
        raw = urllib.request.urlopen(req).read()
        return json.loads(raw) if raw else []

    print(f"project: {url}\n")

    # Check the column type before writing a single row. Against text[] every slot is
    # silently stringified into something that still looks like a list, so a write-then-
    # verify would leave real damage behind before it noticed.
    spec = urllib.request.Request(f"{url}/rest/v1/", headers={**head, "Accept": "application/openapi+json"})
    fmt = json.load(urllib.request.urlopen(spec))["definitions"]["ips"]["properties"]["menu"].get("format")
    if fmt != "jsonb":
        sys.exit(
            f"  ips.menu is {fmt}, not jsonb — slots would be stored as strings.\n"
            "  Run supabase/migrations/20260924180000_ip_menu_jsonb.sql first, then re-run this."
        )

    def slots(kind, labels):
        return [
            {"id": f"slot-{uuid.uuid4().hex[:7]}", "kind": kind,
             "options": [o.strip() for o in text.split("/") if o.strip()]}
            for text in labels
        ]

    for code, plan in PLAN.items():
        rows = call("GET", f"ips?code=eq.{code}&select=id,name")
        if not rows:
            print(f"  !! no IP with code {code} — skipped")
            continue
        ip_id = rows[0]["id"]
        menu = slots("post", plan["posts"]) + slots("reel", plan["reels"])

        if not check_only:
            call("PATCH", f"ips?id=eq.{ip_id}",
                 {"floors": plan["floors"], "ranges": plan["ranges"], "menu": menu})

        # Read back rather than trust the write: against a text[] column the slots come
        # back as strings, which is the one failure that would otherwise pass unnoticed.
        got = call("GET", f"ips?id=eq.{ip_id}&select=code,floors,ranges,menu")[0]
        stored = got["menu"] or []
        p = len([s for s in stored if s["kind"] == "post"])
        r = len([s for s in stored if s["kind"] == "reel"])
        print(f"  {code:<20} floors={got['floors']} ranges={got['ranges'] or '{}'}  slots: {p}P {r}R")

    print("\nread back from the database; nothing above is the write response.")


if __name__ == "__main__":
    main()
