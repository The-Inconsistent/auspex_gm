import { and, eq, isNull, sql } from "drizzle-orm";
import {
  CharacterBuild,
  CharacterDetail,
  CharacterStats,
  Objectives,
  Overrides,
  adjustAmmo,
  creationKey,
  keepPlay,
  deriveStats,
  effectiveStrength,
  gearLine,
  pcHit,
  pcStatus,
  requisitionOutcome,
  requisitionSlot,
  requisitionTest,
  requisitionYield,
  resolveBuild,
  sheetWeapon,
  type Action,
  type ActionResult,
  type Character,
  type WargearWeapon,
} from "@wg/shared";
import { wargear } from "@wg/data";
import { accessToken } from "../auth/auth.schema.ts";
import { issueToken, type Ctx } from "../auth/auth.service.ts";
import { campaignRules, campaignTier } from "../campaign/campaign.actions.ts";
import { session } from "../campaign/campaign.schema.ts";
import { handout } from "../codex/codex.schema.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { bump } from "../core/sql.ts";
import { character } from "./character.schema.ts";
import { buildCatalogue, buildRefusal } from "./creation.service.ts";

export type CharacterAction = Extract<Action, { type: `character.${string}` | `token.${string}` }>;

export async function ownCharacter(tx: Tx, { campaignId, id }: { campaignId: string; id: string }) {
  const [c] = await tx
    .select()
    .from(character)
    .where(and(eq(character.id, id), eq(character.campaignId, campaignId)));
  return c ?? fail("Character not found");
}

// A character row with its derived Traits and damage state (Dying, Dead), at the campaign's Tier.
async function healthOf(tx: Tx, { campaignId, row }: { campaignId: string; row: typeof character.$inferSelect }) {
  const c: Character = {
    ...row,
    stats: CharacterStats.parse(row.stats),
    overrides: Overrides.parse(row.overrides),
    detail: CharacterDetail.parse(row.detail),
    objectives: Objectives.parse(row.objectives),
    draft: row.buildDraft,
  };
  const derived = deriveStats({ stats: c.stats, overrides: c.overrides, tier: await campaignTier(tx, campaignId) });
  const status = pcStatus(c, derived);
  return { c, derived, dying: status.includes("Dying"), dead: status.includes("Dead") };
}

// The GM's part of a saved build, or none. A build saved under an older schema just loses it.
function storedGm(build: Record<string, unknown> | null | undefined) {
  const r = CharacterBuild.shape.gm.safeParse(build?.gm);
  return r.success ? r.data : CharacterBuild.shape.gm.parse(undefined);
}

// Writes stats back after a counter change, refusing anything the sheet schema wouldn't load (too many ammo types, a
// full gear list).
async function saveStats(tx: Tx, { id, stats }: { id: string; stats: CharacterStats }) {
  const r = CharacterStats.safeParse(stats);
  if (!r.success) fail(r.error.issues[0]?.message ?? "Invalid character sheet");
  await tx.update(character).set({ stats: r.data }).where(eq(character.id, id));
}

export async function applyCharacterAction(
  tx: Tx,
  { ctx, action: a }: { ctx: Ctx; action: CharacterAction },
): Promise<ActionResult> {
  const cid = ctx.campaignId;
  const inCampaign = (id: string) => and(eq(character.id, id), eq(character.campaignId, cid));

  switch (a.type) {
    case "character.create": {
      const [c] = await tx
        .insert(character)
        .values({
          campaignId: cid,
          name: a.name,
          stats: a.stats ?? {},
          detail: a.detail ?? {},
          objectives: a.objectives ?? [],
        })
        .returning({ id: character.id });
      return { ok: true, id: c!.id }; // the row was just inserted
    }

    case "character.update": {
      const { type, id, ...patch } = a;
      if (Object.keys(patch).length === 0) return { ok: true };
      const r = await tx.update(character).set(patch).where(inCampaign(id)).returning({ id: character.id });
      return r.length ? { ok: true } : fail("Character not found");
    }

    // The server decides: it re-resolves the build and writes the sheet it derives, never the client's.
    case "character.build": {
      const { tier, homebrew } = await campaignRules(tx, cid);
      const row = a.id ? await ownCharacter(tx, { campaignId: cid, id: a.id }) : undefined;
      // A player's build keeps the GM's part (rulings and ticks) as the GM last saved it.
      const build = ctx.role === "gm" ? a.build : { ...a.build, gm: storedGm(row?.build) };
      // Once made, a character keeps the Tier it was made at, and only the GM changes its creation choices; a player
      // spends the XP earned in play (issue #9 step 5).
      const made = row?.build ? CharacterBuild.safeParse(row.build) : undefined;
      if (made?.success) {
        if (build.tier !== made.data.tier) fail(`This character was made at Tier ${made.data.tier}`);
        if (ctx.role !== "gm" && creationKey(build) !== creationKey(made.data))
          fail("Only your GM changes a character's creation choices once it's made");
      } else if (build.tier !== tier) fail(`This campaign is Tier ${tier}; build for Tier ${tier}`);
      const r = resolveBuild({
        catalogue: buildCatalogue(homebrew),
        build,
        play: row ? { tier, xpEarned: row.xp } : undefined,
      });
      const refusal = buildRefusal(r);
      if (refusal) fail(refusal);
      // A character already made keeps what play changed (keepPlay); a first build keeps only Ammo and requisitions.
      const old = row ? CharacterStats.parse(row.stats) : undefined;
      const stats = !old
        ? r.sheet
        : made?.success
          ? keepPlay({ previous: old, next: r.sheet })
          : { ...r.sheet, ammo: old.ammo, requisitioned: old.requisitioned };
      if (row) {
        await tx
          .update(character)
          .set({
            stats,
            build,
            buildDraft: null,
            ...(a.name ? { name: a.name } : {}),
            ...(a.detail ? { detail: a.detail } : {}),
          })
          .where(eq(character.id, row.id));
        return { ok: true, id: row.id };
      }
      const [c] = await tx
        .insert(character)
        .values({ campaignId: cid, name: a.name ?? "Unnamed", stats, build, detail: a.detail ?? {} })
        .returning({ id: character.id });
      return { ok: true, id: c!.id }; // the row was just inserted
    }

    // A draft waits on the character for the GM. A player's keeps the GM's part as it stands (the stored draft's, or the
    // saved build's), so ticks and rulings stay the GM's.
    case "character.draft": {
      const row = await ownCharacter(tx, { campaignId: cid, id: a.id });
      const gm = row.buildDraft?.gm ?? row.build?.gm;
      const draft = a.draft && ctx.role !== "gm" ? { ...a.draft, gm: gm ?? {} } : a.draft;
      await tx.update(character).set({ buildDraft: draft }).where(eq(character.id, row.id));
      return { ok: true };
    }

    case "character.adjust": {
      const row = await ownCharacter(tx, { campaignId: cid, id: a.id });
      const wrath = bump(character.wrath, a.wrath);
      if (a.raw) {
        await tx
          .update(character)
          .set({
            wounds: bump(character.wounds, a.wounds),
            shock: bump(character.shock, a.shock),
            traumatic: bump(character.traumatic, a.traumatic),
            wrath,
          })
          .where(eq(character.id, a.id));
        return { ok: true };
      }
      // Writing counters read from the row is safe: the gateway runs one action per campaign at a time.
      const { c, derived } = await healthOf(tx, { campaignId: cid, row });
      const hit = pcHit({ c, d: derived, hit: a });
      await tx
        .update(character)
        .set({
          wounds: hit.wounds,
          shock: hit.shock,
          traumatic: Math.max(0, hit.traumatic + (a.traumatic ?? 0)),
          annihilated: hit.annihilated,
          wrath,
          conditions: hit.prone && !c.conditions.includes("Prone") ? [...c.conditions, "Prone"] : undefined,
        })
        .where(eq(character.id, a.id));
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
      const [open] = await tx
        .select({ id: session.id })
        .from(session)
        .where(and(eq(session.campaignId, cid), isNull(session.endedAt)));
      if (!open) fail("Start a session first: one Test of each kind per session (p.205)");
      const slot = requisitionSlot(a.kind);
      if (stats.requisitioned[slot] === open.id) fail(`${row.name} already made this session's ${slot} Test (p.205)`);
      const item = a.wargearId ? (wargear.get(a.wargearId) ?? fail("Unknown wargear")) : undefined;
      const t = requisitionTest({
        keywords: stats.keywords,
        itemKeywords: a.keywords,
        value: a.value,
        rarity: a.rarity,
      });
      if (!t.eligible) fail("No Keyword in common with the item: it can't be requisitioned (p.205)");
      if (a.spend > stats.wealth) fail(`${row.name} has only ${stats.wealth} Wealth`);
      if (a.spend > 0 && a.icons >= t.dn) fail("Wealth only buys Icons on a failed Test (p.205)");

      const out = requisitionOutcome({
        dn: t.dn,
        icons: a.icons,
        spend: a.spend,
        complication: a.complication,
        wealth: stats.wealth,
      });
      stats.wealth = out.wealth;
      stats.requisitioned = { ...stats.requisitioned, [slot]: open.id };
      if (out.success) {
        // A catalogue weapon (or grenade) joins the armament once; everything else is a gear line.
        if (item?.weapon && !stats.weapons.some((w) => w.name === item.name))
          stats.weapons = [
            ...stats.weapons,
            sheetWeapon(item as { name: string; weapon: WargearWeapon }, effectiveStrength(stats)),
          ];
        if (a.kind === "wargear") {
          if (!item?.weapon) stats.gear = [...stats.gear, item ? gearLine(item) : a.item];
          if (a.loadedWith) stats.ammo = adjustAmmo(stats.ammo, { kind: a.loadedWith, delta: 1 });
        } else stats.ammo = adjustAmmo(stats.ammo, { kind: a.item, delta: requisitionYield(a.kind, a.rarity) });
      }
      await saveStats(tx, { id: a.id, stats });
      return { ok: true };
    }

    case "character.objectives": {
      const r = await tx
        .update(character)
        .set({ objectives: a.objectives })
        .where(inCampaign(a.characterId))
        .returning({ id: character.id });
      return r.length ? { ok: true } : fail("Character not found");
    }

    case "character.respite": {
      const { dying, dead } = await healthOf(tx, {
        campaignId: cid,
        row: await ownCharacter(tx, { campaignId: cid, id: a.id }),
      });
      if (dead) fail("A Dead character can't Respite (p.193)");
      if (dying) fail("A Dying character can't benefit from a Respite (p.197)");
      await tx.update(character).set({ wounds: 0, shock: 0, wrath: 2 }).where(eq(character.id, a.id));
      return { ok: true };
    }

    case "character.delete": {
      const r = await tx.delete(character).where(inCampaign(a.id)).returning({ id: character.id });
      if (!r.length) fail("Character not found");
      // Handout audiences have no FK. A handout meant only for this Agent is hidden again rather than left with an
      // empty audience, which would show it to everyone (the SET reads the old audience).
      await tx
        .update(handout)
        .set({
          audience: sql`array_remove(${handout.audience}, ${a.id}::uuid)`,
          revealed: sql`${handout.revealed} and cardinality(${handout.audience}) > 1`,
        })
        .where(and(eq(handout.campaignId, cid), sql`${a.id}::uuid = any(${handout.audience})`));
      return { ok: true };
    }

    case "token.issue": {
      await ownCharacter(tx, { campaignId: cid, id: a.characterId });
      return { ok: true, token: await issueToken(tx, { campaignId: cid, characterId: a.characterId }) };
    }

    case "token.revoke":
      await ownCharacter(tx, { campaignId: cid, id: a.characterId });
      await tx
        .update(accessToken)
        .set({ revokedAt: new Date() })
        .where(and(eq(accessToken.characterId, a.characterId), isNull(accessToken.revokedAt)));
      return { ok: true };
  }
}
