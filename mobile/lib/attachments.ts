/**
 * Mobile counterpart to the web dashboard's src/lib/attachments/constants.ts
 * + types.ts. Scoped to images only — the only attachment type the mobile
 * app can currently produce (camera capture / photo library, see
 * VisionCaptureModal.tsx) — but the wire payload shape (AttachmentPayload)
 * matches the server's exactly, so /api/chat's resolveAttachmentBlocks()
 * (route.ts) handles both the web and mobile clients through the same code
 * path rather than mobile keeping its own legacy `image` field alive.
 */

export type MobileAttachmentMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/** One captured/picked photo, held client-side until the message is sent. */
export interface MobileAttachment {
  /** Local id for list rendering / removal — never sent to the server. */
  id: string;
  /** file:// URI — local thumbnail preview only, never sent to the server. */
  uri: string;
  /** Base64-encoded bytes, no "data:" prefix — what actually gets sent. */
  base64: string;
  mediaType: MobileAttachmentMediaType;
  /** Approximate raw byte size, derived from the base64 length — enforced
   *  client-side against the same ceiling the server re-checks, so an
   *  oversized photo is rejected before spending a network round trip. */
  sizeBytes: number;
}

/** The exact wire shape POSTed in /api/chat's `attachments` array — mirrors
 *  src/lib/attachments/types.ts's AttachmentPayload on the web app. */
export interface AttachmentPayload {
  name: string;
  mediaType: string;
  category: "image";
  data: string;
}

// Mirrors src/lib/attachments/constants.ts's MAX_IMAGE_FILE_BYTES exactly —
// checked directly against the live route.ts/constants.ts on the server,
// not assumed. Claude's direct-API base64 image cap is 10MB; capping the
// raw file at 7MB keeps the ~1.33x base64 inflation safely under that.
export const MAX_IMAGE_FILE_BYTES = 7 * 1024 * 1024;

// The server allows up to 5 attachments per message
// (MAX_ATTACHMENTS_PER_MESSAGE in src/lib/attachments/constants.ts). Capped
// lower here — a deliberate, mobile-specific UX limit, not a server
// constraint: a phone-width preview strip and a camera-driven capture flow
// (one photo per shutter press) get unwieldy well before 5.
export const MAX_MOBILE_ATTACHMENTS = 3;

export function estimateBase64Bytes(base64: string): number {
  return Math.ceil((base64.length * 3) / 4);
}

let idCounter = 0;
export function nextAttachmentId(): string {
  idCounter += 1;
  return `att-${Date.now()}-${idCounter}`;
}

export function toAttachmentPayload(attachment: MobileAttachment, index: number): AttachmentPayload {
  const extension = attachment.mediaType === "image/png" ? "png" : "jpg";
  return {
    name: `photo-${index + 1}.${extension}`,
    mediaType: attachment.mediaType,
    category: "image",
    data: attachment.base64,
  };
}
