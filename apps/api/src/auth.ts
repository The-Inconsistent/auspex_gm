import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Role } from "@wg/shared";
import { db, type Tx } from "./db.ts";
import { accessToken } from "./schema.ts";

export const COOKIE = "wg_token";

export type Ctx = { campaignId: string; role: Role; characterId: string | null };

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function issueToken(tx: Tx, campaignId: string, role: Role, characterId: string | null = null) {
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

export function readCookie(header: string | undefined, name = COOKIE): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
}
