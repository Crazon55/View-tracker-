"""FSI Canvas — conversational AI about a study graph."""

import json
import logging

import anthropic

from app.config import get_settings
from app.services.fsi_summary_service import build_graph_context

logger = logging.getLogger(__name__)

CHAT_SYSTEM = """You are Frontseat Intelligence (FSI), a content strategy analyst embedded in a research canvas.
The user is building a typed node graph (Visual, Hooks, Performance, etc.) with connections — not a spatial whiteboard.

You receive the full study graph as JSON context. Answer questions clearly and concisely.
Reference specific node types, titles, and connections when relevant.
Use markdown sparingly (bold, bullet lists). Do not invent data that is not in the graph."""


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

    graph = build_graph_context(study, nodes, connections)
    graph_block = json.dumps(graph, indent=2, default=str)

    api_messages: list[dict] = []
    if not history:
        api_messages.append(
            {
                "role": "user",
                "content": (
                    "Here is the current study graph. Use it as ground truth for all answers:\n\n"
                    f"{graph_block}"
                ),
            }
        )
        api_messages.append(
            {
                "role": "assistant",
                "content": "I've loaded your study graph. Ask me about strategy, hooks, patterns, or gaps.",
            }
        )

    for item in history[-16:]:
        role = item.get("role")
        content = item.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            api_messages.append({"role": role, "content": content.strip()})

    api_messages.append({"role": "user", "content": message.strip()})

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            system=CHAT_SYSTEM,
            messages=api_messages,
        )
    except Exception as e:
        logger.error("FSI chat Claude API error: %s", e)
        raise

    return response.content[0].text
