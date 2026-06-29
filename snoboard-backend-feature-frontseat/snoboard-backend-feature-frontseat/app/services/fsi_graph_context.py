"""Shared graph serialization for FSI AI (summary + chat)."""

from __future__ import annotations

import json
from typing import Any


def _is_frame_node(node: dict) -> bool:
    payload = node.get("structured_payload") or {}
    return payload.get("is_frame") is True or node.get("node_type") == "Frame"


def _child_summary(node: dict) -> dict[str, Any]:
    return {
        "id": node.get("id"),
        "node_type": node.get("node_type"),
        "display_title": node.get("display_title"),
    }


def _study_meta(study: dict) -> dict[str, Any]:
    keys = (
        "id",
        "title",
        "study_type",
        "target_account",
        "niche_vertical",
        "status",
        "meta_notes",
        "execution_date",
        "owner_id",
    )
    return {k: study.get(k) for k in keys if study.get(k) is not None}


def build_graph_context(study: dict, nodes: list[dict], connections: list[dict]) -> dict[str, Any]:
    """Full canvas graph for Claude — nodes, connections, and explicit frame groupings."""
    node_by_id = {n["id"]: n for n in nodes if n.get("id")}
    frame_ids = {nid for nid, n in node_by_id.items() if _is_frame_node(n)}

    frames: list[dict[str, Any]] = []
    for n in nodes:
        if not _is_frame_node(n):
            continue
        nid = n.get("id")
        payload = n.get("structured_payload") or {}
        child_nodes = [c for c in nodes if c.get("parent_node_id") == nid]
        frames.append(
            {
                "id": nid,
                "display_title": n.get("display_title"),
                "canvas_x": n.get("canvas_x"),
                "canvas_y": n.get("canvas_y"),
                "frame_width": payload.get("frame_width"),
                "frame_height": payload.get("frame_height"),
                "child_count": len(child_nodes),
                "children": [_child_summary(c) for c in child_nodes],
            }
        )

    enriched_connections: list[dict[str, Any]] = []
    for c in connections:
        src = node_by_id.get(c.get("source_node_id"), {})
        tgt = node_by_id.get(c.get("target_node_id"), {})
        enriched_connections.append(
            {
                "id": c.get("id"),
                "source_node_id": c.get("source_node_id"),
                "source_type": src.get("node_type"),
                "source_title": src.get("display_title"),
                "source_handle": c.get("source_handle"),
                "target_node_id": c.get("target_node_id"),
                "target_type": tgt.get("node_type"),
                "target_title": tgt.get("display_title"),
                "target_handle": c.get("target_handle"),
                "edge_label_note": c.get("edge_label_note"),
            }
        )

    serialized_nodes: list[dict[str, Any]] = []
    for n in nodes:
        parent_id = n.get("parent_node_id")
        inside_frame: dict[str, Any] | None = None
        if parent_id and parent_id in frame_ids:
            parent = node_by_id.get(parent_id, {})
            inside_frame = {
                "frame_id": parent_id,
                "frame_title": parent.get("display_title"),
            }

        entry: dict[str, Any] = {
            "id": n.get("id"),
            "node_type": n.get("node_type"),
            "display_title": n.get("display_title"),
            "canvas_x": n.get("canvas_x"),
            "canvas_y": n.get("canvas_y"),
            "parent_node_id": parent_id,
            "structured_payload": n.get("structured_payload") or {},
            "raw_body_text": n.get("raw_body_text"),
            "tags": n.get("tags") or [],
        }
        if inside_frame:
            entry["inside_frame"] = inside_frame
        if _is_frame_node(n):
            entry["is_frame"] = True
        serialized_nodes.append(entry)

    type_counts: dict[str, int] = {}
    for n in nodes:
        t = str(n.get("node_type") or "unknown")
        type_counts[t] = type_counts.get(t, 0) + 1

    return {
        "study": _study_meta(study),
        "stats": {
            "node_count": len(nodes),
            "connection_count": len(connections),
            "frame_count": len(frames),
            "nodes_by_type": type_counts,
        },
        "frames": frames,
        "nodes": serialized_nodes,
        "connections": enriched_connections,
    }


def graph_context_json(study: dict, nodes: list[dict], connections: list[dict]) -> str:
    return json.dumps(build_graph_context(study, nodes, connections), indent=2, default=str)
