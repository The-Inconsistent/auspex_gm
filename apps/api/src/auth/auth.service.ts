import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Role } from "@wg/shared";
import { db, type Tx } from "../core/db.ts";
import { accessToken, appUser, membership } from "./auth.schema.ts";
import { CLERK_COOKIE, bearerOf, verifyClerk, type ClerkUser } from "./clerk.ts";

// Guest login cookie (a player QR token). Signed-in users use Clerk's `__session` instead.
export const COOKIE = "wg_token";

// Who is acting at one table. userId is the Clerk user; null for a guest.
export type Ctx = { campaignId: string; role: Role; characterId: string | null; userId: string | null };

export const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export const newSecret = () => randomBytes(24).toString("base64url");

// Guest player token for one character (the per-character QR).
export async function issueToken(tx: Tx, { campaignId, characterId }: { campaignId: string; characterId: string }) {
  const token = newSecret();
  await tx.insert(accessToken).values({ tokenHash: hash(token), campaignId, role: "player", characterId });
  return token;
}

export async function resolveGuest(token: string | undefined): Promise<Ctx | null> {
  if (!token) return null;
  const [row] = await db
    .select({ campaignId: accessToken.campaignId, role: accessToken.role, characterId: accessToken.characterId })
    .from(accessToken)
    .where(and(eq(accessToken.tokenHash, hash(token)), isNull(accessToken.revokedAt)));
  return row ? { ...row, userId: null } : null;
}

// Header is attacker-controlled: a malformed escape (`wg_token=%`) reads as no value instead of throwing, which in the
// socket middleware would be an unhandled rejection and take the process down.
export function readCookie(header: string | undefined, name = COOKIE): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const [k, ...v] = part.trim().split("=");
    if (k !== name) continue;
    try {
      return decodeURIComponent(v.join("="));
    } catch {
      return undefined;
    }
  }
}

// The signed-in Clerk user on a request, if any. Their display name is kept fresh for member lists and the lobby.
export async function signedInUser(headers: { authorization?: string; cookie?: string }): Promise<ClerkUser | null> {
  const user = await verifyClerk(bearerOf(headers.authorization) ?? readCookie(headers.cookie, CLERK_COOKIE));
  if (user) {
    await db.insert(appUser).values({ id: user.userId, name: user.name })
      .onConflictDoUpdate({ target: appUser.id, set: { name: user.name, updatedAt: new Date() } });
  }
  return user;
}

// The caller at `campaignId`: a signed-in member first, else a guest token for that same campaign.
export async function resolveCtx(
  { campaignId, headers }: { campaignId: string; headers: { authorization?: string; cookie?: string } },
): Promise<Ctx | null> {
  const user = await signedInUser(headers);
  if (user) {
    const [m] = await db.select({ role: membership.role, characterId: membership.characterId }).from(membership)
      .where(and(eq(membership.campaignId, campaignId), eq(membership.userId, user.userId)));
    if (m) return { campaignId, ...m, userId: user.userId };
  }
  const guest = await resolveGuest(readCookie(headers.cookie));
  return guest?.campaignId === campaignId ? guest : null;
}
