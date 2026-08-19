/** Copies the rendered message's plain-text reading — `.innerText` on the
 *  already-rendered DOM naturally strips all markdown syntax (headings,
 *  emphasis markers, table pipes, code fences) while preserving line breaks,
 *  which is simpler and more faithful than re-implementing a markdown-to-
 *  plaintext stripper against the raw source. */
export async function copyCleanText(el: HTMLElement | null): Promise<boolean> {
  if (!el) return false;
  try {
    await navigator.clipboard.writeText(el.innerText);
    return true;
  } catch {
    return false;
  }
}
