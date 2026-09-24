import { and, eq, isNull } from "drizzle-orm";
import { CharacterStats, Overrides, deriveStats, type Action, type ActionResult } from "@wg/shared";
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
      const r = await tx
        .update(character)
        .set({
          wounds: bump(character.wounds, a.wounds), shock: bump(character.shock, a.shock),
          wrath: bump(character.wrath, a.wrath), traumatic: bump(character.traumatic, a.traumatic),
        })
        .where(inCampaign(a.id))
        .returning({ id: character.id });
      return r.length ? { ok: true } : fail("Character not found");
    }

    case "character.respite": {
      const c = await ownCharacter(tx, { campaignId: cid, id: a.id });
      const d = deriveStats({
        stats: CharacterStats.parse(c.stats), overrides: Overrides.parse(c.overrides), tier: await campaignTier(tx, cid),
      });
      if (c.wounds > d.maxWounds) fail("A Dying character can't benefit from a Respite (p.197)");
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
