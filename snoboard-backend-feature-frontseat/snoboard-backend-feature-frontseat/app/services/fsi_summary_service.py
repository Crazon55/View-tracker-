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
You receive a structured relational graph from a research canvas, including Frame groupings.

Analyze the study metadata, typed node payloads (JSON), directional connections (with optional edge notes), and the `frames` array.
Frame nodes are intentional groupings — treat each frame as a strategy section and synthesize what its child nodes imply together.
Nodes with `inside_frame` belong to that frame; ungrouped nodes are canvas-level context.
Infer relationships from node type combinations, frame membership, and strategist notes (e.g. a Failed Post Example linked to a Hook Pattern suggests execution issues).

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


from app.services.fsi_graph_context import build_graph_context, graph_context_json


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
        + graph_context_json(study, nodes, connections)
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
