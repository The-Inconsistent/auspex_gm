import { cookies, headers as requestHeaders } from "next/headers";

import { sessionToken } from "@wg/auth/next";
import { CreationPayload, FactionPresets, PlaceSummary, RuleEntry, ScenePresets } from "@wg/shared";

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

// What PREP and CODEX get when the api can't serve the presets: every list empty, by the schema's own defaults.
const NO_PRESETS = ScenePresets.parse({ skillDns: [], tables: [], pools: [] });

// GM-only book data for building scenes (issue #39). Empty on failure; the scene editor then shows no examples.
export async function loadScenePresets(campaignId: string): Promise<ScenePresets> {
  try {
    const res = await apiGet(`/api/campaigns/${campaignId}/scene-presets`);
    const parsed = ScenePresets.safeParse(res.ok ? await res.json() : null);
    return parsed.success ? parsed.data : NO_PRESETS;
  } catch {
    return NO_PRESETS;
  }
}

// GM-only Keywords (and printed factions) for CODEX › FACTIONS (issue #46). Empty on failure; the picker then takes
// write-ins only.
export async function loadFactionPresets(campaignId: string): Promise<FactionPresets> {
  try {
    const res = await apiGet(`/api/campaigns/${campaignId}/faction-presets`);
    const parsed = FactionPresets.safeParse(res.ok ? await res.json() : null);
    return parsed.success ? parsed.data : { keywords: [], presets: [] };
  } catch {
    return { keywords: [], presets: [] };
  }
}

// GM-only printed places for CODEX › LOCATIONS' ADD FROM BOOK (issue #50): names and nesting only. Empty on failure;
// the picker then hides.
export async function loadPlaces(campaignId: string): Promise<PlaceSummary[]> {
  try {
    const res = await apiGet(`/api/campaigns/${campaignId}/places`);
    const parsed = PlaceSummary.array().safeParse(res.ok ? await res.json() : null);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
