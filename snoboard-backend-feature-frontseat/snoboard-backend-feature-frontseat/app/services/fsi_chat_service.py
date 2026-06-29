"""FSI Canvas — conversational AI about a study graph."""

import logging

import anthropic

from app.config import get_settings
from app.services.fsi_graph_context import graph_context_json

logger = logging.getLogger(__name__)

CHAT_SYSTEM = """You are Frontseat Intelligence (FSI), a content strategy analyst embedded in a research canvas.
The user builds a typed node graph (Visual, Visual Hook, Written Hook, Performance, Link, Sticky Note, Frame, etc.) with directed connections.

You ALWAYS receive the complete current canvas graph as JSON in your system instructions below.
That graph is authoritative ground truth — every node payload, body text, tag, position, and connection handle.

Rules:
- Answer using ONLY data present in the graph unless the user asks for general strategy advice clearly labeled as external.
- Cite specific node titles, types, payload fields, and connection paths.
- When asked what's on the canvas, enumerate nodes by type with their key fields.
- Use markdown sparingly (bold, bullet lists). Be concise but thorough."""


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
        "## CURRENT CANVAS GRAPH (full snapshot — use for every answer)\n"
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
