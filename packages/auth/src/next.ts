// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- type.d.ts is a global Clerk augmentation, not a module
/// <reference path="../type.d.ts" />
import { auth, clerkMiddleware } from "@clerk/nextjs/server";

// Next server side of Clerk: the proxy's session handling, and who is signed in on this request.
export const authMiddleware = clerkMiddleware;

// Clerk's session cookie. Mirrors SESSION_COOKIE in api.ts, which the Bun runtime owns and which pulls
// @clerk/backend; the proxy reads this to tell a guest apart from a signed-in user.
export const SESSION_COOKIE = "__session";

// `auth()` throws when clerkMiddleware() didn't run for the request. That is deliberate for a guest, whom proxy.ts
// skips, so treat it as signed out instead of failing the page — a guest has no Clerk session to read anyway.
async function signedOutIfNoClerk<T>(read: () => Promise<T | null>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

export const signedInUserId = () => signedOutIfNoClerk(async () => (await auth()).userId);

// The caller's session token, for forwarding to the api as a Bearer header (api.ts verifies it).
export const sessionToken = () => signedOutIfNoClerk(async () => (await auth()).getToken());
