import type { AttachmentCategory } from "@/lib/attachments/constants";

/**
 * The wire shape sent from the client in POST /api/chat's `attachments`
 * array — plain JSON, no browser-only types, so it's safe to import from
 * the API route as well as client components.
 */
export interface AttachmentPayload {
  name: string;
  mediaType: string;
  category: AttachmentCategory;
  /** Base64 (no `data:` prefix) for image/pdf; raw UTF-8 text for text
   *  files — Anthropic's PlainTextSource takes literal text, not base64. */
  data: string;
}
