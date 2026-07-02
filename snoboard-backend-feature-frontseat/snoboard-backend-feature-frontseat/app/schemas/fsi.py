"""Pydantic schemas for FSI Canvas Lite."""

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field


STUDY_TYPES = [
    "Whiteboard",  # keep in sync with migrations/fsi_schema_sync.sql
    "Page Study",
    "Carousel Study",
    "Hook Study",
    "Visual Pattern Study",
    "Competitor Study",
    "Client Narrative Study",
    "New Page Strategy",
]

NODE_TYPES = [
    "Page Name",
    "Content Pillar",
    "Content Bucket",
    "Visual",
    "Visual Hook",
    "Written Hook",
    "Carousel Body",
    "Performance",
    "Link",
    "Sticky Note",
    "Frame",
    "Page",
    "Niche",
    "Post Example",
    "Carousel Example",
    "Reel Example",
    "Hook Pattern",
    "Hook Example",
    "Visual Pattern",
    "Topic Pattern",
    "Audience Insight",
    "Strategy Rule",
    "Warning / What To Avoid",
    "Repeatable Formula",
    "Client Narrative Angle",
    "Strategist Note",
    "Performance Insight",
]

IRON_PROTOTYPE_NODE_TYPES = frozenset({
    "Post Example",
    "Hook Pattern",
    "Content Bucket",
    "Strategist Note",
})

PERFORMANCE_LABELS = frozenset({
    "Viral", "Strong", "Above Average", "Average", "Below Average", "Failed", "Experimental",
})


class StudyCreate(BaseModel):
    id: str | None = None
    title: str = Field(..., max_length=255)
    study_type: str
    target_account: str = Field(..., max_length=255)
    niche_vertical: str = Field(..., max_length=255)
    owner_id: str | None = None
    execution_date: date | None = None
    meta_notes: str | None = None


class StudyUpdate(BaseModel):
    title: str | None = Field(None, max_length=255)
    study_type: str | None = None
    target_account: str | None = Field(None, max_length=255)
    niche_vertical: str | None = Field(None, max_length=255)
    owner_id: str | None = None
    execution_date: date | None = None
    meta_notes: str | None = None
    status: str | None = None


class NodeCreate(BaseModel):
    id: str | None = None
    parent_node_id: str | None = None
    node_type: str
    display_title: str = Field(..., max_length=255)
    canvas_x: float
    canvas_y: float
    structured_payload: dict[str, Any] = Field(default_factory=dict)
    raw_body_text: str | None = None
    tags: list[str] | None = None


class NodeUpdate(BaseModel):
    parent_node_id: str | None = None
    node_type: str | None = None
    display_title: str | None = Field(None, max_length=255)
    canvas_x: float | None = None
    canvas_y: float | None = None
    structured_payload: dict[str, Any] | None = None
    raw_body_text: str | None = None
    tags: list[str] | None = None


class ConnectionCreate(BaseModel):
    id: str | None = None
    source_node_id: str
    target_node_id: str
    edge_label_note: str | None = None
    source_handle: str | None = Field(None, max_length=32)
    target_handle: str | None = Field(None, max_length=32)


class ConnectionUpdate(BaseModel):
    edge_label_note: str | None = None


class FsiGraphSnapshot(BaseModel):
    """Live canvas graph from the client — preferred over DB when provided."""

    study: dict[str, Any] | None = None
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    connections: list[dict[str, Any]] = Field(default_factory=list)


class FsiChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=12000)


class FsiChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    history: list[FsiChatMessage] = Field(default_factory=list, max_length=32)
    graph_snapshot: FsiGraphSnapshot | None = None


class FsiSummaryRequest(BaseModel):
    graph_snapshot: FsiGraphSnapshot | None = None
