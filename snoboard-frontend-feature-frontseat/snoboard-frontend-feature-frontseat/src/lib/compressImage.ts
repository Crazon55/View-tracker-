const MAX_UPLOAD_EDGE = 1920;
const JPEG_QUALITY = 0.82;
/** Skip compression when already small enough (bytes). */
const SKIP_COMPRESS_UNDER_BYTES = 400_000;

/**
 * Downscale + JPEG-compress large clipboard/screenshot files before upload.
 * Keeps GIFs/SVGs as-is; falls back to the original file on any failure.
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;
  if (file.size > 0 && file.size < SKIP_COMPRESS_UNDER_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, MAX_UPLOAD_EDGE / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      if (scale >= 1 && file.type === "image/jpeg" && file.size < SKIP_COMPRESS_UNDER_BYTES * 2) {
        return file;
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, w, h);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
      );
      if (!blob || blob.size >= file.size) return file;

      const base = file.name.replace(/\.[^.]+$/, "") || "screenshot";
      return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}
