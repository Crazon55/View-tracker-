import type { FsiNodeRecord } from "./fsiNodeSchemas";

/** DB enum value used for standalone visual/screenshot cards on the canvas. */
export const SCREENSHOT_NODE_TYPE = "Visual";
export const TEMP_SCREENSHOT_ID_PREFIX = "temp-ss-";

export function isTempScreenshotId(id: string): boolean {
  return id.startsWith(TEMP_SCREENSHOT_ID_PREFIX);
}

export function screenshotNodePayload(imageUrl: string) {
  return { is_screenshot: true, image_url: imageUrl };
}

export function isScreenshotNode(node: FsiNodeRecord): boolean {
  return (
    node.structured_payload?.is_screenshot === true ||
    node.node_type === "Visual" ||
    ["Post Example", "Carousel Example", "Reel Example"].includes(node.node_type)
  );
}

export function isDisplayableImageUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const u = url.trim();
  return /^(https?:\/\/|data:image\/|blob:)/i.test(u);
}

export function getScreenshotImageUrl(node: FsiNodeRecord): string {
  const url = node.structured_payload?.image_url;
  return isDisplayableImageUrl(url) ? url.trim() : "";
}

export function clipboardImageFiles(data: DataTransfer | null): File[] {
  if (!data?.items) return [];
  const files: File[] = [];
  for (const item of data.items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}
