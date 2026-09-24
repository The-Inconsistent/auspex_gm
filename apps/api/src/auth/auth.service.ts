import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Role } from "@wg/shared";
import { db, type Tx } from "../core/db.ts";
import { accessToken } from "./auth.schema.ts";

export const COOKIE = "wg_token";

export type Ctx = { campaignId: string; role: Role; characterId: string | null };

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function issueToken(
  tx: Tx,
  { campaignId, role, characterId = null }: { campaignId: string; role: Role; characterId?: string | null },
) {
  const token = randomBytes(24).toString("base64url");
  await tx.insert(accessToken).values({ tokenHash: hash(token), campaignId, role, characterId });
  return token;
}

export async function resolveToken(token: string | undefined): Promise<Ctx | null> {
  if (!token) return null;
  const [row] = await db
    .select({ campaignId: accessToken.campaignId, role: accessToken.role, characterId: accessToken.characterId })
    .from(accessToken)
    .where(and(eq(accessToken.tokenHash, hash(token)), isNull(accessToken.revokedAt)));
  return row ?? null;
}

// Header is attacker-controlled: a malformed escape (`wg_token=%`) reads as no token instead of throwing, which in the
// socket middleware would be an unhandled rejection and take the process down.
export function readCookie(header: string | undefined): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const [k, ...v] = part.trim().split("=");
    if (k !== COOKIE) continue;
    try {
      return decodeURIComponent(v.join("="));
    } catch {
      return undefined;
    }
  }
}
