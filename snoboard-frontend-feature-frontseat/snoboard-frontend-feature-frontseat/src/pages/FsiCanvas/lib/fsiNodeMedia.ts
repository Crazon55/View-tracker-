import { fsiApi } from "@/services/fsiApi";

export const SCREENSHOTS_PAYLOAD_KEY = "screenshots";

/** Accepts Cloudinary HTTPS URLs and legacy inline data URLs. */
export function parseNodeScreenshots(payload: Record<string, unknown> | undefined): string[] {
  const raw = payload?.[SCREENSHOTS_PAYLOAD_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export async function uploadFsiNodeScreenshotFiles(opts: {
  studyId: string;
  nodeId: string;
  files: FileList | File[];
  uploader?: string;
}): Promise<string[]> {
  const files = Array.from(opts.files).filter((file) => file.type.startsWith("image/"));
  if (!files.length) return [];
  return fsiApi.uploadNodeScreenshotFiles(opts.studyId, opts.nodeId, files, opts.uploader);
}
