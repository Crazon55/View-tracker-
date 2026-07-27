"""FSI Canvas — conversational AI about a study graph."""

import logging

import anthropic

from app.config import get_settings
from app.services.fsi_graph_context import graph_context_json

logger = logging.getLogger(__name__)

CHAT_SYSTEM = """You are Frontseat Intelligence (FSI), a content strategy analyst embedded in a research canvas.
The user builds a typed node graph (Visual, Visual Hook, Written Hook, Performance / Post Details, Link, Content Pillar, Sticky Note, Frame, etc.) with directed connections.

You ALWAYS receive the complete current canvas graph as JSON below. That graph is the ONLY source of truth for what is on the board.

## How to read the graph (mandatory)
1. Start with `stats` and `content_index` — `content_index` is a complete inventory of every non-frame node (titles, body text, metrics, URLs, visuals flags).
2. Then use `nodes[]` for full `structured_payload` detail when you need every field.
3. Use `connections[]` for relationships (`edge_label`, source/target titles + types).
4. Use `frames[]` for groupings; each frame's `children` already include body/metrics previews.

## Completeness rules (critical)
- You must NOT invent nodes, metrics, hooks, or posts that are absent from the JSON.
- You must NOT ignore nodes that exist in `content_index` / `nodes[]`. If asked what's on the canvas, cover ALL content nodes (or explicitly say you are summarizing after listing counts by type).
- Empty `display_title` / missing `body` means the field is blank on the canvas — say so; do not invent copy.
- Screenshot / Visual nodes only provide image URLs — you cannot see pixels. Never fabricate what an image looks like.
- Prefer citing concrete titles, body snippets, metrics, and link URLs from the JSON.

## Frames
Frame nodes are Miro-style regions that group related content.
- Nodes with `inside_frame` / `parent_node_id` belong in that frame.
- Ungrouped nodes sit on the open canvas.

## Style
Use markdown sparingly (bold, short bullets). Be concise but complete — missing an existing node is worse than being slightly longer."""


async def chat_about_study(
    study: dict,
    nodes: list[dict],
    connections: list[dict],
    message: str,
    history: list[dict],
) -> str:
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise ValueError("Anthropic API key not configured")

    graph_block = graph_context_json(study, nodes, connections)
    system = (
        f"{CHAT_SYSTEM}\n\n"
        "## CURRENT CANVAS GRAPH (complete snapshot — use for every answer)\n"
        f"```json\n{graph_block}\n```"
    )

    api_messages: list[dict] = []
    for item in history[-20:]:
        role = item.get("role")
        content = item.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            api_messages.append({"role": role, "content": content.strip()})

    api_messages.append({"role": "user", "content": message.strip()})

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            system=system,
            messages=api_messages,
        )
    except Exception as e:
        logger.error("FSI chat Claude API error: %s", e)
        raise

    return response.content[0].text
