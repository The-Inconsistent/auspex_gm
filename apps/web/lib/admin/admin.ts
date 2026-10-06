import type { ActionResult, AdminActionInput } from "@wg/shared";

const NO_SIGNAL = "No signal";

// What an admin route answered, as an ActionResult. A refusal can be a 200 with { ok: false, error } (the action
// route) or an HTTP error with Nest's { message } (a bad id, "Admins only"); both end up as the line to show. A
// `removed` count (DELETE /users/:id/seats) becomes a notice.
export function toResult(body: unknown): ActionResult {
  if (typeof body !== "object" || body === null) return { ok: false, error: NO_SIGNAL };
  if ("ok" in body && body.ok === true) {
    const notices =
      "notices" in body && Array.isArray(body.notices) ? body.notices.filter((n) => typeof n === "string") : [];
    return { ok: true, ...(notices.length ? { notices } : {}) };
  }
  if ("ok" in body && body.ok === false && "error" in body && typeof body.error === "string")
    return { ok: false, error: body.error };
  if ("removed" in body && typeof body.removed === "number")
    return { ok: true, notices: [`Removed from ${body.removed} ${body.removed === 1 ? "game" : "games"}`] };
  if ("message" in body) {
    const m = body.message;
    return { ok: false, error: Array.isArray(m) ? m.join(", ") : typeof m === "string" ? m : NO_SIGNAL };
  }
  return { ok: false, error: NO_SIGNAL };
}

async function call(path: string, init: RequestInit): Promise<ActionResult> {
  const res = await fetch(path, init).catch(() => null);
  if (!res) return { ok: false, error: NO_SIGNAL };
  const result = toResult(await res.json().catch(() => null));
  return res.ok || !result.ok ? result : { ok: false, error: `Refused (${res.status})` };
}

// One housekeeping action at one game, as its GM (POST /api/admin/campaigns/:id/action). The browser reaches the api
// through Next's /api rewrite with the Clerk __session cookie riding along, as the library builder's calls do.
export function adminAction({ campaignId, action }: { campaignId: string; action: AdminActionInput }) {
  return call(`/api/admin/campaigns/${encodeURIComponent(campaignId)}/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action),
  });
}

// Takes a user out of every game (DELETE /api/admin/users/:id/seats).
export function removeSeats(userId: string) {
  return call(`/api/admin/users/${encodeURIComponent(userId)}/seats`, { method: "DELETE" });
}

const STAMP = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

// A server timestamp as text. Always UTC: the page renders on the server and again in the browser, and two time zones
// would make the two renders differ.
export function stamp(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "—" : `${STAMP.format(at)} UTC`;
}
