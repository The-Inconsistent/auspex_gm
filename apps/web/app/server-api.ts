import { cookies, headers as requestHeaders } from "next/headers";

import { sessionToken } from "@wg/auth/next";
import { CreationPayload, RuleEntry } from "@wg/shared";

import { API_ORIGIN, TOKEN_COOKIE } from "@/app/constants";

// GET an api route as the caller, from the server: their Clerk session as a Bearer token, and the guest cookie
// (httpOnly, so only the server can forward it). Plus the caller's IP, which the api rate-limits by (core/rate-limit.ts).
export async function apiGet(path: string) {
  const token = await sessionToken();
  const guest = (await cookies()).get(TOKEN_COOKIE)?.value;
  const ip = (await requestHeaders()).get("cf-connecting-ip");
  const headers: Record<string, string> = {};
  if (ip) headers["cf-connecting-ip"] = ip;
  if (token) headers.authorization = `Bearer ${token}`;
  if (guest) headers.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(guest)}`;
  const res = await fetch(`${API_ORIGIN}${path}`, { headers, cache: "no-store" });
  return res;
}

// POST/PUT/DELETE an api route as the caller, from the server: the same identity apiGet sends. Used where a page has no
// browser to do it, e.g. /library/new starting a character before it redirects to its builder.
export async function apiSend(path: string, { method, body }: { method: string; body?: unknown }) {
  const token = await sessionToken();
  const guest = (await cookies()).get(TOKEN_COOKIE)?.value;
  const ip = (await requestHeaders()).get("cf-connecting-ip");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ip) headers["cf-connecting-ip"] = ip;
  if (token) headers.authorization = `Bearer ${token}`;
  if (guest) headers.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(guest)}`;
  const res = await fetch(`${API_ORIGIN}${path}`, {
    method,
    headers,
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  return res;
}

// Rules reference for any seat, in file order (the stat legend reads in printed order; the RULES tab sorts by name).
// Empty on failure; the RULES tab then says so.
export async function loadRules(campaignId: string): Promise<RuleEntry[]> {
  try {
    const res = await apiGet(`/api/campaigns/${campaignId}/rules`);
    const parsed = RuleEntry.array().safeParse(res.ok ? await res.json() : null);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

// The creation catalogue for this table (book text, seats only). null on failure; callers say so or go without.
export async function loadCreation(campaignId: string): Promise<CreationPayload | null> {
  try {
    const res = await apiGet(`/api/campaigns/${campaignId}/creation`);
    const parsed = CreationPayload.safeParse(res.ok ? await res.json() : null);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// The rules reference for a signed-in user outside any campaign (issue #14). Empty on failure, like loadRules.
export async function loadRulesSignedIn(): Promise<RuleEntry[]> {
  try {
    const res = await apiGet("/api/rules");
    const parsed = RuleEntry.array().safeParse(res.ok ? await res.json() : null);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

// The creation catalogue outside any campaign: the character's own homebrew setting picks the books.
export async function loadCreationFor(homebrew: boolean): Promise<CreationPayload | null> {
  try {
    const res = await apiGet(`/api/creation?homebrew=${homebrew ? 1 : 0}`);
    const parsed = CreationPayload.safeParse(res.ok ? await res.json() : null);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
