import {
  categorizeAttachment,
  maxBytesForCategory,
  MAX_IMAGE_FILE_BYTES,
  MAX_PDF_FILE_BYTES,
  MAX_TEXT_FILE_BYTES,
} from "@/lib/attachments/constants";
import type { AttachmentPayload } from "@/lib/attachments/types";

export class AttachmentValidationError extends Error {}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const LIMIT_LABEL: Record<string, string> = {
  image: formatBytes(MAX_IMAGE_FILE_BYTES),
  pdf: formatBytes(MAX_PDF_FILE_BYTES),
  text: formatBytes(MAX_TEXT_FILE_BYTES),
};

/**
 * Validates a File's type/size and reads it into the wire payload shape —
 * base64 (via `readAsDataURL`, stripping the `data:...;base64,` prefix) for
 * images/PDFs, raw text (via `readAsText`) for txt/csv/json/log so it
 * reaches the Anthropic SDK's PlainTextSource as-is (see
 * src/app/api/chat/route.ts — that source type takes literal text, not
 * base64). Throws AttachmentValidationError with a user-facing message on
 * any rejection; callers should catch that type specifically to show its
 * message, and fall back to a generic message for anything else (a read
 * failure from FileReader itself, for instance).
 */
export async function readFileAsAttachment(file: File): Promise<AttachmentPayload> {
  const category = categorizeAttachment(file.name, file.type);
  if (!category) {
    throw new AttachmentValidationError(
      `"${file.name}" isn't a supported file type — attach an image (PNG/JPG/WEBP/GIF), a PDF, or a text file (TXT/CSV/JSON/LOG).`
    );
  }
  if (file.size === 0) {
    throw new AttachmentValidationError(`"${file.name}" is empty.`);
  }
  const maxBytes = maxBytesForCategory(category);
  if (file.size > maxBytes) {
    throw new AttachmentValidationError(
      `"${file.name}" is too large — ${category} attachments are capped at ${LIMIT_LABEL[category]}.`
    );
  }

  if (category === "text") {
    const text = await readAsText(file);
    return { name: file.name, mediaType: "text/plain", category, data: text };
  }

  const dataUrl = await readAsDataUrl(file);
  const commaIndex = dataUrl.indexOf(",");
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : "";
  const mediaType = category === "pdf" ? "application/pdf" : file.type;
  return { name: file.name, mediaType, category, data: base64 };
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new AttachmentValidationError(`Couldn't read "${file.name}".`));
    reader.readAsText(file);
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new AttachmentValidationError(`Couldn't read "${file.name}".`));
    reader.readAsDataURL(file);
  });
}
