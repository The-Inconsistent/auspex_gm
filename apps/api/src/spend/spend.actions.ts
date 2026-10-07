import { and, eq } from "drizzle-orm";
import {
  MAX_PENDING_SPENDS,
  deriveStats,
  isGone,
  pcStatus,
  rankOf,
  restoreShockAmount,
  spendCost,
  spendTakesAmount,
  type Action,
  type ActionResult,
} from "@wg/shared";
import type { Ctx } from "../auth/auth.service.ts";
import { applyCampaignAction, campaignTier } from "../campaign/campaign.actions.ts";
import { campaign } from "../campaign/campaign.schema.ts";
import { applyCharacterAction, ownCharacter } from "../character/character.actions.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { applyEncounterAction } from "../encounter/encounter.actions.ts";
import { combatant, encounter } from "../encounter/encounter.schema.ts";
import { toCharacter } from "../table/table.state.ts";
import { spendRequest } from "./spend.schema.ts";

export type SpendAction = Extract<Action, { type: `spend.${string}` }>;

// The active encounter's id, or null: a Seize needs a fight to Seize in.
async function activeEncounterId(tx: Tx, campaignId: string) {
  const [enc] = await tx
    .select({ id: encounter.id })
    .from(encounter)
    .where(and(eq(encounter.campaignId, campaignId), eq(encounter.active, true)));
  return enc?.id ?? null;
}

// A pending request of this campaign, or a refusal. Never trust the id from the client.
async function requestOf(tx: Tx, { campaignId, id }: { campaignId: string; id: string }) {
  const [r] = await tx
    .select()
    .from(spendRequest)
    .where(and(eq(spendRequest.id, id), eq(spendRequest.campaignId, campaignId)));
  return r ?? fail("Request not found: it may already be answered");
}

export async function applySpendAction(
  tx: Tx,
  { ctx, action: a }: { ctx: Ctx; action: SpendAction },
): Promise<ActionResult> {
  const cid = ctx.campaignId;
  switch (a.type) {
    case "spend.request": {
      await ownCharacter(tx, { campaignId: cid, id: a.characterId });
      if (a.kind === "seize" && !(await activeEncounterId(tx, cid))) fail("No fight to Seize the Initiative in");
      const mine = await tx
        .select({ kind: spendRequest.kind })
        .from(spendRequest)
        .where(and(eq(spendRequest.campaignId, cid), eq(spendRequest.characterId, a.characterId)));
      if (mine.some((r) => r.kind === a.kind)) fail("Already asked for that: wait for the GM or cancel it");
      if (mine.length >= MAX_PENDING_SPENDS) fail(`At most ${MAX_PENDING_SPENDS} requests at once`);
      const [r] = await tx
        .insert(spendRequest)
        .values({
          campaignId: cid,
          characterId: a.characterId,
          kind: a.kind,
          amount: spendTakesAmount(a.kind) ? a.amount : 1, // only the Glory kinds have an amount to keep
        })
        .returning({ id: spendRequest.id });
      return { ok: true, id: r!.id }; // the row was just inserted
    }

    case "spend.cancel": {
      const r = await requestOf(tx, { campaignId: cid, id: a.id });
      // authorize() only knows the action, so a player's ownership is checked here against the row.
      if (ctx.role !== "gm" && r.characterId !== ctx.characterId) fail("Not your request");
      await tx.delete(spendRequest).where(eq(spendRequest.id, r.id));
      return { ok: true };
    }

    // GM only. Accepting is the spend itself, through the handlers the tablet already uses, in this transaction: a
    // refusal rolls the whole thing back, so the request stays pending and the GM can DENY it.
    case "spend.resolve": {
      const r = await requestOf(tx, { campaignId: cid, id: a.id });
      if (a.accept) await spendIt(tx, { ctx, request: r });
      await tx.delete(spendRequest).where(eq(spendRequest.id, r.id));
      return { ok: true };
    }
  }
}

async function spendIt(tx: Tx, { ctx, request: r }: { ctx: Ctx; request: typeof spendRequest.$inferSelect }) {
  const cid = ctx.campaignId;
  const cost = spendCost(r.kind, r.amount);
  const row = await ownCharacter(tx, { campaignId: cid, id: r.characterId });

  // pool.adjust and character.adjust clamp at 0, which would let a spend the pool can't pay go through for less, so
  // affordability is checked here. (turn.seize has its own check in encounter.actions' spend().)
  if (cost.wrath > row.wrath) fail(`${row.name} has no Wrath to spend (p.164)`);
  if (cost.glory > 0) {
    const [c] = await tx.select({ glory: campaign.glory }).from(campaign).where(eq(campaign.id, cid));
    if (cost.glory > (c?.glory ?? 0)) fail(`Not enough Glory: ${c?.glory ?? 0} left, ${cost.glory} asked (p.165)`);
  }

  switch (r.kind) {
    case "reroll":
      await applyCharacterAction(tx, { ctx, action: { type: "character.adjust", id: row.id, wrath: -cost.wrath } });
      return;

    case "restoreShock": {
      // Conscious only (p.196): a Dying or Dead Agent takes no Combat Action to restore anything.
      const tier = await campaignTier(tx, cid);
      const c = toCharacter(row);
      const status = pcStatus(c, deriveStats({ stats: c.stats, overrides: c.overrides, tier }));
      if (status.includes("Dying") || isGone(status)) fail(`${row.name} is not conscious (p.196)`);
      if (row.shock <= 0) fail(`${row.name} has no Shock to restore`); // the Wrath would buy nothing
      await applyCharacterAction(tx, {
        ctx,
        action: {
          type: "character.adjust",
          id: row.id,
          wrath: -cost.wrath,
          shock: -restoreShockAmount({ rank: rankOf(row.xp), tier }),
        },
      });
      return;
    }

    case "gloryDice":
    case "gloryDamage":
      await applyCampaignAction(tx, { ctx, action: { type: "pool.adjust", pool: "glory", delta: -cost.glory } });
      return;

    // The existing turn.seize pays the Glory and checks canSeize; the requester's combatant is the one that goes.
    case "seize": {
      const encId = (await activeEncounterId(tx, cid)) ?? fail("No fight to Seize the Initiative in");
      const [c] = await tx
        .select({ id: combatant.id })
        .from(combatant)
        .where(and(eq(combatant.encounterId, encId), eq(combatant.characterId, r.characterId)));
      if (!c) fail(`${row.name} is not in the fight`);
      await applyEncounterAction(tx, { ctx, action: { type: "turn.seize", id: c.id } });
      return;
    }
  }
}
