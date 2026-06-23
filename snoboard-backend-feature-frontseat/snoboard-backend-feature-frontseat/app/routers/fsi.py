"""FSI Canvas Lite API routes."""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_auth
from app.database.client import get_supabase_client
from app.schemas.fsi import (
    STUDY_TYPES,
    NODE_TYPES,
    StudyCreate,
    StudyUpdate,
    NodeCreate,
    NodeUpdate,
    ConnectionCreate,
)

router = APIRouter(tags=["fsi"])


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
    existing = _get_node(client, node_id)
    study_id = existing["study_id"]
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
        "created_by": _email(claims),
    }
    client.table("connections").insert(row).execute()
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


@router.delete("/connections/{connection_id}")
async def delete_connection(connection_id: str, claims: dict = Depends(require_auth)):
    client = get_supabase_client()
    rows = client.table("connections").select("*").eq("id", connection_id).limit(1).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Connection not found")
    study_id = rows[0]["study_id"]
    client.table("connections").delete().eq("id", connection_id).execute()
    client.table("studies").update({"updated_at": _now_iso()}).eq("id", study_id).execute()
    return {"success": True, "data": {"id": connection_id}}
