import { cookies, headers as requestHeaders } from "next/headers";

import { sessionToken } from "@wg/auth/next";
import { RuleEntry } from "@wg/shared";

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
