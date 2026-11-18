import type { RecapDraft } from "@wg/shared";

// The GM-only recap-draft read (the browser's cookies authenticate it, like the lobby's fetches). It answers the parsed
// body, or throws an Error whose message is the server's reason, so the caller shows it inline. (HISTORY is not here:
// the api pushes it over the socket.)
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const message = body && typeof body === "object" && "message" in body ? body.message : null;
    throw new Error(typeof message === "string" ? message : `The api refused (${res.status}).`);
  }
  return (await res.json()) as T;
}

export const fetchRecapDraft = ({ campaignId, sessionId }: { campaignId: string; sessionId: string }) =>
  getJson<RecapDraft>(`/api/campaigns/${campaignId}/sessions/${sessionId}/recap-draft`);

// Appends draft lines to a recap without touching what the GM typed: an empty recap becomes the draft, otherwise the
// draft follows after a blank line. Lines already in the recap are skipped, so pressing the button twice adds nothing.
export function mergeDraft({ recap, lines }: { recap: string; lines: string[] }): string {
  const have = new Set(recap.split("\n").map((l) => l.trim()));
  const fresh = lines.filter((l) => !have.has(l.trim()));
  if (fresh.length === 0) return recap;
  const draft = fresh.join("\n");
  return recap.trim() === "" ? draft : `${recap.replace(/\s+$/, "")}\n\n${draft}`;
}
