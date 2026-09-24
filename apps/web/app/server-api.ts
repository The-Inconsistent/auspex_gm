import { cookies } from "next/headers";

import { sessionToken } from "@wg/auth/next";

import { API_ORIGIN, TOKEN_COOKIE } from "@/app/constants";

// GET an api route as the caller, from the server: their Clerk session as a Bearer token, and the guest cookie
// (httpOnly, so only the server can forward it).
export async function apiGet(path: string) {
  const token = await sessionToken();
  const guest = (await cookies()).get(TOKEN_COOKIE)?.value;
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (guest) headers.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(guest)}`;
  const res = await fetch(`${API_ORIGIN}${path}`, { headers, cache: "no-store" });
  return res;
}
