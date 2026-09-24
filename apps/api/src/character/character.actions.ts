import { and, eq, isNull, sql } from "drizzle-orm";
import { CharacterStats, Overrides, deriveStats, pcStatus, type Action, type ActionResult } from "@wg/shared";
import { accessToken } from "../auth/auth.schema.ts";
import { issueToken, type Ctx } from "../auth/auth.service.ts";
import { campaignTier } from "../campaign/campaign.actions.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { bump } from "../core/sql.ts";
import { character } from "./character.schema.ts";

export type CharacterAction = Extract<Action, { type: `character.${string}` | `token.${string}` }>;

export async function ownCharacter(tx: Tx, { campaignId, id }: { campaignId: string; id: string }) {
  const [c] = await tx.select().from(character).where(and(eq(character.id, id), eq(character.campaignId, campaignId)));
  return c ?? fail("Character not found");
}

// Max Wounds and the damage state (Dying, Dead) of a character row, at the campaign's Tier.
async function healthOf(tx: Tx, { campaignId, row }: { campaignId: string; row: typeof character.$inferSelect }) {
  const stats = CharacterStats.parse(row.stats);
  const overrides = Overrides.parse(row.overrides);
  const derived = deriveStats({ stats, overrides, tier: await campaignTier(tx, campaignId) });
  const status = pcStatus({ ...row, stats, overrides }, derived);
  return { derived, dying: status.includes("Dying"), dead: status.includes("Dead") };
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
      let wounds = bump(character.wounds, a.wounds);
      let traumatic = bump(character.traumatic, a.traumatic);
      let conditions: string[] | undefined;
      // Reading the row first is safe: the gateway runs one action per campaign at a time.
      const { derived, dying } = await healthOf(tx, { campaignId: cid, row });
      if (dying && a.wounds !== undefined && a.wounds > 0) {
        // A Wound while Dying is a Traumatic Injury instead, one per hit (p.193).
        wounds = undefined;
        traumatic = sql`greatest(0, ${character.traumatic} + ${(a.traumatic ?? 0) + 1})`;
      } else if (dying && a.wounds !== undefined && a.wounds < 0) {
        // Recovering any Wounds ends Dying (p.193).
        wounds = sql`greatest(0, least(${derived.maxWounds}, ${character.wounds} + ${a.wounds}))`;
      } else if (!dying && a.wounds !== undefined && row.wounds + a.wounds > derived.maxWounds && !row.conditions.includes("Prone")) {
        // Becoming Dying: fall Prone (p.193).
        conditions = [...row.conditions, "Prone"];
      }
      await tx.update(character)
        .set({ wounds, shock: bump(character.shock, a.shock), wrath: bump(character.wrath, a.wrath), traumatic, conditions })
        .where(eq(character.id, a.id));
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
      return { ok: true, token: await issueToken(tx, { campaignId: cid, role: "player", characterId: a.characterId }) };
    }

    case "token.revoke":
      await ownCharacter(tx, { campaignId: cid, id: a.characterId });
      await tx.update(accessToken).set({ revokedAt: new Date() })
        .where(and(eq(accessToken.characterId, a.characterId), isNull(accessToken.revokedAt)));
      return { ok: true };
  }
}
