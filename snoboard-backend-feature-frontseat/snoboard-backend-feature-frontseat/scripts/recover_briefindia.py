"""One-off: inspect TheBriefIndia study for recovery options."""
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

studies = (
    client.table("studies")
    .select("id,title,study_type,status,updated_at,created_at")
    .ilike("title", "%BriefIndia%")
    .execute()
    .data
    or []
)
print("STUDIES:", json.dumps(studies, indent=2, default=str))

for s in studies:
    sid = s["id"]
    nodes = (
        client.table("nodes")
        .select("id,node_type,display_title,canvas_x,canvas_y,parent_node_id,created_at,structured_payload,raw_body_text")
        .eq("study_id", sid)
        .execute()
        .data
        or []
    )
    conns = (
        client.table("connections")
        .select("*")
        .eq("study_id", sid)
        .execute()
        .data
        or []
    )
    print(f"\nStudy {s['title']} ({sid}): {len(nodes)} nodes, {len(conns)} connections")
    for n in nodes:
        print(f"  {n.get('node_type'):20} {str(n.get('display_title') or '')[:40]:40} {n.get('id')[:8]}")

    for table in ("study_summaries", "fsi_chat_messages", "chat_messages"):
        try:
            rows = (
                client.table(table)
                .select("*")
                .eq("study_id", sid)
                .order("created_at", desc=True)
                .limit(3)
                .execute()
                .data
                or []
            )
            print(f"  {table}: {len(rows)} rows")
            for row in rows:
                keys = list(row.keys())
                print(f"    keys={keys}")
                for k in ("summary_json", "graph_snapshot", "message", "content", "payload"):
                    if k in row and row[k]:
                        val = row[k]
                        if isinstance(val, str) and len(val) > 200:
                            print(f"    {k}: {val[:200]}...")
                        elif isinstance(val, dict):
                            print(f"    {k} keys: {list(val.keys())[:20]}")
        except Exception as e:
            print(f"  {table}: skip ({e})")

# dump full current graph for restore script
    out = Path(__file__).resolve().parent / "briefindia_current.json"
    out.write_text(json.dumps({"study": s, "nodes": nodes, "connections": conns}, indent=2, default=str), encoding="utf-8")
    print(f"  wrote {out}")

# Recent deletes: nodes for this study_id in connections pointing to missing nodes?
sid = studies[0]["id"] if studies else None
if sid:
    all_conns = client.table("connections").select("*").eq("study_id", sid).execute().data or []
    node_ids = {n["id"] for n in (client.table("nodes").select("id").eq("study_id", sid).execute().data or [])}
    for c in all_conns:
        if c["source_node_id"] not in node_ids or c["target_node_id"] not in node_ids:
            print("dangling conn", c)

# Any nodes created today across all studies (maybe duplicated study?)
from datetime import datetime, timezone
today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
recent = (
    client.table("nodes")
    .select("id,study_id,node_type,display_title,created_at,structured_payload")
    .gte("created_at", today)
    .order("created_at", desc=True)
    .limit(100)
    .execute()
    .data
    or []
)
print(f"\nNodes created since {today}: {len(recent)}")
by_study: dict[str, int] = {}
for n in recent:
    by_study[n["study_id"]] = by_study.get(n["study_id"], 0) + 1
print(" by study:", by_study)

# List all studies
all_studies = client.table("studies").select("id,title,updated_at").order("updated_at", desc=True).limit(20).execute().data or []
print("\nRecent studies:")
for st in all_studies:
    cnt = client.table("nodes").select("id", count="exact").eq("study_id", st["id"]).execute().count
    print(f"  {st['title'][:40]:40} nodes={cnt} updated={st['updated_at']}")
