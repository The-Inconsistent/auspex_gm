import { and, eq, isNull } from "drizzle-orm";
import {
  CharacterStats, Overrides, adjustAmmo, deriveStats, pcHit, pcStatus, requisitionOutcome, requisitionSlot, requisitionTest,
  requisitionYield, type Action, type ActionResult, type Character,
} from "@wg/shared";
import { accessToken } from "../auth/auth.schema.ts";
import { issueToken, type Ctx } from "../auth/auth.service.ts";
import { campaignTier } from "../campaign/campaign.actions.ts";
import { session } from "../campaign/campaign.schema.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { bump } from "../core/sql.ts";
import { character } from "./character.schema.ts";

export type CharacterAction = Extract<Action, { type: `character.${string}` | `token.${string}` }>;

export async function ownCharacter(tx: Tx, { campaignId, id }: { campaignId: string; id: string }) {
  const [c] = await tx.select().from(character).where(and(eq(character.id, id), eq(character.campaignId, campaignId)));
  return c ?? fail("Character not found");
}

// A character row with its derived Traits and damage state (Dying, Dead), at the campaign's Tier.
async function healthOf(tx: Tx, { campaignId, row }: { campaignId: string; row: typeof character.$inferSelect }) {
  const c: Character = { ...row, stats: CharacterStats.parse(row.stats), overrides: Overrides.parse(row.overrides) };
  const derived = deriveStats({ stats: c.stats, overrides: c.overrides, tier: await campaignTier(tx, campaignId) });
  const status = pcStatus(c, derived);
  return { c, derived, dying: status.includes("Dying"), dead: status.includes("Dead") };
}

// Writes stats back after a counter change, refusing anything the sheet schema wouldn't load (too many ammo types, a
// full gear list).
async function saveStats(tx: Tx, { id, stats }: { id: string; stats: CharacterStats }) {
  const r = CharacterStats.safeParse(stats);
  if (!r.success) fail(r.error.issues[0]?.message ?? "Invalid character sheet");
  await tx.update(character).set({ stats: r.data }).where(eq(character.id, id));
}

export async function applyCharacterAction(tx: Tx, { ctx, action: a }: { ctx: Ctx; action: CharacterAction }): Promise<ActionResult> {
  const cid = ctx.campaignId;
  const inCampaign = (id: string) => and(eq(character.id, id), eq(character.campaignId, cid));

  switch (a.type) {
    case "character.create": {
      const [c] = await tx.insert(character).values({ campaignId: cid, name: a.name, stats: a.stats ?? {} }).returning({ id: character.id });
      return { ok: true, id: c!.id }; // the row was just inserted
    }

    case "character.update": {
      const { type, id, ...patch } = a;
      if (Object.keys(patch).length === 0) return { ok: true };
      const r = await tx.update(character).set(patch).where(inCampaign(id)).returning({ id: character.id });
      return r.length ? { ok: true } : fail("Character not found");
    }

    case "character.adjust": {
      const row = await ownCharacter(tx, { campaignId: cid, id: a.id });
      const wrath = bump(character.wrath, a.wrath);
      if (a.raw) {
        await tx.update(character).set({
          wounds: bump(character.wounds, a.wounds), shock: bump(character.shock, a.shock), traumatic: bump(character.traumatic, a.traumatic), wrath,
        }).where(eq(character.id, a.id));
        return { ok: true };
      }
      // Writing counters read from the row is safe: the gateway runs one action per campaign at a time.
      const { c, derived } = await healthOf(tx, { campaignId: cid, row });
      const hit = pcHit({ c, d: derived, hit: a });
      await tx.update(character).set({
        wounds: hit.wounds, shock: hit.shock, traumatic: Math.max(0, hit.traumatic + (a.traumatic ?? 0)), annihilated: hit.annihilated, wrath,
        conditions: hit.prone && !c.conditions.includes("Prone") ? [...c.conditions, "Prone"] : undefined,
      }).where(eq(character.id, a.id));
      return { ok: true };
    }

    case "character.supply": {
      // Read-modify-write on stats is safe: the gateway runs one action per campaign at a time.
      const stats = CharacterStats.parse((await ownCharacter(tx, { campaignId: cid, id: a.id })).stats);
      if (a.wealth) stats.wealth = Math.max(0, stats.wealth + a.wealth);
      if (a.ammo) stats.ammo = adjustAmmo(stats.ammo, a.ammo);
      await saveStats(tx, { id: a.id, stats });
      return { ok: true };
    }

    case "character.requisition": {
      const row = await ownCharacter(tx, { campaignId: cid, id: a.id });
      const stats = CharacterStats.parse(row.stats);
      const [open] = await tx.select({ id: session.id }).from(session).where(and(eq(session.campaignId, cid), isNull(session.endedAt)));
      if (!open) fail("Start a session first: one Test of each kind per session (p.205)");
      const slot = requisitionSlot(a.kind);
      if (stats.requisitioned[slot] === open.id) fail(`${row.name} already made this session's ${slot} Test (p.205)`);
      const t = requisitionTest({ keywords: stats.keywords, itemKeywords: a.keywords, value: a.value, rarity: a.rarity });
      if (!t.eligible) fail("No Keyword in common with the item: it can't be requisitioned (p.205)");
      if (a.spend > stats.wealth) fail(`${row.name} has only ${stats.wealth} Wealth`);
      if (a.spend > 0 && a.icons >= t.dn) fail("Wealth only buys Icons on a failed Test (p.205)");

      const out = requisitionOutcome({ dn: t.dn, icons: a.icons, spend: a.spend, complication: a.complication, wealth: stats.wealth });
      stats.wealth = out.wealth;
      stats.requisitioned = { ...stats.requisitioned, [slot]: open.id };
      if (out.success && a.kind === "wargear") {
        stats.gear = [...stats.gear, a.item];
        if (a.loadedWith) stats.ammo = adjustAmmo(stats.ammo, { kind: a.loadedWith, delta: 1 });
      } else if (out.success) stats.ammo = adjustAmmo(stats.ammo, { kind: a.item, delta: requisitionYield(a.kind, a.rarity) });
      await saveStats(tx, { id: a.id, stats });
      return { ok: true };
    }

    case "character.respite": {
      const { dying, dead } = await healthOf(tx, { campaignId: cid, row: await ownCharacter(tx, { campaignId: cid, id: a.id }) });
      if (dead) fail("A Dead character can't Respite (p.193)");
      if (dying) fail("A Dying character can't benefit from a Respite (p.197)");
      await tx.update(character).set({ wounds: 0, shock: 0, wrath: 2 }).where(eq(character.id, a.id));
      return { ok: true };
    }

    case "character.delete": {
      const r = await tx.delete(character).where(inCampaign(a.id)).returning({ id: character.id });
      return r.length ? { ok: true } : fail("Character not found");
    }

    case "token.issue": {
      await ownCharacter(tx, { campaignId: cid, id: a.characterId });
      return { ok: true, token: await issueToken(tx, { campaignId: cid, characterId: a.characterId }) };
    }

    case "token.revoke":
      await ownCharacter(tx, { campaignId: cid, id: a.characterId });
      await tx.update(accessToken).set({ revokedAt: new Date() })
        .where(and(eq(accessToken.characterId, a.characterId), isNull(accessToken.revokedAt)));
      return { ok: true };
  }
}
