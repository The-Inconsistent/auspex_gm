import { cookies, headers as requestHeaders } from "next/headers";

import { sessionToken } from "@wg/auth/next";

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
