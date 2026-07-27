"""Shared graph serialization for FSI AI (summary + chat)."""

from __future__ import annotations

import json
import re
from typing import Any

# UI-only keys — drop from AI context (they don't carry strategy content).
_UI_ONLY_PAYLOAD_KEYS = frozenset(
    {
        "ui_expanded",
        "hook_expanded",
        "performance_expanded",
        "link_expanded",
        "card_width",
        "card_height",
        "frame_width",
        "frame_height",
    }
)

_EDGE_META_RE = re.compile(r"^\[\[fsi:\{.*?\}\]\](?:\n([\s\S]*))?$", re.DOTALL)


def _is_frame_node(node: dict) -> bool:
    payload = node.get("structured_payload") or {}
    return payload.get("is_frame") is True or node.get("node_type") == "Frame"


def _clean_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    out: dict[str, Any] = {}
    for k, v in payload.items():
        if k in _UI_ONLY_PAYLOAD_KEYS:
            continue
        if v is None or v == "" or v == []:
            continue
        # Blob URLs aren't useful to the model (and expire).
        if isinstance(v, str) and v.startswith("blob:"):
            continue
        if k in ("image_url", "url") and isinstance(v, str) and v.startswith("blob:"):
            continue
        if k == "screenshots" and isinstance(v, list):
            urls = [u for u in v if isinstance(u, str) and u and not u.startswith("blob:")]
            if urls:
                out[k] = urls
            continue
        out[k] = v
    return out


def _user_edge_label(note: Any) -> str | None:
    if not isinstance(note, str) or not note.strip():
        return None
    m = _EDGE_META_RE.match(note.strip())
    if m:
        label = (m.group(1) or "").strip()
        return label or None
    return note.strip()


def _text_preview(text: Any, limit: int = 240) -> str | None:
    if not isinstance(text, str):
        return None
    cleaned = " ".join(text.split())
    if not cleaned:
        return None
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1] + "…"


def _content_brief(node: dict) -> dict[str, Any]:
    """Compact, always-visible summary so the model can't skip body/metrics."""
    payload = _clean_payload(node.get("structured_payload") or {})
    brief: dict[str, Any] = {
        "id": node.get("id"),
        "node_type": node.get("node_type"),
        "display_title": node.get("display_title") or None,
    }
    body = _text_preview(node.get("raw_body_text"), 400)
    if body:
        brief["body"] = body

    # Surface common content fields explicitly.
    for key in (
        "url",
        "image_url",
        "views",
        "likes",
        "comments",
        "shares",
        "saves",
        "reach",
        "impressions",
        "hook_kind",
        "slides_content",
    ):
        if key in payload and payload[key] not in (None, "", []):
            brief[key] = payload[key]

    screenshots = payload.get("screenshots")
    if isinstance(screenshots, list) and screenshots:
        brief["screenshot_count"] = len(screenshots)
        brief["has_visual"] = True
    elif payload.get("image_url") or payload.get("is_screenshot"):
        brief["has_visual"] = True

    tags = node.get("tags") or []
    if tags:
        brief["tags"] = tags

    parent = node.get("parent_node_id")
    if parent:
        brief["parent_node_id"] = parent

    return brief


def _child_summary(node: dict) -> dict[str, Any]:
    return _content_brief(node)


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
    """Full canvas graph for Claude — every node field, connection, and frame grouping."""
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
        label = _user_edge_label(c.get("edge_label_note"))
        entry: dict[str, Any] = {
            "id": c.get("id"),
            "source_node_id": c.get("source_node_id"),
            "source_type": src.get("node_type"),
            "source_title": src.get("display_title"),
            "source_handle": c.get("source_handle"),
            "target_node_id": c.get("target_node_id"),
            "target_type": tgt.get("node_type"),
            "target_title": tgt.get("display_title"),
            "target_handle": c.get("target_handle"),
        }
        if label:
            entry["edge_label"] = label
        enriched_connections.append(entry)

    serialized_nodes: list[dict[str, Any]] = []
    content_index: list[dict[str, Any]] = []
    for n in nodes:
        parent_id = n.get("parent_node_id")
        inside_frame: dict[str, Any] | None = None
        if parent_id and parent_id in frame_ids:
            parent = node_by_id.get(parent_id, {})
            inside_frame = {
                "frame_id": parent_id,
                "frame_title": parent.get("display_title"),
            }

        payload = _clean_payload(n.get("structured_payload") or {})
        entry: dict[str, Any] = {
            "id": n.get("id"),
            "node_type": n.get("node_type"),
            "display_title": n.get("display_title"),
            "canvas_x": n.get("canvas_x"),
            "canvas_y": n.get("canvas_y"),
            "parent_node_id": parent_id,
            "structured_payload": payload,
            "raw_body_text": n.get("raw_body_text"),
            "tags": n.get("tags") or [],
        }
        if inside_frame:
            entry["inside_frame"] = inside_frame
        if _is_frame_node(n):
            entry["is_frame"] = True
        serialized_nodes.append(entry)
        if not _is_frame_node(n):
            content_index.append(_content_brief(n))

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
            "content_node_count": len(content_index),
            "nodes_by_type": type_counts,
        },
        # Read this first — every content node's title/body/metrics/urls in one list.
        "content_index": content_index,
        "frames": frames,
        "nodes": serialized_nodes,
        "connections": enriched_connections,
        "notes_for_model": [
            "content_index lists every non-frame node with body text and key fields — use it before answering.",
            "nodes[] has the full structured_payload for each node — cross-check ids from content_index.",
            "You cannot see screenshot/image pixels; only URLs are available. Do not invent visual details.",
            "Empty display_title/body means the user has not filled that field yet.",
        ],
    }


def graph_context_json(study: dict, nodes: list[dict], connections: list[dict]) -> str:
    return json.dumps(build_graph_context(study, nodes, connections), indent=2, default=str)
