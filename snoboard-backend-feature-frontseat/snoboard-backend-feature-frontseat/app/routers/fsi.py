"""FSI Canvas Lite API routes."""

import json
import re
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth import require_auth
from app.database.client import get_supabase_client
from app.services.cloudinary_sign import build_signed_upload
from app.schemas.fsi import (
    STUDY_TYPES,
    NODE_TYPES,
    StudyCreate,
    StudyUpdate,
    NodeCreate,
    NodeUpdate,
    ConnectionCreate,
    ConnectionUpdate,
    FsiChatRequest,
    FsiGraphSnapshot,
    FsiSummaryRequest,
    FsiYoutubeResearchRequest,
)

router = APIRouter(tags=["fsi"])

FSI_HANDLE_META_RE = re.compile(r"^\[\[fsi:(\{.*?\})\]\](?:\n(.*))?$", re.DOTALL)


def _embed_handles_in_note(
    note: str | None, source_handle: str | None, target_handle: str | None
) -> str | None:
    if not source_handle and not target_handle:
        return note.strip() if note and note.strip() else None
    user_label = _user_visible_edge_label(note)
    meta = json.dumps({"sh": source_handle, "th": target_handle}, separators=(",", ":"))
    return f"[[fsi:{meta}]]\n{user_label}" if user_label else f"[[fsi:{meta}]]"


def _user_visible_edge_label(note: str | None) -> str | None:
    if not note or not note.strip():
        return None
    m = FSI_HANDLE_META_RE.match(note.strip())
    if m:
        tail = (m.group(2) or "").strip()
        return tail or None
    return note.strip()


def _missing_handle_columns(err: Exception) -> bool:
    s = str(err).lower()
    return "source_handle" in s or "target_handle" in s or "pgrst204" in s or "schema cache" in s


def _write_connection_row(client, row: dict, *, upsert: bool = False) -> None:
    try:
        if upsert:
            client.table("connections").upsert(row).execute()
        else:
            client.table("connections").insert(row).execute()
    except Exception as exc:
        if not _missing_handle_columns(exc):
            raise
        source_handle = row.pop("source_handle", None)
        target_handle = row.pop("target_handle", None)
        row["edge_label_note"] = _embed_handles_in_note(
            row.get("edge_label_note"), source_handle, target_handle
        )
        if upsert:
            client.table("connections").upsert(row).execute()
        else:
            client.table("connections").insert(row).execute()


def _email(claims: dict) -> str:
    return claims.get("email", "")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_study_type(study_type: str) -> None:
    if study_type not in STUDY_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid study_type. Must be one of: {STUDY_TYPES}")


def _validate_node_type(node_type: str) -> None:
    if node_type not in NODE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid node_type. Must be one of: {NODE_TYPES}")


def _get_study(client, study_id: str) -> dict:
    rows = client.table("studies").select("*").eq("id", study_id).limit(1).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Study not found")
    return rows[0]


def _get_node(client, node_id: str) -> dict:
    rows = client.table("nodes").select("*").eq("id", node_id).limit(1).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Node not found")
    return rows[0]


@router.get("/studies")
async def list_studies(status: str | None = None, claims: dict = Depends(require_auth)):
    client = get_supabase_client()
    q = client.table("studies").select("*").order("updated_at", desc=True)
    if status:
        q = q.eq("status", status)
    data = q.execute().data or []
    return {"success": True, "data": data}


@router.post("/studies")
async def create_study(req: StudyCreate, claims: dict = Depends(require_auth)):
    _validate_study_type(req.study_type)
    client = get_supabase_client()
    email = _email(claims)
    row = {
        "title": req.title.strip(),
        "study_type": req.study_type,
        "target_account": req.target_account.strip(),
        "niche_vertical": req.niche_vertical.strip(),
        "owner_id": (req.owner_id or email).strip(),
        "execution_date": str(req.execution_date or date.today()),
        "meta_notes": req.meta_notes,
        "status": "Draft",
    }
    if req.id:
        row["id"] = req.id.strip()
        client.table("studies").upsert(row).execute()
        created = _get_study(client, req.id.strip())
    else:
        client.table("studies").insert(row).execute()
        verify = (
            client.table("studies")
            .select("*")
            .eq("title", row["title"])
            .eq("owner_id", row["owner_id"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        created = verify[0] if verify else row
    return {"success": True, "data": created}


@router.get("/studies/{study_id}")
async def get_study_graph(study_id: str, claims: dict = Depends(require_auth)):
    client = get_supabase_client()
    study = _get_study(client, study_id)
    nodes = client.table("nodes").select("*").eq("study_id", study_id).execute().data or []
    connections = client.table("connections").select("*").eq("study_id", study_id).execute().data or []
    return {"success": True, "data": {"study": study, "nodes": nodes, "connections": connections}}


@router.patch("/studies/{study_id}")
async def update_study(study_id: str, req: StudyUpdate, claims: dict = Depends(require_auth)):
    client = get_supabase_client()
    _get_study(client, study_id)
    update_data = {k: v for k, v in req.model_dump().items() if v is not None}
    if "study_type" in update_data:
        _validate_study_type(update_data["study_type"])
    if "execution_date" in update_data:
        update_data["execution_date"] = str(update_data["execution_date"])
    if not update_data:
        return {"success": True, "data": _get_study(client, study_id)}
    update_data["updated_at"] = _now_iso()
    client.table("studies").update(update_data).eq("id", study_id).execute()
    return {"success": True, "data": _get_study(client, study_id)}


@router.delete("/studies/{study_id}")
async def delete_study(study_id: str, claims: dict = Depends(require_auth)):
    client = get_supabase_client()
    _get_study(client, study_id)
    client.table("studies").delete().eq("id", study_id).execute()
    return {"success": True, "data": {"id": study_id}}


@router.delete("/studies/{study_id}/graph")
async def clear_study_graph(study_id: str, claims: dict = Depends(require_auth)):
    client = get_supabase_client()
    _get_study(client, study_id)
    client.table("connections").delete().eq("study_id", study_id).execute()
    client.table("nodes").delete().eq("study_id", study_id).execute()
    client.table("studies").update({"updated_at": _now_iso()}).eq("id", study_id).execute()
    return {"success": True, "data": {"id": study_id}}


@router.post("/studies/{study_id}/nodes")
async def create_node(study_id: str, req: NodeCreate, claims: dict = Depends(require_auth)):
    _validate_node_type(req.node_type)
    client = get_supabase_client()
    _get_study(client, study_id)
    row = {
        "study_id": study_id,
        "node_type": req.node_type,
        "display_title": req.display_title.strip(),
        "canvas_x": req.canvas_x,
        "canvas_y": req.canvas_y,
        "structured_payload": req.structured_payload or {},
        "raw_body_text": req.raw_body_text,
        "tags": req.tags or [],
        "created_by": _email(claims),
    }
    if req.parent_node_id:
        row["parent_node_id"] = req.parent_node_id.strip()
    if req.id:
        row["id"] = req.id.strip()
        client.table("nodes").upsert(row).execute()
        created = _get_node(client, req.id.strip())
    else:
        client.table("nodes").insert(row).execute()
        verify = (
            client.table("nodes")
            .select("*")
            .eq("study_id", study_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        created = verify[0] if verify else row
    client.table("studies").update({"updated_at": _now_iso()}).eq("id", study_id).execute()
    return {"success": True, "data": created}


@router.patch("/nodes/{node_id}")
async def update_node(node_id: str, req: NodeUpdate, claims: dict = Depends(require_auth)):
    client = get_supabase_client()
    existing = _get_node(client, node_id)
    update_data = {k: v for k, v in req.model_dump().items() if v is not None}
    if "node_type" in update_data:
        _validate_node_type(update_data["node_type"])
    if not update_data:
        return {"success": True, "data": existing}
    update_data["updated_at"] = _now_iso()
    client.table("nodes").update(update_data).eq("id", node_id).execute()
    client.table("studies").update({"updated_at": _now_iso()}).eq("id", existing["study_id"]).execute()
    return {"success": True, "data": _get_node(client, node_id)}


@router.delete("/nodes/{node_id}")
async def delete_node(node_id: str, claims: dict = Depends(require_auth)):
    client = get_supabase_client()
    rows = client.table("nodes").select("study_id").eq("id", node_id).limit(1).execute().data or []
    if not rows:
        return {"success": True, "data": {"id": node_id}}
    study_id = rows[0]["study_id"]
    client.table("connections").delete().or_(
        f"source_node_id.eq.{node_id},target_node_id.eq.{node_id}"
    ).execute()
    client.table("nodes").delete().eq("id", node_id).execute()
    client.table("studies").update({"updated_at": _now_iso()}).eq("id", study_id).execute()
    return {"success": True, "data": {"id": node_id}}


@router.post("/studies/{study_id}/connections")
async def create_connection(study_id: str, req: ConnectionCreate, claims: dict = Depends(require_auth)):
    if req.source_node_id == req.target_node_id:
        raise HTTPException(status_code=400, detail="Self-loops are not allowed")
    client = get_supabase_client()
    _get_study(client, study_id)
    src = _get_node(client, req.source_node_id)
    tgt = _get_node(client, req.target_node_id)
    if src["study_id"] != study_id or tgt["study_id"] != study_id:
        raise HTTPException(status_code=400, detail="Both nodes must belong to this study")
    row = {
        "study_id": study_id,
        "source_node_id": req.source_node_id,
        "target_node_id": req.target_node_id,
        "edge_label_note": req.edge_label_note,
        "source_handle": req.source_handle,
        "target_handle": req.target_handle,
        "created_by": _email(claims),
    }
    if req.id:
        row["id"] = req.id.strip()
        _write_connection_row(client, row, upsert=True)
        rows = client.table("connections").select("*").eq("id", req.id.strip()).limit(1).execute().data or []
        created = rows[0] if rows else row
    else:
        _write_connection_row(client, row, upsert=False)
        verify = (
            client.table("connections")
            .select("*")
            .eq("study_id", study_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        created = verify[0] if verify else row
    client.table("studies").update({"updated_at": _now_iso()}).eq("id", study_id).execute()
    return {"success": True, "data": created}


@router.patch("/connections/{connection_id}")
async def update_connection(
    connection_id: str, req: ConnectionUpdate, claims: dict = Depends(require_auth)
):
    client = get_supabase_client()
    rows = client.table("connections").select("*").eq("id", connection_id).limit(1).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Connection not found")
    existing = rows[0]
    update_data = req.model_dump(exclude_unset=True)
    if not update_data:
        return {"success": True, "data": existing}
    client.table("connections").update(update_data).eq("id", connection_id).execute()
    study_id = existing["study_id"]
    client.table("studies").update({"updated_at": _now_iso()}).eq("id", study_id).execute()
    verify = client.table("connections").select("*").eq("id", connection_id).limit(1).execute().data or []
    return {"success": True, "data": verify[0] if verify else existing}


@router.delete("/connections/{connection_id}")
async def delete_connection(connection_id: str, claims: dict = Depends(require_auth)):
    client = get_supabase_client()
    rows = client.table("connections").select("study_id").eq("id", connection_id).limit(1).execute().data or []
    if not rows:
        return {"success": True, "data": {"id": connection_id}}
    study_id = rows[0]["study_id"]
    client.table("connections").delete().eq("id", connection_id).execute()
    client.table("studies").update({"updated_at": _now_iso()}).eq("id", study_id).execute()
    return {"success": True, "data": {"id": connection_id}}


@router.post("/studies/{study_id}/nodes/{node_id}/cloudinary-sign")
async def fsi_node_cloudinary_sign(
    study_id: str,
    node_id: str,
    request: Request,
    claims: dict = Depends(require_auth),
):
    """Signed upload params for FSI canvas node screenshots."""
    client = get_supabase_client()
    _get_study(client, study_id)
    node = _get_node(client, node_id)
    if node["study_id"] != study_id:
        raise HTTPException(status_code=400, detail="Node does not belong to this study")

    body = await request.json()
    uploader = str(body.get("uploader") or _email(claims) or "").strip()

    folder = f"fsi-canvas/{study_id}/{node_id}"
    tag_parts = [
        "fsi_canvas",
        f"fsi_study_{study_id}",
        f"fsi_node_{node_id}",
    ]
    if uploader:
        tag_parts.append(f"uploader_{uploader.split('@')[0]}")
    tags = ",".join(tag_parts)

    context_parts = [
        f"study_id={study_id}",
        f"node_id={node_id}",
    ]
    if uploader:
        context_parts.append(f"uploader={uploader}")
    context = "|".join(context_parts)

    signed = build_signed_upload(folder=folder, tags=tags, context=context, expires_days=30)
    return {"success": True, "data": signed}


def _resolve_study_graph(
    client,
    study_id: str,
    snapshot: FsiGraphSnapshot | None,
) -> tuple[dict, list[dict], list[dict]]:
    """Prefer live canvas snapshot from client (even if empty); fall back to Supabase."""
    study = _get_study(client, study_id)
    # Important: empty nodes=[] is a valid live canvas (user cleared it). Do not
    # treat it as missing and accidentally reload stale DB nodes.
    if snapshot is not None:
        merged_study = study if not snapshot.study else {**study, **snapshot.study}
        return merged_study, list(snapshot.nodes or []), list(snapshot.connections or [])
    nodes = client.table("nodes").select("*").eq("study_id", study_id).execute().data or []
    connections = client.table("connections").select("*").eq("study_id", study_id).execute().data or []
    return study, nodes, connections


@router.post("/studies/{study_id}/generate-summary")
async def generate_study_summary_route(
    study_id: str,
    req: FsiSummaryRequest = FsiSummaryRequest(),
    claims: dict = Depends(require_auth),
):
    """Generate an AI strategy summary from the study graph (Claude)."""
    from app.services.fsi_summary_service import generate_study_summary

    client = get_supabase_client()
    snapshot = req.graph_snapshot
    study, nodes, connections = _resolve_study_graph(client, study_id, snapshot)

    try:
        summary_json = await generate_study_summary(study, nodes, connections)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summary generation failed: {e}") from e

    client.table("study_summaries").insert({
        "study_id": study_id,
        "summary_json": summary_json,
        "created_by": _email(claims),
    }).execute()
    client.table("studies").update({"updated_at": _now_iso()}).eq("id", study_id).execute()
    return {"success": True, "data": summary_json}


@router.get("/studies/{study_id}/summary")
async def get_study_summary(study_id: str, claims: dict = Depends(require_auth)):
    """Latest saved AI summary for a study, or null."""
    client = get_supabase_client()
    _get_study(client, study_id)
    rows = (
        client.table("study_summaries")
        .select("summary_json, created_at")
        .eq("study_id", study_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return {"success": True, "data": None}
    return {"success": True, "data": rows[0]["summary_json"]}


@router.post("/studies/{study_id}/chat")
async def chat_study(study_id: str, req: FsiChatRequest, claims: dict = Depends(require_auth)):
    """Ask FSI about the current study graph (Claude)."""
    from app.services.fsi_chat_service import chat_about_study

    client = get_supabase_client()
    study, nodes, connections = _resolve_study_graph(client, study_id, req.graph_snapshot)

    try:
        result = await chat_about_study(
            study,
            nodes,
            connections,
            req.message,
            [m.model_dump() for m in req.history],
        )
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {e}") from e

    return {
        "success": True,
        "data": {
            "reply": result["reply"],
            "youtube_research": result.get("youtube_research") or {"ran": False},
            "context_stats": {
                "node_count": len(nodes),
                "connection_count": len(connections),
            },
        },
    }


@router.post("/studies/{study_id}/youtube-research")
async def youtube_research_route(
    study_id: str,
    req: FsiYoutubeResearchRequest,
    claims: dict = Depends(require_auth),
):
    """Explicit YouTube podcast research for a person/company name."""
    from app.services.youtube_podcast_research import research_podcasts

    client = get_supabase_client()
    _get_study(client, study_id)

    try:
        pack = await research_podcasts(req.query)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"YouTube research failed: {e}") from e

    return {"success": True, "data": pack}
