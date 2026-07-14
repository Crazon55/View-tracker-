import type { FsiNodeRecord } from "./fsiNodeSchemas";

/** Node types offered on the whiteboard toolbar. */
export const WHITEBOARD_NODE_TYPES = [
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
] as const;

export type WhiteboardNodeType = (typeof WHITEBOARD_NODE_TYPES)[number];

export const WHITEBOARD_DEFAULT_STUDY_TYPE = "Whiteboard";

export {
  COMPACT_NODE_WIDTH,
  COMPACT_NODE_HEIGHT,
  LINK_NODE_WIDTH,
  LINK_NODE_HEIGHT,
  DEFAULT_EXPANDED_WIDTH,
  DEFAULT_EXPANDED_HEIGHT,
  isNodeUiExpanded,
  nodeCardWidth,
  nodeCardHeight,
  parseSlidesContent,
  NODE_TYPE_LABEL_CLASS,
  NODE_TITLE_BOX_CLASS,
  NODE_BODY_BOX_CLASS,
  NODE_TITLE_INPUT_CLASS,
  NODE_TITLE_EMPTY_CLASS,
  NODE_TITLE_DISPLAY_CLASS,
  NODE_FIELD_INPUT_CLASS,
  isUnsetNodeTitle,
} from "./fsiNodeCardUi";

export function isFrameNode(node: FsiNodeRecord): boolean {
  return node.structured_payload?.is_frame === true || node.node_type === "Frame";
}

export function isStickyNode(node: FsiNodeRecord): boolean {
  if (node.structured_payload?.is_screenshot === true) return false;
  if (node.structured_payload?.is_frame === true) return false;
  return (
    node.structured_payload?.is_sticky === true ||
    node.node_type === "Sticky Note" ||
    (node.structured_payload?.is_note === true && node.node_type === "Strategist Note")
  );
}

export function isLinkNode(node: FsiNodeRecord): boolean {
  return node.structured_payload?.is_link_node === true || node.node_type === "Link";
}

export function isVisualHookNode(node: FsiNodeRecord): boolean {
  return (
    node.node_type === "Visual Hook" ||
    (node.node_type === "Hook Pattern" && node.structured_payload?.hook_kind === "visual")
  );
}

export function isWrittenHookNode(node: FsiNodeRecord): boolean {
  return (
    node.node_type === "Written Hook" ||
    (node.node_type === "Hook Example" && node.structured_payload?.hook_kind === "written") ||
    (node.node_type === "Hook Pattern" &&
      node.structured_payload?.hook_kind !== "visual" &&
      !node.structured_payload?.is_link_node)
  );
}

export function isPerformanceNode(node: FsiNodeRecord): boolean {
  return node.node_type === "Performance" || node.node_type === "Performance Insight";
}

export function isVisualNode(node: FsiNodeRecord): boolean {
  return (
    node.node_type === "Visual" ||
    (node.structured_payload?.is_screenshot === true && node.node_type === "Visual Pattern") ||
    ["Post Example", "Carousel Example", "Reel Example"].includes(node.node_type)
  );
}

export function isPageNameNode(node: FsiNodeRecord): boolean {
  return node.node_type === "Page Name" || node.node_type === "Page" || node.node_type === "Niche";
}

export function isCompactLabelNode(node: FsiNodeRecord): boolean {
  return node.node_type === "Content Pillar" || node.node_type === "Content Bucket";
}

export function isCarouselBodyNode(node: FsiNodeRecord): boolean {
  return node.node_type === "Carousel Body";
}

/** Nodes with user-controlled expand/collapse (corner toggle). */
export function isCollapsibleCardNode(node: FsiNodeRecord): boolean {
  return (
    isLinkNode(node) ||
    isCompactLabelNode(node) ||
    isCarouselBodyNode(node) ||
    node.node_type === "Page Name" ||
    node.node_type === "Page" ||
    node.node_type === "Visual Hook" ||
    node.node_type === "Written Hook" ||
    node.node_type === "Performance" ||
    node.node_type === "Performance Insight" ||
    node.node_type === "Hook Pattern" ||
    node.node_type === "Hook Example"
  );
}

/** Title-only cards — fixed compact size when collapsed. */
export function isSimpleLabelNode(node: FsiNodeRecord): boolean {
  return isCollapsibleCardNode(node);
}

/** Resolve toolbar / UI label for any stored node. */
export function displayNodeType(node: FsiNodeRecord): string {
  if (isFrameNode(node)) return "Frame";
  if (isStickyNode(node)) return "Sticky Note";
  if (isLinkNode(node)) return "Link";
  if (isVisualNode(node)) return "Visual";
  if (isVisualHookNode(node)) return "Visual Hook";
  if (isWrittenHookNode(node)) return "Written Hook";
  if (isPerformanceNode(node)) return "Performance";
  if (isPageNameNode(node)) return "Page Name";
  if (node.node_type === "Content Pillar") return "Content Pillar";
  if (node.node_type === "Content Bucket") return "Content Bucket";
  if (isCarouselBodyNode(node)) return "Carousel Body";
  return node.node_type;
}

export type CreateNodeSpec = {
  node_type: string;
  display_title: string;
  structured_payload: Record<string, unknown>;
  raw_body_text?: string;
};

/** Map whiteboard tool → API create payload. */
export function specForWhiteboardType(type: WhiteboardNodeType): CreateNodeSpec {
  switch (type) {
    case "Page Name":
      return { node_type: "Page Name", display_title: "", structured_payload: { ui_expanded: false } };
    case "Content Pillar":
      return { node_type: "Content Pillar", display_title: "", structured_payload: { ui_expanded: false } };
    case "Content Bucket":
      return { node_type: "Content Bucket", display_title: "", structured_payload: { ui_expanded: false } };
    case "Visual":
      return {
        node_type: "Visual",
        display_title: "Visual",
        structured_payload: { is_screenshot: true, image_url: "" },
      };
    case "Visual Hook":
      return {
        node_type: "Visual Hook",
        display_title: "",
        structured_payload: { ui_expanded: false },
        raw_body_text: "",
      };
    case "Written Hook":
      return {
        node_type: "Written Hook",
        display_title: "",
        structured_payload: { ui_expanded: false },
        raw_body_text: "",
      };
    case "Carousel Body":
      return {
        node_type: "Carousel Body",
        display_title: "",
        structured_payload: { ui_expanded: false, slides_content: [""] },
      };
    case "Performance":
      return {
        node_type: "Performance",
        display_title: "",
        structured_payload: {
          views: "",
          likes: "",
          shares: "",
          comments: "",
          followers_gained: "",
        },
      };
    case "Link":
      return {
        node_type: "Link",
        display_title: "",
        structured_payload: { ui_expanded: false, url: "" },
      };
    case "Sticky Note":
      return {
        node_type: "Sticky Note",
        display_title: "Note",
        structured_payload: { is_sticky: true, is_note: true },
        raw_body_text: "",
      };
    case "Frame":
      return {
        node_type: "Frame",
        display_title: "Frame 1",
        structured_payload: { is_frame: true, frame_width: 520, frame_height: 360 },
      };
    default:
      return { node_type: type, display_title: type, structured_payload: {} };
  }
}
