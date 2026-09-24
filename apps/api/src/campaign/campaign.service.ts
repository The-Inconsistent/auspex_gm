import { timingSafeEqual } from "node:crypto";
import { threats } from "@wg/data";
import type { Threat } from "@wg/shared";
import { issueToken } from "../auth/auth.service.ts";
import { db } from "../core/db.ts";
import { campaign } from "./campaign.schema.ts";

// Constant-time compare against ADMIN_KEY.
export function isAdmin(key: string | undefined) {
  const expected = process.env.ADMIN_KEY;
  if (!expected || !key) return false;
  const a = Buffer.from(key), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createCampaign({ name, tier }: { name: string; tier: number }) {
  return db.transaction(async (tx) => {
    const [c] = await tx.insert(campaign).values({ name, tier }).returning({ id: campaign.id });
    const campaignId = c!.id; // the row was just inserted
    return { campaignId, gmToken: await issueToken(tx, { campaignId, role: "gm" }) };
  });
}

export const listThreats = (): Threat[] => [...threats.values()];
