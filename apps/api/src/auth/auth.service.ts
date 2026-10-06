import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { SESSION_COOKIE, bearerOf, verifySession, type AuthUser } from "@wg/auth/api";
import type { Role } from "@wg/shared";
import { db, type Tx } from "../core/db.ts";
import { campaign } from "../campaign/campaign.schema.ts";
import { accessToken, appUser, membership } from "./auth.schema.ts";

// Guest login cookie (a player QR token). Signed-in users use Clerk's `__session` instead.
export const COOKIE = "wg_token";

// Who is acting at one table. userId is the Clerk user; null for a guest. `admin` marks a Clerk admin acting as GM
// without a seat: their actions are logged (admin_event). False for members, guests and the ADMIN_KEY scripts.
export type Ctx = {
  campaignId: string;
  role: Role;
  characterId: string | null;
  userId: string | null;
  admin: boolean;
};

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
  return row ? { ...row, userId: null, admin: false } : null;
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
export async function signedInUser(headers: { authorization?: string; cookie?: string }): Promise<AuthUser | null> {
  const user = await verifySession(bearerOf(headers.authorization) ?? readCookie(headers.cookie, SESSION_COOKIE));
  if (user) {
    const role = user.admin ? "admin" : user.creator ? "creator" : null;
    await db
      .insert(appUser)
      .values({ id: user.userId, name: user.name, role })
      // Only when it actually changed, or the last-seen stamp has gone stale: the library builder autosaves every
      // couple of seconds, and rewriting the same values on each request would churn a row version per save for nothing.
      .onConflictDoUpdate({
        target: appUser.id,
        set: { name: user.name, role, lastSeenAt: new Date(), updatedAt: new Date() },
        setWhere: sql`${appUser.name} is distinct from ${user.name} or ${appUser.role} is distinct from ${role} or ${appUser.lastSeenAt} < now() - interval '1 hour'`,
      });
  }
  return user;
}

// The caller at `campaignId`: a signed-in member first, else a guest token for that same campaign.
export async function resolveCtx({
  campaignId,
  headers,
}: {
  campaignId: string;
  headers: { authorization?: string; cookie?: string };
}): Promise<Ctx | null> {
  const user = await signedInUser(headers);
  if (user) {
    const [m] = await db
      .select({ role: membership.role, characterId: membership.characterId })
      .from(membership)
      .where(and(eq(membership.campaignId, campaignId), eq(membership.userId, user.userId)));
    if (m) return { campaignId, ...m, userId: user.userId, admin: false };
    // An admin without a seat acts as GM, so they see everything a GM does and PARTY doesn't list them.
    if (user.admin) {
      const [c] = await db.select({ id: campaign.id }).from(campaign).where(eq(campaign.id, campaignId));
      if (c) return { campaignId, role: "gm", characterId: null, userId: user.userId, admin: true };
    }
  }
  const guest = await resolveGuest(readCookie(headers.cookie));
  return guest?.campaignId === campaignId ? guest : null;
}
