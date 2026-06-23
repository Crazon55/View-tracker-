"""FSI Canvas — context-aware study summary via Claude."""

import json
import logging
from typing import Any

import anthropic

from app.config import get_settings

logger = logging.getLogger(__name__)

SUMMARY_SECTIONS = [
    "core_strategy_synthesis",
    "quantified_performance_multipliers",
    "systematized_hook_architecture",
    "screen_layout_typography_patterns",
    "reusable_formula_array",
    "operational_guardrails",
    "discovered_analytical_gaps",
]

SYSTEM_PROMPT = """You are Frontseat Intelligence (FSI), a content strategy analyst.
You receive a structured relational graph from a research canvas — NOT spatial layout or freeform text boxes.

Analyze the study metadata, typed node payloads (JSON), and directional connections (with optional edge notes).
Infer relationships from node type combinations and strategist notes (e.g. a Failed Post Example linked to a Hook Pattern suggests execution issues).

Respond with ONLY valid JSON matching this exact structure:
{
  "core_strategy_synthesis": "string — overarching strategic narrative",
  "quantified_performance_multipliers": ["string — each quantified insight"],
  "systematized_hook_architecture": ["string — hook patterns and rules"],
  "screen_layout_typography_patterns": ["string — visual/layout patterns"],
  "reusable_formula_array": ["string — repeatable content formulas"],
  "operational_guardrails": ["string — warnings and rules to follow"],
  "discovered_analytical_gaps": ["string — missing data or open questions"]
}

Be specific, actionable, and grounded in the provided node data. Use markdown inside string values where helpful."""


def build_graph_context(study: dict, nodes: list[dict], connections: list[dict]) -> dict[str, Any]:
    node_by_id = {n["id"]: n for n in nodes}
    enriched_connections = []
    for c in connections:
        src = node_by_id.get(c["source_node_id"], {})
        tgt = node_by_id.get(c["target_node_id"], {})
        enriched_connections.append({
            "source_node_id": c["source_node_id"],
            "source_type": src.get("node_type"),
            "source_title": src.get("display_title"),
            "target_node_id": c["target_node_id"],
            "target_type": tgt.get("node_type"),
            "target_title": tgt.get("display_title"),
            "edge_label_note": c.get("edge_label_note"),
        })
    return {
        "study": study,
        "nodes": [
            {
                "id": n["id"],
                "node_type": n["node_type"],
                "display_title": n["display_title"],
                "structured_payload": n.get("structured_payload") or {},
                "raw_body_text": n.get("raw_body_text"),
                "tags": n.get("tags") or [],
            }
            for n in nodes
        ],
        "connections": enriched_connections,
    }


def _parse_json_response(raw_text: str) -> dict[str, Any]:
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        start = raw_text.find("{")
        end = raw_text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(raw_text[start:end])
        raise


async def generate_study_summary(study: dict, nodes: list[dict], connections: list[dict]) -> dict[str, Any]:
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise ValueError("Anthropic API key not configured")

    graph = build_graph_context(study, nodes, connections)
    user_content = (
        "Generate the FSI strategy blueprint JSON for this study graph:\n\n"
        + json.dumps(graph, indent=2, default=str)
    )

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )
    except Exception as e:
        logger.error("FSI summary Claude API error: %s", e)
        raise

    raw_text = response.content[0].text
    result = _parse_json_response(raw_text)

    for key in SUMMARY_SECTIONS:
        if key not in result:
            result[key] = [] if key != "core_strategy_synthesis" else ""

    return result
