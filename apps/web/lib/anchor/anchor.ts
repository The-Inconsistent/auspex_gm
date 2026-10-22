// GO TO's landing: opens the element's fold (or the element, when it is one), scrolls to it, and puts a field in focus.
export function revealAnchor(id: string, block: ScrollLogicalPosition = "center") {
  const el = document.getElementById(id);
  if (!el) return;
  const fold = el.closest("details"); // a panel kept in a fold (PARTY's ASCENSION) opens first
  if (fold) fold.open = true;
  el.scrollIntoView({ behavior: "smooth", block });
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.focus({ preventScroll: true });
}
