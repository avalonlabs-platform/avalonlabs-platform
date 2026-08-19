/**
 * Shared between the client (attachment picker/drag-drop/paste validation,
 * src/hooks/use-chat-attachments.ts) and the server (src/app/api/chat/route.ts)
 * so both sides agree on exactly what's allowed — the server never trusts a
 * client-reported category, it re-derives one with the same
 * `categorizeAttachment` function below and rejects anything that disagrees.
 */

export const ALLOWED_IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type AllowedImageMediaType = (typeof ALLOWED_IMAGE_MEDIA_TYPES)[number];

export const ALLOWED_PDF_MEDIA_TYPE = "application/pdf";

// Browsers report inconsistent (and often empty) `File.type` values for
// .csv/.log files, so text attachments are categorized by extension instead
// of MIME type — unlike images/PDFs, where the browser-reported type is
// reliable.
export const ALLOWED_TEXT_EXTENSIONS = ["txt", "csv", "json", "log"] as const;
export type AllowedTextExtension = (typeof ALLOWED_TEXT_EXTENSIONS)[number];

export type AttachmentCategory = "image" | "pdf" | "text";

/**
 * Per-category byte ceilings — deliberately tighter than the flat "up to
 * 20MB" the product spec calls out for the UI, because Claude's own Messages
 * API limits are lower than that for some attachment types, and a file that
 * "attaches successfully" client-side only to 400 the request when sent is
 * worse UX than rejecting it up front. Verified against the current
 * Anthropic API docs before picking these numbers:
 *  - Images: the direct Messages API caps base64-encoded images at 10MB.
 *    Capping the raw file at 7MB keeps the base64 encoding (~1.33x
 *    inflation) safely under that.
 *  - PDFs: the Messages API caps total request size at 32MB. 20MB raw
 *    (~26.7MB base64) — the flat limit the product spec asked for — leaves
 *    headroom for the rest of the JSON payload (history, other attachments).
 *  - Text: sent as literal text, not base64, so it counts almost directly
 *    against the model's context window rather than a file-size limit —
 *    capped well below the other types so one attachment can't silently
 *    crowd out conversation history.
 */
export const MAX_IMAGE_FILE_BYTES = 7 * 1024 * 1024;
export const MAX_PDF_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
// Keeps the combined request payload well under the API's 32MB hard limit.
export const MAX_COMBINED_ATTACHMENT_BYTES = 24 * 1024 * 1024;

export function maxBytesForCategory(category: AttachmentCategory): number {
  switch (category) {
    case "image":
      return MAX_IMAGE_FILE_BYTES;
    case "pdf":
      return MAX_PDF_FILE_BYTES;
    case "text":
      return MAX_TEXT_FILE_BYTES;
  }
}

/** Single source of truth for "what kind of attachment is this" — used
 *  identically on the client (to validate before reading/uploading) and the
 *  server (to re-validate before building an Anthropic content block). */
export function categorizeAttachment(name: string, mediaType: string): AttachmentCategory | null {
  if ((ALLOWED_IMAGE_MEDIA_TYPES as readonly string[]).includes(mediaType)) return "image";
  if (mediaType === ALLOWED_PDF_MEDIA_TYPE) return "pdf";
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext && (ALLOWED_TEXT_EXTENSIONS as readonly string[]).includes(ext)) return "text";
  return null;
}
