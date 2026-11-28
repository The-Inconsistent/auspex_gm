import { and, eq } from "drizzle-orm";
import {
  MAX_PENDING_SPENDS,
  deriveStats,
  isExhausted,
  isGone,
  pcStatus,
  rankOf,
  restoreShockAmount,
  spendCost,
  spendTakesAmount,
  type Action,
  type ActionResult,
  type SpendKind,
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

// The asker's row in the fight, ambushed: AWARE means nothing otherwise (p.177).
async function ambushedCombatant(tx: Tx, { campaignId, characterId }: { campaignId: string; characterId: string }) {
  const encId = (await activeEncounterId(tx, campaignId)) ?? fail("No fight to be ambushed in");
  const [c] = await tx
    .select({ id: combatant.id, ambushed: combatant.ambushed })
    .from(combatant)
    .where(and(eq(combatant.encounterId, encId), eq(combatant.characterId, characterId)));
  if (!c) fail("Not in the fight");
  if (!c.ambushed) fail("Not ambushed");
  return c.id;
}

// What an ally's player may ask for (§11.208): Glory for its damage, Seize and AWARE. Determination's price for an ally
// is still open, and nothing else is the Agent's own.
const ALLY_SPENDS: readonly SpendKind[] = ["gloryDamage", "seize", "aware"];

// The ally row a request names: in the current fight, an ally, run by this Agent's player. Never trust the id from the
// client: the row is looked up in this campaign's active encounter.
async function allyOf(
  tx: Tx,
  { campaignId, characterId, id }: { campaignId: string; characterId: string; id: string },
) {
  const encId = (await activeEncounterId(tx, campaignId)) ?? fail("No fight to ask for an ally in");
  const [c] = await tx
    .select({ ally: combatant.ally, controllerId: combatant.controllerId, ambushed: combatant.ambushed })
    .from(combatant)
    .where(and(eq(combatant.id, id), eq(combatant.encounterId, encId)));
  if (!c?.ally) fail("That is not an ally in this fight");
  if (c.controllerId !== characterId) fail("You don't run that ally: only the GM or its Agent's player asks for it");
  return c;
}

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
      const row = await ownCharacter(tx, { campaignId: cid, id: a.characterId });
      const amount = spendTakesAmount(a.kind) ? a.amount : 1; // only the Glory kinds and Determination have an amount to keep
      if (a.combatantId) {
        if (!ALLY_SPENDS.includes(a.kind))
          fail(
            "An ally can only ask for Glory on its damage, to Seize the Initiative or to be made AWARE (rules-flow.md §11.208)",
          );
        const ally = await allyOf(tx, { campaignId: cid, characterId: a.characterId, id: a.combatantId });
        if (a.kind === "aware" && !ally.ambushed) fail("Not ambushed");
      } else {
        if (a.kind === "seize" && !(await activeEncounterId(tx, cid))) fail("No fight to Seize the Initiative in");
        if (a.kind === "aware") await ambushedCombatant(tx, { campaignId: cid, characterId: a.characterId });
      }
      const mine = await tx
        .select({ kind: spendRequest.kind, combatantId: spendRequest.combatantId })
        .from(spendRequest)
        .where(and(eq(spendRequest.campaignId, cid), eq(spendRequest.characterId, a.characterId)));
      if (mine.some((r) => r.kind === a.kind && r.combatantId === a.combatantId))
        fail("Already asked for that: wait for the GM or cancel it");
      if (mine.length >= MAX_PENDING_SPENDS) fail(`At most ${MAX_PENDING_SPENDS} requests at once`);
      // Asking needs the pool to cover it now (§11.122); ACCEPT checks again, since the pool may move in between.
      await canPay(tx, { campaignId: cid, row, cost: spendCost(a.kind, amount) });
      const [r] = await tx
        .insert(spendRequest)
        .values({
          campaignId: cid,
          characterId: a.characterId,
          kind: a.kind,
          amount,
          combatantId: a.combatantId,
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

// A refusal unless the Agent's Wrath and the party's Glory cover `cost`.
async function canPay(
  tx: Tx,
  {
    campaignId,
    row,
    cost,
  }: { campaignId: string; row: { name: string; wrath: number }; cost: ReturnType<typeof spendCost> },
) {
  if (cost.wrath > row.wrath) fail(`${row.name} has no Wrath to spend (p.164)`);
  if (cost.glory > 0) {
    const [c] = await tx.select({ glory: campaign.glory }).from(campaign).where(eq(campaign.id, campaignId));
    if (cost.glory > (c?.glory ?? 0)) fail(`Not enough Glory: ${c?.glory ?? 0} left, ${cost.glory} asked (p.165)`);
  }
}

async function spendIt(tx: Tx, { ctx, request: r }: { ctx: Ctx; request: typeof spendRequest.$inferSelect }) {
  const cid = ctx.campaignId;
  const cost = spendCost(r.kind, r.amount);
  const row = await ownCharacter(tx, { campaignId: cid, id: r.characterId });

  // pool.adjust and character.adjust clamp at 0, which would let a spend the pool can't pay go through for less, so
  // affordability is checked here. (turn.seize has its own check in encounter.actions' spend().)
  await canPay(tx, { campaignId: cid, row, cost });

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

    // Each Icon rolled turns one Wound into Shock (p.196), never while Exhausted (p.199). It costs nothing, so there's
    // no pool to check; k is capped by the Wounds there are to turn. Raw: it reduces the Wounds the hit dealt, so an
    // Agent the hit made Dying stays Dying unless the Icons bring them back to max (pcHit's healing clamp would not).
    case "determination": {
      const tier = await campaignTier(tx, cid);
      const c = toCharacter(row);
      const { maxShock } = deriveStats({ stats: c.stats, overrides: c.overrides, tier });
      if (isExhausted({ shock: row.shock, maxShock, conditions: row.conditions }))
        fail(`${row.name} is Exhausted: no Determination (p.199)`);
      const k = Math.min(r.amount, row.wounds);
      if (k <= 0) fail("No Wounds to turn into Shock");
      await applyCharacterAction(tx, {
        ctx,
        action: { type: "character.adjust", id: row.id, wounds: -k, shock: k, raw: true },
      });
      return;
    }

    // The existing combatant.aware pays the Glory and clears the ambush (p.177), so TURN BACK refunds it as the GM's own.
    case "aware": {
      // An ally's ask names its row: the same combatant.aware, paid in Glory (§11.208).
      if (r.combatantId) {
        await applyEncounterAction(tx, { ctx, action: { type: "combatant.aware", id: r.combatantId } });
        return;
      }
      const id = await ambushedCombatant(tx, { campaignId: cid, characterId: r.characterId });
      await applyEncounterAction(tx, { ctx, action: { type: "combatant.aware", id } });
      return;
    }

    // The existing turn.seize pays the Glory and checks canSeize; the requester's combatant is the one that goes.
    case "seize": {
      if (r.combatantId) {
        await applyEncounterAction(tx, { ctx, action: { type: "turn.seize", id: r.combatantId } });
        return;
      }
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
