import { verifyToken } from "@clerk/backend";

// Clerk session tokens (JWTs). The browser keeps one in the `__session` cookie; server-side Next sends it as a Bearer
// header. The Clerk Dashboard's session-token claims must include
//   { "metadata": "{{user.public_metadata}}", "name": "{{user.full_name}}", "username": "{{user.username}}" }
// so the api knows the user's name and app role without a network call (docs/development.md, "Clerk").

export const CLERK_COOKIE = "__session";

export type ClerkUser = { userId: string; name: string; creator: boolean };

// Test-only tokens `test.<secret>.<userId>.<creator|member>` let the smoke test act as signed-in users without a
// Clerk instance. Never in production.
const TEST_SECRET = process.env.CLERK_TEST_SECRET;
if (TEST_SECRET && process.env.NODE_ENV === "production") throw new Error("CLERK_TEST_SECRET must not be set in production");

// Browser origins allowed to present a token (the `azp` claim): the web app's address(es), comma separated.
const authorizedParties = process.env.WEB_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);

export async function verifyClerk(token: string | undefined): Promise<ClerkUser | null> {
  if (!token) return null;
  if (TEST_SECRET && token.startsWith("test.")) {
    const [, secret, userId, role] = token.split(".");
    return secret === TEST_SECRET && userId ? { userId, name: userId, creator: role === "creator" } : null;
  }
  try {
    const claims = await verifyToken(token, { jwtKey: process.env.CLERK_JWT_KEY, secretKey: process.env.CLERK_SECRET_KEY, authorizedParties });
    const metadata = (claims.metadata ?? {}) as { role?: unknown };
    const name = [claims.name, claims.username].find((v): v is string => typeof v === "string" && v.trim() !== "") ?? "Player";
    return { userId: claims.sub, name, creator: metadata.role === "creator" };
  } catch {
    return null; // expired, forged, or from another origin: treated as signed out
  }
}

// The Clerk token on a request: `Authorization: Bearer …` (server-side Next), else the `__session` cookie (browser).
export const bearerOf = (authorization: string | undefined) =>
  authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
