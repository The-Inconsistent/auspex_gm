import { and, count, eq, isNull, sql } from "drizzle-orm";
import { poolMax, type Action, type ActionResult } from "@wg/shared";
import type { Ctx } from "../auth/auth.service.ts";
import { character } from "../character/character.schema.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { bump } from "../core/sql.ts";
import { campaign, session } from "./campaign.schema.ts";

export type CampaignAction = Extract<
  Action,
  { type: "campaign.update" | "pool.adjust" | "session.start" | "session.end" }
>;

export async function campaignTier(tx: Tx, campaignId: string) {
  const [c] = await tx.select({ tier: campaign.tier }).from(campaign).where(eq(campaign.id, campaignId));
  return c!.tier; // ctx.campaignId comes from a valid token, so the campaign exists
}

async function playerCount(tx: Tx, campaignId: string) {
  const [{ n } = { n: 0 }] = await tx
    .select({ n: count() })
    .from(character)
    .where(eq(character.campaignId, campaignId));
  return n;
}

export async function applyCampaignAction(
  tx: Tx,
  { ctx, action: a }: { ctx: Ctx; action: CampaignAction },
): Promise<ActionResult> {
  const cid = ctx.campaignId;
  switch (a.type) {
    case "campaign.update": {
      const { type, ...patch } = a;
      await tx.update(campaign).set(patch).where(eq(campaign.id, cid));
      return { ok: true };
    }

    case "pool.adjust": {
      const cap = poolMax(a.pool, await playerCount(tx, cid));
      await tx
        .update(campaign)
        .set({ [a.pool]: sql`least(${cap}, ${bump(campaign[a.pool], a.delta)})` })
        .where(eq(campaign.id, cid));
      return { ok: true };
    }

    // Wrath 2 each, Glory 0, Ruin = players (p.162, p.164, p.320); the previous session is closed.
    case "session.start": {
      const players = await playerCount(tx, cid);
      await tx.update(character).set({ wrath: 2 }).where(eq(character.campaignId, cid));
      await tx.update(campaign).set({ glory: 0, ruin: players }).where(eq(campaign.id, cid));
      await tx
        .update(session)
        .set({ endedAt: new Date() })
        .where(and(eq(session.campaignId, cid), isNull(session.endedAt)));
      const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(session).where(eq(session.campaignId, cid));
      const [s] = await tx
        .insert(session)
        .values({ campaignId: cid, number: n + 1 })
        .returning({ id: session.id });
      return { ok: true, id: s!.id }; // the row was just inserted
    }

    // XP to every character (p.321); pools don't carry over, session.start resets them.
    case "session.end": {
      const [s] = await tx
        .select()
        .from(session)
        .where(and(eq(session.campaignId, cid), isNull(session.endedAt)));
      if (!s) fail("No session in progress");
      await tx.update(session).set({ endedAt: new Date(), recap: a.recap, xp: a.xp }).where(eq(session.id, s.id));
      await tx
        .update(character)
        .set({ xp: sql`${character.xp} + ${a.xp}` })
        .where(eq(character.campaignId, cid));
      return { ok: true };
    }
  }
}
