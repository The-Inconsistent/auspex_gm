// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- type.d.ts is a global Clerk augmentation, not a module
/// <reference path="../type.d.ts" />
import { verifyToken } from "@clerk/backend";

// Clerk session tokens (JWTs). The browser keeps one in the `__session` cookie; server-side Next sends it as a Bearer
// header. The custom claims (../type.d.ts) carry the user's name and app role, so the api needs no network call.

export const SESSION_COOKIE = "__session";

export type AuthUser = { userId: string; name: string; creator: boolean };

type TestRole = "creator" | "member";

// Test-only tokens `test.<secret>.<userId>.<creator|member>` let the smoke test act as signed-in users without a
// Clerk instance. Never in production.
const TEST_SECRET = process.env.CLERK_TEST_SECRET;
if (TEST_SECRET && process.env.NODE_ENV === "production")
  throw new Error("CLERK_TEST_SECRET must not be set in production");

export const testSessionToken = ({
  secret,
  userId,
  role = "member",
}: {
  secret: string;
  userId: string;
  role?: TestRole;
}) => `test.${secret}.${userId}.${role}`;

// Browser origins allowed to present a token (the `azp` claim): the web app's address(es), comma separated.
const authorizedParties = process.env.WEB_ORIGIN?.split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// CLERK_JWT_KEY as its bare base64 body. Env editors mangle a multi-line PEM (Dockhand turned its newlines into spaces),
// and Clerk strips only newlines, so a stray space breaks the key and every token fails as "signed out". Clerk accepts
// the bare body: it strips the header and footer itself when they're present.
export const pemBody = (pem: string | undefined) =>
  pem?.replace(/-----(BEGIN|END) PUBLIC KEY-----|\s+/g, "") || undefined;
const jwtKey = pemBody(process.env.CLERK_JWT_KEY);

export async function verifySession(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  if (TEST_SECRET && token.startsWith("test.")) {
    const [, secret, userId, role] = token.split(".");
    return secret === TEST_SECRET && userId ? { userId, name: userId, creator: role === "creator" } : null;
  }
  try {
    const claims = await verifyToken(token, { jwtKey, secretKey: process.env.CLERK_SECRET_KEY, authorizedParties });
    const { metadata, name, username } = claims;
    const displayName = [name, username].find((v): v is string => typeof v === "string" && v.trim() !== "") ?? "Player";
    return { userId: claims.sub, name: displayName, creator: metadata?.role === "creator" };
  } catch {
    return null; // expired, forged, or from another origin: treated as signed out
  }
}

// The session token on a request: `Authorization: Bearer …` (server-side Next), else the `__session` cookie (browser).
export const bearerOf = (authorization: string | undefined) =>
  authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
