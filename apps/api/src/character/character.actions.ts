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
  upgradeRefusal,
  wargearMatches,
  withUpgrades,
  type Action,
  type ActionResult,
  type Character,
  type Wargear,
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
    ownedUpgrades: [], // the damage rules don't read it; the table's copy comes from toCharacter
    draft: row.buildDraft,
    builtAt: row.builtAt?.getTime() ?? null,
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

// CharacterStats.gear's cap, so a write that would overflow it says so rather than failing the whole sheet's parse.
const MAX_GEAR = 60;

// Catalogue entries by name, for a sheet weapon made before `wargearId` was stored. 120 names are shared by two books
// (apoc-force-shield and ioe-force-shield), so an ambiguous one is refused rather than guessed: checking a fit against
// the wrong book's keywords would accept upgrades the printed item can't take.
const byName = new Map<string, Wargear[]>();
for (const w of wargear.values()) byName.set(w.name, [...(byName.get(w.name) ?? []), w]);

// What the table sees is the derived sheet (`withUpgrades` in table.state), and the GM's character editor sends a patch
// built from it, so an incoming weapon may carry upgrades already applied. Storing that would apply them twice on the
// next read. `upgradeNames` is set only by `withUpgrades`, so it marks a derived profile: those weapons are replaced by
// the stored ones, which is what the editor means anyway — it edits attributes, skills, talents and abilities.
function storedProfiles(incoming: CharacterStats, stored: CharacterStats): CharacterStats {
  if (!incoming.weapons.some((w) => w.upgradeNames)) return incoming;
  return {
    ...incoming,
    weapons: incoming.weapons.map((w) => {
      if (!w.upgradeNames) return w;
      const { upgradeNames: _names, notes: _notes, ...rest } = w;
      const was = stored.weapons.find((s) => (w.wargearId ? s.wargearId === w.wargearId : s.name === w.name));
      return was ?? rest;
    }),
  };
}

// Fits one upgrade to one of the character's weapons, or refuses (Core pp.227–228, §11.63–§11.65). Shared by
// `character.fitUpgrade` and a requisition that hands the item straight to a weapon, so both check the same things.
// It writes the id into `fitted` and never the result: `withUpgrades` derives what the sheet shows.
function fitUpgrade(
  stats: CharacterStats,
  { weapon: name, entry, tier }: { weapon: string; entry: Wargear; tier: number },
): CharacterStats {
  const at = stats.weapons.findIndex((w) => w.name === name);
  if (at < 0) fail(`No weapon called "${name}"`);
  const weapon = stats.weapons[at]!;
  if (!entry.upgrade) fail(`${entry.name} isn't an upgrade`);
  const base = baseOf(weapon);
  // An upgrade goes on a weapon unless its own `fits` names other kinds: "any ranged weapon" doesn't make a Frag
  // Grenade (kind `grenade`, and ranged when thrown) a candidate for a Red-Dot Sight.
  const kinds = entry.upgrade.fits.kinds ?? ["weapon"];
  if (!kinds.includes(base.kind))
    fail(`${entry.name} fits ${kinds.join(" or ")}; ${base.name} is ${base.kind} (issue #15)`);
  // What `fits` is checked against is the weapon as it is now, upgrades included, so a Trait an earlier upgrade added
  // or removed counts: the Anti-Grav Platform takes Heavy off, which is what a not-Heavy upgrade needs.
  const fitted = [...(weapon.upgrades ?? []), ...(weapon.fitted ?? [])]
    .map((u) => wargear.get(u))
    .filter((w) => w !== undefined);
  const shown = withUpgrades({ weapons: [weapon] }, wargear).weapons[0]!;
  const refusal = upgradeRefusal({
    upgrade: entry,
    item: { ...base, weapon: { ...base.weapon!, traits: shown.traits } },
    fitted,
    matches: (w, f) => wargearMatches(w, f, { tier, newTier: tier }),
  });
  if (refusal) fail(refusal);
  return {
    ...stats,
    weapons: stats.weapons.with(at, {
      ...weapon,
      wargearId: base.id,
      fitted: [...(weapon.fitted ?? []), entry.id],
    }),
  };
}

// The catalogue entry a sheet weapon came from, or a refusal. It must hold a weapon profile for a fit to be checked.
function baseOf(weapon: { name: string; wargearId?: string }): Wargear {
  const byId = weapon.wargearId ? wargear.get(weapon.wargearId) : undefined;
  const named = byName.get(weapon.name) ?? [];
  const found = byId ?? (named.length === 1 ? named[0] : undefined);
  if (!found)
    fail(
      named.length > 1
        ? `More than one catalogue item is called "${weapon.name}", so the fit can't be checked: rebuild the sheet`
        : `The catalogue doesn't hold "${weapon.name}", so the fit can't be checked: rebuild the sheet`,
    );
  if (!found.weapon) fail(`"${found.name}" isn't a weapon in the catalogue`);
  return found;
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
      // A sheet sent back from the table carries its upgrades applied; only the printed profile is stored.
      if (patch.stats) {
        const row = await ownCharacter(tx, { campaignId: cid, id });
        patch.stats = storedProfiles(patch.stats, CharacterStats.parse(row.stats));
      }
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
      const play = row ? { tier, xpEarned: row.xp } : undefined;
      const r = resolveBuild({ catalogue: buildCatalogue(homebrew), build, play });
      const refusal = buildRefusal(r);
      if (refusal) fail(refusal);
      // A character already made keeps what play changed (keepPlay), and gains only what the new build adds over the
      // stored one; a first build keeps only Ammo and requisitions, or with `keepSheet` the hand-made sheet's lines too.
      const old = row ? CharacterStats.parse(row.stats) : undefined;
      const stats = !old
        ? r.sheet
        : made?.success
          ? keepPlay({
              previous: old,
              next: r.sheet,
              before: resolveBuild({ catalogue: buildCatalogue(homebrew), build: made.data, play }).sheet,
            })
          : a.keepSheet
            ? keepPlay({ previous: old, next: r.sheet, before: r.sheet })
            : { ...r.sheet, ammo: old.ammo, requisitioned: old.requisitioned };
      // What advancement spent of the XP earned in play (§11.55), so the sheet and PARTY can show what's left without
      // the catalogue. `advancement` is null for a build with no `play` — a character being made has spent nothing yet.
      const xpSpent = r.advancement?.spent ?? 0;
      if (row) {
        await tx
          .update(character)
          .set({
            stats,
            build,
            xpSpent,
            buildDraft: null,
            builtAt: new Date(),
            ...(a.name ? { name: a.name } : {}),
            ...(a.detail ? { detail: a.detail } : {}),
          })
          .where(eq(character.id, row.id));
        return { ok: true, id: row.id };
      }
      const [c] = await tx
        .insert(character)
        .values({
          campaignId: cid,
          name: a.name ?? "Unnamed",
          stats,
          build,
          xpSpent,
          detail: a.detail ?? {},
          builtAt: new Date(),
        })
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
      // Fitting on success is checked here, before the session's Test is spent: a target that can't take the upgrade
      // refuses the whole action, so the GM can record it again rather than losing the Test (p.205).
      const { tier } = await campaignRules(tx, cid);
      if (a.fitTo !== undefined) {
        if (!item?.upgrade) fail("Only an upgrade can be fitted to a weapon");
        fitUpgrade(stats, { weapon: a.fitTo, entry: item, tier });
      }

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
            // `wargearId` is what a later fitUpgrade checks the upgrade's `fits` against (§11.63).
            {
              ...sheetWeapon(item as { name: string; weapon: WargearWeapon }, effectiveStrength(stats)),
              wargearId: item.id,
            },
          ];
        if (a.kind === "wargear") {
          // An upgrade the GM named a weapon for goes straight on it; anything else is a gear line.
          if (a.fitTo !== undefined && item?.upgrade)
            Object.assign(stats, fitUpgrade(stats, { weapon: a.fitTo, entry: item, tier }));
          else if (!item?.weapon) stats.gear = [...stats.gear, item ? gearLine(item) : a.item];
          if (a.loadedWith) stats.ammo = adjustAmmo(stats.ammo, { kind: a.loadedWith, delta: 1 });
        } else stats.ammo = adjustAmmo(stats.ammo, { kind: a.item, delta: requisitionYield(a.kind, a.rarity) });
      }
      await saveStats(tx, { id: a.id, stats });
      return { ok: true };
    }

    // Fitting is instant and takes no Test (§11.63), so this only checks what the book checks: the fit, the maximum of
    // three and one per slot. What is written is the id, in `fitted`; the profile stays as printed and `withUpgrades`
    // derives what the sheet shows, so nothing is applied twice.
    case "character.fitUpgrade":
    case "character.removeUpgrade": {
      const row = await ownCharacter(tx, { campaignId: cid, id: a.id });
      const stats = CharacterStats.parse(row.stats);
      const at = stats.weapons.findIndex((w) => w.name === a.weapon);
      if (at < 0) fail(`${row.name} has no weapon called "${a.weapon}"`);
      const weapon = stats.weapons[at]!;
      const entry = wargear.get(a.upgradeId) ?? fail("Unknown upgrade");
      if (!entry.upgrade) fail(`${entry.name} isn't an upgrade`);

      if (a.type === "character.removeUpgrade") {
        // Only what was fitted in play comes off here: an upgrade the build gives the weapon (§11.42) goes in the
        // builder, or the next rebuild would put it back.
        const which = (weapon.fitted ?? []).indexOf(a.upgradeId);
        if (which < 0)
          fail(
            (weapon.upgrades ?? []).includes(a.upgradeId)
              ? `${entry.name} is part of ${weapon.name} as it was built: change the build to take it off`
              : `${weapon.name} has no ${entry.name} fitted`,
          );
        if (stats.gear.length >= MAX_GEAR) fail(`${row.name}'s gear list is full (${MAX_GEAR} lines)`);
        const left = (weapon.fitted ?? []).filter((_, i) => i !== which);
        stats.weapons = stats.weapons.with(at, { ...weapon, fitted: left.length ? left : undefined });
        // It comes off the weapon and back into the character's gear, where a requisitioned upgrade starts.
        stats.gear = [...stats.gear, gearLine(entry)];
        await saveStats(tx, { id: a.id, stats });
        return { ok: true };
      }

      const { tier } = await campaignRules(tx, cid);
      // The upgrade must be one the character owns: it arrives as a gear line from a requisition (p.205). The GM may
      // fit one that isn't there, the way they grant anything else (§11.57).
      const owned = stats.gear.findIndex((g) => g === entry.name || g.startsWith(`${entry.name} (`));
      if (owned < 0 && ctx.role !== "gm") fail(`${row.name} doesn't have ${entry.name} to fit`);
      if (owned >= 0) stats.gear = stats.gear.filter((_, i) => i !== owned);
      await saveStats(tx, { id: a.id, stats: fitUpgrade(stats, { weapon: a.weapon, entry, tier }) });
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
