import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  CharacterBuild,
  CharacterDetail,
  CharacterStats,
  Objectives,
  Overrides,
  adjustAmmo,
  corruptionGain,
  corruptionLevel,
  corruptionTestDn,
  findMutation,
  sheetMutation,
  MAX_MUTATIONS,
  MAX_OBJECTIVES,
  mutationDns,
  creationKey,
  keepPlay,
  keepSheetWeapons,
  deriveStats,
  gearLine,
  pcHit,
  isGone,
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
  type ResolvedBuild,
  type UpgradeHost,
  UpgradeMod,
  type Wargear,
  type WargearWeapon,
} from "@wg/shared";
import { mutationTables, wargear } from "@wg/data";
import { accessToken } from "../auth/auth.schema.ts";
import { issueToken, type Ctx } from "../auth/auth.service.ts";
import { adjustPool, campaignRules, campaignTier } from "../campaign/campaign.actions.ts";
import { session } from "../campaign/campaign.schema.ts";
import { adventure, beat, handout, item } from "../codex/codex.schema.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { bump } from "../core/sql.ts";
import { character } from "./character.schema.ts";
import { buildCatalogue, buildRefusal, factionObjective } from "./creation.service.ts";

export type CharacterAction = Extract<Action, { type: `character.${string}` | `token.${string}` }>;

// The Mutation tables, loaded once like the Wargear catalogue (Core pp.287–295).
const MUTATIONS = mutationTables();

export async function ownCharacter(tx: Tx, { campaignId, id }: { campaignId: string; id: string }) {
  const [c] = await tx
    .select()
    .from(character)
    .where(and(eq(character.id, id), eq(character.campaignId, campaignId)));
  return c ?? fail("Character not found");
}

// A codex item of this campaign (issue #51), or a refusal.
async function campaignItem(tx: Tx, { campaignId, id }: { campaignId: string; id: string }) {
  const [found] = await tx
    .select()
    .from(item)
    .where(and(eq(item.id, id), eq(item.campaignId, campaignId)));
  return found ?? fail("Item not found");
}

// A character row with its derived Traits and damage state (Dying, Dead), at the campaign's Tier.
async function healthOf(tx: Tx, { campaignId, row }: { campaignId: string; row: typeof character.$inferSelect }) {
  const c: Character = {
    ...row,
    // The upgrades fitted are applied here too, because Resilience counts the AR as worn (deriveStats, Core p.231) and
    // the phones read the derived sheet: deriving from the stored one would disagree with them about a Wound.
    stats: withUpgrades(CharacterStats.parse(row.stats), wargear),
    overrides: Overrides.parse(row.overrides),
    detail: CharacterDetail.parse(row.detail),
    objectives: Objectives.parse(row.objectives),
    ownedUpgrades: [], // the damage rules don't read it; the table's copy comes from toCharacter
    draft: row.buildDraft,
    builtAt: row.builtAt?.getTime() ?? null,
  };
  const derived = deriveStats({ stats: c.stats, overrides: c.overrides, tier: await campaignTier(tx, campaignId) });
  const status = pcStatus(c, derived);
  return { c, derived, dying: status.includes("Dying"), dead: isGone(status) };
}

// The GM's part of a saved build, or none. A build saved under an older schema just loses it.
function storedGm(build: Record<string, unknown> | null | undefined) {
  const r = CharacterBuild.shape.gm.safeParse(build?.gm);
  return r.success ? r.data : CharacterBuild.shape.gm.parse(undefined);
}

// The purchase history as the server last stamped it, or none (§11.69). It is never the client's: a build saved under an
// older schema, or by a client that made one up, starts from what is stored.
function storedBoughtIn(build: Record<string, unknown> | null | undefined): Record<string, number> {
  const r = CharacterBuild.shape.advancement.safeParse(build?.advancement);
  return r.success ? r.data.boughtIn : {};
}

// The purchase history after this save (§11.69): the stamps the resolved ledger still names, plus the session number for
// everything new. The open session, else the last one played, because XP is awarded at a session's end (Core p.321) and a
// purchase made between sessions belongs to the session that paid for it. A campaign with no session yet leaves them
// undated, and a date is never read from the client.
async function stampHistory(
  tx: Tx,
  campaignId: string,
  r: ResolvedBuild,
  build: CharacterBuild,
): Promise<Record<string, number>> {
  const keys = new Set(r.ledger.filter((l) => l.pool === "advancement" && l.key).map((l) => l.key!));
  const boughtIn: Record<string, number> = {};
  for (const [k, n] of Object.entries(build.advancement.boughtIn)) if (keys.has(k)) boughtIn[k] = n;
  const fresh = [...keys].filter((k) => boughtIn[k] === undefined);
  if (!fresh.length) return boughtIn; // a creation save, or a re-save that bought nothing new, costs no query
  const [latest] = await tx
    .select({ number: session.number })
    .from(session)
    .where(eq(session.campaignId, campaignId))
    .orderBy(desc(session.number))
    .limit(1);
  if (latest) for (const k of fresh) boughtIn[k] = latest.number;
  return boughtIn;
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
// next read. `upgradeNames` is set only by `withUpgrades`, and `effects` only by `withWeaponEffects` (rules-flow.md
// §11.68), so either marks a derived profile: those weapons are replaced by
// the stored ones, which is what the editor means anyway — it edits attributes, skills, talents and abilities.
function storedProfiles(incoming: CharacterStats, stored: CharacterStats): CharacterStats {
  // The suit the same way: it carries upgrades now too (§11.65), and its `ar` arrives already upgraded.
  const suit = incoming.armour.upgradeNames
    ? { armour: stored.armour.name === incoming.armour.name ? stored.armour : plain(incoming.armour) }
    : {};
  if (!incoming.weapons.some((w) => w.upgradeNames || w.effects)) return { ...incoming, ...suit };
  return {
    ...incoming,
    ...suit,
    weapons: incoming.weapons.map((w) => {
      if (!w.upgradeNames && !w.effects) return w;
      const { upgradeNames: _names, effects: _effects, notes: _notes, ...rest } = w;
      // By name first, which is the line's own on a sheet: two lines can share an entry (a knife and its off-hand twin).
      const was =
        stored.weapons.find((s) => s.name === w.name) ??
        (w.wargearId ? stored.weapons.find((s) => s.wargearId === w.wargearId) : undefined);
      return was ?? rest;
    }),
  };
}

// A derived profile with the derived fields taken off, for a host the stored sheet no longer holds.
const plain = <T extends { upgradeNames?: string[]; notes?: string[] }>(item: T): T => {
  const { upgradeNames: _names, notes: _notes, ...rest } = item;
  return rest as T;
};

// The upgrades already on a host, as catalogue entries: what the cap and one-per-slot rules count.
const fittedTo = (host: { upgrades?: string[]; fitted?: string[] }) =>
  [...(host.upgrades ?? []), ...(host.fitted ?? [])].map((u) => wargear.get(u)).filter((w) => w !== undefined);

// Fits one upgrade to one of the character's weapons or to the armour they wear, or refuses (Core pp.227–228,
// §11.63–§11.65). Shared by `character.fitUpgrade` and a requisition that hands the item straight to a weapon, so both
// check the same things. It writes the id into `fitted` and never the result: `withUpgrades` derives what the sheet shows.
function fitUpgrade(
  stats: CharacterStats,
  { host = "weapon", weapon: name, entry, tier }: { host?: UpgradeHost; weapon?: string; entry: Wargear; tier: number },
): CharacterStats {
  if (!entry.upgrade) fail(`${entry.name} isn't an upgrade`);
  // An upgrade goes on a weapon unless its own `fits` names other kinds: "any ranged weapon" doesn't make a Frag
  // Grenade (kind `grenade`, and ranged when thrown) a candidate for a Red-Dot Sight.
  const kinds = entry.upgrade.fits.kinds ?? ["weapon"];
  const check = (base: Wargear, item: Wargear, fitted: Wargear[]) => {
    if (!kinds.includes(base.kind))
      fail(`${entry.name} fits ${kinds.join(" or ")}; ${base.name} is ${base.kind} (rules-flow.md §11.64)`);
    const refusal = upgradeRefusal({
      upgrade: entry,
      item,
      fitted,
      matches: (w, f) => wargearMatches(w, f, { tier, newTier: tier }),
      host,
    });
    if (refusal) fail(refusal);
  };
  if (host === "armour") {
    const armour = stats.armour;
    if (!armour.name) fail(`${entry.name} fits armour, and this character wears none`);
    const base = baseOf(armour, "armour");
    // What `fits` is checked against is the suit as it is now, upgrades included, the way a weapon's is.
    const shown = withUpgrades({ weapons: [], armour }, wargear).armour!;
    check(base, { ...base, armour: { ...base.armour!, traits: shown.traits } }, fittedTo(armour));
    return {
      ...stats,
      armour: { ...armour, wargearId: base.id, fitted: [...(armour.fitted ?? []), entry.id] },
    };
  }
  const at = stats.weapons.findIndex((w) => w.name === name);
  if (at < 0) fail(`No weapon called "${name}"`);
  const weapon = stats.weapons[at]!;
  const base = baseOf(weapon, "weapon");
  // What `fits` is checked against is the weapon as it is now, upgrades included, so a Trait an earlier upgrade added
  // or removed counts: the Anti-Grav Platform takes Heavy off, which is what a not-Heavy upgrade needs.
  const shown = withUpgrades({ weapons: [weapon] }, wargear).weapons[0]!;
  check(base, { ...base, weapon: { ...base.weapon!, traits: shown.traits } }, fittedTo(weapon));
  return {
    ...stats,
    weapons: stats.weapons.with(at, {
      ...weapon,
      wargearId: base.id,
      fitted: [...(weapon.fitted ?? []), entry.id],
    }),
  };
}

// A catalogue weapon (or grenade) joins the armament once, by name, with its `wargearId`, which a later fitUpgrade checks
// the upgrade's `fits` against (§11.63). A given relic brings its Powers as `mods` (rules-flow.md §11.116).
function joinWeapon(stats: CharacterStats, { entry, mods = [] }: { entry?: Wargear; mods?: UpgradeMod[] }) {
  if (!entry?.weapon || stats.weapons.some((w) => w.name === entry.name)) return stats;
  // The stored Strength, not a mutation's: the thrown range is written into the line, and a mutation can be cut off.
  const weapon = sheetWeapon(
    entry as { name: string; weapon: WargearWeapon },
    stats.attributes.S + stats.armour.powered,
  );
  return {
    ...stats,
    weapons: [...stats.weapons, { ...weapon, wargearId: entry.id, ...(mods.length ? { mods } : {}) }],
  };
}

// What a successful Wargear requisition or a GIVE puts on the sheet (Core p.205, rules-flow.md §11.112): a weapon joins
// the armament, an upgrade the GM named a weapon for goes straight on it, and anything else is a gear line, the
// catalogue's with its cite or the name as typed.
function grantWargear(
  stats: CharacterStats,
  {
    entry,
    name,
    mods,
    fit,
  }: { entry?: Wargear; name: string; mods?: UpgradeMod[]; fit?: { weapon: string; tier: number } },
): CharacterStats {
  const armed = joinWeapon(stats, { entry, mods });
  if (fit && entry?.upgrade) return fitUpgrade(armed, { weapon: fit.weapon, entry, tier: fit.tier });
  if (entry?.weapon) return armed;
  return { ...armed, gear: [...armed.gear, entry ? gearLine(entry) : name] };
}

// The catalogue entry a sheet weapon or suit came from, or a refusal. It must hold that host's profile for a fit to be
// checked.
function baseOf(item: { name: string; wargearId?: string }, host: UpgradeHost): Wargear {
  const byId = item.wargearId ? wargear.get(item.wargearId) : undefined;
  const named = byName.get(item.name) ?? [];
  const found = byId ?? (named.length === 1 ? named[0] : undefined);
  if (!found)
    fail(
      named.length > 1
        ? `More than one catalogue item is called "${item.name}", so the fit can't be checked: rebuild the sheet`
        : `The catalogue doesn't hold "${item.name}", so the fit can't be checked: rebuild the sheet`,
    );
  if (host === "armour" && !found.armour) fail(`"${found.name}" isn't armour in the catalogue`);
  if (host === "weapon" && !found.weapon) fail(`"${found.name}" isn't a weapon in the catalogue`);
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
      // A player's build keeps the GM's part (rulings and ticks) as the GM last saved it, and both roles' builds keep the
      // purchase history as the server stamped it: when something was bought is the table's fact, not the builder's.
      const build = {
        ...(ctx.role === "gm" ? a.build : { ...a.build, gm: storedGm(row?.build) }),
        advancement: { ...a.build.advancement, boughtIn: storedBoughtIn(row?.build) },
      };
      // Once made, a character keeps the Tier it was made at, and only the GM changes its creation choices; a player
      // spends the XP earned in play (issue #9 step 5).
      const made = row?.build ? CharacterBuild.safeParse(row.build) : undefined;
      if (made?.success) {
        if (build.tier !== made.data.tier) fail(`This character was made at Tier ${made.data.tier}`);
        if (ctx.role !== "gm" && creationKey(build) !== creationKey(made.data))
          fail("Only your GM changes a character's creation choices once it's made");
      } else if (build.tier !== tier) fail(`This campaign is Tier ${tier}; build for Tier ${tier}`);
      // The GM may have waived this Ascension's package (Core p.148 step 2): the builder reads the same flag, so the
      // server asks for what the screen asks for.
      const play = row
        ? { tier, xpEarned: row.xp, xpAtAscension: row.xpAtAscension, packageWaived: row.ascensionPackageWaived }
        : undefined;
      const r = resolveBuild({ catalogue: buildCatalogue(homebrew), build, play });
      const refusal = buildRefusal(r);
      if (refusal) fail(refusal);
      // A character already made keeps what play changed (keepPlay), and gains only what the new build adds over the
      // stored one; a first build keeps only Ammo and requisitions, or with `keepSheet` the hand-made sheet's armour and
      // gear lines and Wealth too. Its weapons are the build's, whose Talents are applied on read (rules-flow.md §11.68),
      // plus any hand-written line the build has no weapon of that name for: a GM's own profile (a homemade mine, say).
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
            ? {
                ...keepPlay({ previous: old, next: r.sheet, before: r.sheet }),
                weapons: keepSheetWeapons(old.weapons, r.sheet.weapons),
              }
            : {
                ...r.sheet,
                ammo: old.ammo,
                requisitioned: old.requisitioned,
                corruption: old.corruption + r.sheet.corruption, // a first build adds what it gives (p.86)
                mutations: old.mutations,
              };
      // What advancement spent of the XP earned in play (§11.55), so the sheet and PARTY can show what's left without
      // the catalogue. `advancement` is null for a build with no `play` — a character being made has spent nothing yet.
      const xpSpent = r.advancement?.spent ?? 0;
      // The purchase history (§11.69): every purchase the resolved ledger names, dated with the session it first
      // appeared in. A key the new build no longer holds is dropped, so a purchase taken back takes its date with it.
      const stamped = {
        ...build,
        advancement: { ...build.advancement, boughtIn: await stampHistory(tx, cid, r, build) },
      };
      if (row) {
        await tx
          .update(character)
          .set({
            stats,
            build: stamped,
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
          build: stamped,
          xpSpent,
          detail: a.detail ?? {},
          builtAt: new Date(),
        })
        .returning({ id: character.id });
      return { ok: true, id: c!.id }; // the row was just inserted
    }

    // A draft waits on the character for the GM. A player's keeps the GM's part as it stands (the stored draft's, or the
    // saved build's), so ticks and rulings stay the GM's. Nothing stamps a draft's purchase history: a draft is never
    // authoritative, and `character.build` rewrites the history from the stored build on every save (§11.69).
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

    // The GM's hand on CARRIED: a rebuild never drops a line (keepPlay), so this is how one is fixed or taken out.
    case "character.gear": {
      const stats = CharacterStats.parse((await ownCharacter(tx, { campaignId: cid, id: a.id })).stats);
      const i = stats.gear.indexOf(a.line);
      if (i < 0) fail("That line has changed since you opened it; look again");
      stats.gear = a.to === null ? stats.gear.toSpliced(i, 1) : stats.gear.with(i, a.to);
      await saveStats(tx, { id: a.id, stats });
      return { ok: true };
    }

    // Corruption (Core p.286, §9). A failed Test and its +1 Ruin land in one transaction, so a refusal changes neither.
    case "character.corrupt": {
      const row = await ownCharacter(tx, { campaignId: cid, id: a.id });
      const stats = CharacterStats.parse(row.stats);
      const before = stats.corruption;
      let gain = a.delta ?? 0; // the schema guarantees a delta or a test
      const notices: string[] = [];
      if (a.test) {
        const dn = corruptionTestDn({ ...a.test, points: before });
        if (a.test.icons >= dn)
          fail(`${row.name} rolled ${a.test.icons} Icons against DN ${dn}: that Test passed (Core p.286)`);
        if (a.test.spentWrath) {
          if (row.wrath < 1) fail(`${row.name} has no Wrath to spend (Core p.286)`);
          await tx
            .update(character)
            .set({ wrath: bump(character.wrath, -1) })
            .where(eq(character.id, row.id));
        }
        gain = corruptionGain({ dn, icons: a.test.icons, complication: a.test.complication });
      }
      stats.corruption = Math.max(0, before + gain);
      await saveStats(tx, { id: a.id, stats });
      // p.286; the pool's cap swallows what's over it (p.320), which the GM should know.
      if (a.test && (await adjustPool(tx, { campaignId: cid, pool: "ruin", delta: 1 })) <= 0)
        notices.push("RUIN IS FULL · THE +1 IS LOST (p.320)");
      // The Mutation Tests (and the end of the character) are rolled at the table, so the GM is told what they are.
      notices.push(...mutationDns(before, stats.corruption).map((dn) => `MUTATION TEST · DN ${dn}`));
      if (corruptionLevel(stats.corruption).chaosSpawn && !corruptionLevel(before).chaosSpawn)
        notices.push("CHAOS SPAWN · THE GM TAKES THE AGENT OVER (pp.286, 352)");
      return notices.length ? { ok: true, notices } : { ok: true };
    }

    // A mutation rolled at the table (Core pp.287–295), snapshotted from the book data.
    case "character.mutate": {
      const row = await ownCharacter(tx, { campaignId: cid, id: a.id });
      const stats = CharacterStats.parse(row.stats);
      const m = findMutation(MUTATIONS, a.mutationId);
      if (!m) fail("No such mutation (Core pp.288–295)");
      const sub = m.sub?.rows.find((r) => r.id === a.subId);
      if (m.sub && !sub) fail(`${m.name} rolls on its ${m.sub.name} table first`);
      if (!m.sub && a.subId) fail(`${m.name} has no table of its own`);
      const held = new Set(stats.mutations.map((x) => x.id));
      if (held.has(m.id)) fail(`${row.name} already has ${m.name}: reroll on the same table (Core p.287)`);
      // The Warp Made Manifest brings others with it; one already held stays as it is.
      const included = m.includes.flatMap((id) => {
        const r = findMutation(MUTATIONS, id);
        return r && !held.has(id) ? [sheetMutation(r)] : [];
      });
      stats.mutations.push(sheetMutation(m, sub), ...included);
      if (stats.mutations.length > MAX_MUTATIONS) fail(`At most ${MAX_MUTATIONS} mutations`);
      await saveStats(tx, { id: a.id, stats });
      return m.extraRolls ? { ok: true, notices: [`ROLL ${m.extraRolls} MORE MUTATIONS (p.${m.page})`] } : { ok: true };
    }

    case "character.unmutate": {
      const row = await ownCharacter(tx, { campaignId: cid, id: a.id });
      const stats = CharacterStats.parse(row.stats);
      const kept = stats.mutations.filter((x) => x.id !== a.mutationId);
      if (kept.length === stats.mutations.length) fail(`${row.name} has no such mutation`);
      await saveStats(tx, { id: a.id, stats: { ...stats, mutations: kept } });
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
        if (a.kind === "wargear") {
          const fit = a.fitTo !== undefined ? { weapon: a.fitTo, tier } : undefined;
          Object.assign(stats, grantWargear(stats, { entry: item, name: a.item, fit }));
          if (a.loadedWith) stats.ammo = adjustAmmo(stats.ammo, { kind: a.loadedWith, delta: 1 });
        } else {
          // A grenade with a profile joins the armament too; the Ammo or grenades themselves are counted by type.
          Object.assign(stats, joinWeapon(stats, { entry: item }));
          stats.ammo = adjustAmmo(stats.ammo, { kind: a.item, delta: requisitionYield(a.kind, a.rarity) });
        }
      }
      await saveStats(tx, { id: a.id, stats });
      return { ok: true };
    }

    // A found item, handed over (rules-flow.md §11.112–§11.113, §11.118): no Influence Test and no Keyword, but it is the
    // Agent's Wargear Test for the session. The item leaves its place or NPC and records who has it.
    case "character.giveItem": {
      const row = await ownCharacter(tx, { campaignId: cid, id: a.id });
      const stats = CharacterStats.parse(row.stats);
      const found = await campaignItem(tx, { campaignId: cid, id: a.itemId });
      if (found.givenTo) fail(`${found.name} was given already: take it back first`);
      const entry = found.wargearId
        ? (wargear.get(found.wargearId) ?? fail(`Unknown wargear "${found.wargearId}"`))
        : undefined;
      if (entry?.kind === "ammo" || entry?.kind === "grenade")
        fail(
          `${entry.name} is counted by type on the sheet: award it with SUPPLY or a requisition (rules-flow.md §11.113)`,
        );
      const [open] = await tx
        .select({ id: session.id })
        .from(session)
        .where(and(eq(session.campaignId, cid), isNull(session.endedAt)));
      if (!open) fail("Start a session first: giving an item uses the Agent's Wargear Test (rules-flow.md §11.112)");
      if (stats.requisitioned.wargear === open.id) fail(`${row.name} already made this session's wargear Test (p.205)`);
      if (entry?.weapon && stats.weapons.some((w) => w.name === entry.name))
        fail(`${row.name} already carries a ${entry.name} (rules-flow.md §11.118)`);
      if (!entry?.weapon && stats.gear.length >= MAX_GEAR) fail(`${row.name}'s gear list is full (${MAX_GEAR} lines)`);
      const given = grantWargear(stats, { entry, name: found.name, mods: UpgradeMod.array().parse(found.mods) });
      await saveStats(tx, {
        id: a.id,
        stats: { ...given, requisitioned: { ...given.requisitioned, wargear: open.id } },
      });
      await tx.update(item).set({ givenTo: row.id, locationId: null, npcId: null }).where(eq(item.id, found.id));
      return { ok: true };
    }

    // TAKE BACK (rules-flow.md §11.114): whatever the GIVE put on the sheet comes off, a weapon's fitted upgrades return
    // as gear lines, and a line the GM already removed just ends the record. The Wargear Test isn't refunded.
    case "character.takeItem": {
      const row = await ownCharacter(tx, { campaignId: cid, id: a.id });
      const found = await campaignItem(tx, { campaignId: cid, id: a.itemId });
      if (found.givenTo !== row.id) fail(`${row.name} doesn't have ${found.name}`);
      // An entry the catalogue has lost is taken back as its name, like a custom item.
      const entry = found.wargearId ? wargear.get(found.wargearId) : undefined;
      const stats = CharacterStats.parse(row.stats);
      const given = entry?.weapon
        ? stats.weapons.find((w) => w.name === entry.name && (w.wargearId ?? entry.id) === entry.id)
        : undefined;
      const line = (id: string) => {
        const e = wargear.get(id);
        return e ? gearLine(e) : id;
      };
      const ownLine = stats.gear.findIndex((g) =>
        entry ? g === gearLine(entry) || g === entry.name || g.startsWith(`${entry.name} (`) : g === found.name,
      );
      if (given) {
        stats.gear = [...stats.gear, ...(given.fitted ?? []).map(line)];
        stats.weapons = stats.weapons.filter((w) => w !== given);
      } else if (ownLine >= 0) stats.gear = stats.gear.filter((_, i) => i !== ownLine);
      else if (entry?.upgrade) {
        // Fitted since it was given: one copy comes off the weapon or the suit it went on.
        const off = <H extends { fitted?: string[] }>(h: H): H => {
          const at = h.fitted?.indexOf(entry.id) ?? -1;
          const fitted = h.fitted?.filter((_, i) => i !== at);
          return { ...h, fitted: fitted?.length ? fitted : undefined };
        };
        const host = stats.weapons.find((w) => w.fitted?.includes(entry.id));
        if (host) stats.weapons = stats.weapons.map((w) => (w === host ? off(w) : w));
        else if (stats.armour.fitted?.includes(entry.id)) stats.armour = off(stats.armour);
      }
      if (stats.gear.length > MAX_GEAR) fail(`${row.name}'s gear list is full (${MAX_GEAR} lines)`);
      await saveStats(tx, { id: a.id, stats });
      await tx.update(item).set({ givenTo: null }).where(eq(item.id, found.id));
      return { ok: true };
    }

    // Fitting is instant and takes no Test (§11.63), so this only checks what the book checks: the fit, the maximum of
    // three and one per slot. What is written is the id, in `fitted`; the profile stays as printed and `withUpgrades`
    // derives what the sheet shows, so nothing is applied twice.
    case "character.fitUpgrade":
    case "character.removeUpgrade": {
      const row = await ownCharacter(tx, { campaignId: cid, id: a.id });
      const stats = CharacterStats.parse(row.stats);
      // The host: the suit the character wears, or the weapon of that name. One suit at a time (Core p.231), so the
      // armour host needs no name.
      const at = a.host === "armour" ? -1 : stats.weapons.findIndex((w) => w.name === a.weapon);
      if (a.host === "armour" ? !stats.armour.name : at < 0)
        fail(a.host === "armour" ? `${row.name} wears no armour` : `${row.name} has no weapon called "${a.weapon}"`);
      const held = a.host === "armour" ? stats.armour : stats.weapons[at]!;
      const entry = wargear.get(a.upgradeId) ?? fail("Unknown upgrade");
      if (!entry.upgrade) fail(`${entry.name} isn't an upgrade`);

      if (a.type === "character.removeUpgrade") {
        // Only what was fitted in play comes off here: an upgrade the build gives the host (§11.42) goes in the
        // builder, or the next rebuild would put it back.
        const which = (held.fitted ?? []).indexOf(a.upgradeId);
        if (which < 0)
          fail(
            (held.upgrades ?? []).includes(a.upgradeId)
              ? `${entry.name} is part of ${held.name} as it was built: change the build to take it off`
              : `${held.name} has no ${entry.name} fitted`,
          );
        if (stats.gear.length >= MAX_GEAR) fail(`${row.name}'s gear list is full (${MAX_GEAR} lines)`);
        const left = (held.fitted ?? []).filter((_, i) => i !== which);
        const kept = left.length ? left : undefined;
        if (a.host === "armour") stats.armour = { ...stats.armour, fitted: kept };
        else stats.weapons = stats.weapons.with(at, { ...stats.weapons[at]!, fitted: kept });
        // It comes off the host and back into the character's gear, where a requisitioned upgrade starts.
        stats.gear = [...stats.gear, gearLine(entry)];
        await saveStats(tx, { id: a.id, stats });
        return { ok: true };
      }
      // Matched Pair is a property of two weapons, so the player's picker doesn't offer it and the GM fits it on both,
      // policing the pairing themselves (Apocrypha p.388, §11.64).
      if (entry.upgrade.gmOnly && ctx.role !== "gm")
        fail(`${entry.name} is the GM's to fit: it reads on two weapons at once (rules-flow.md §11.64)`);

      const { tier } = await campaignRules(tx, cid);
      // The upgrade must be one the character owns: it arrives as a gear line from a requisition (p.205). The GM may
      // fit one that isn't there, the way they grant anything else (§11.57).
      const owned = stats.gear.findIndex((g) => g === entry.name || g.startsWith(`${entry.name} (`));
      if (owned < 0 && ctx.role !== "gm") fail(`${row.name} doesn't have ${entry.name} to fit`);
      if (owned >= 0) stats.gear = stats.gear.filter((_, i) => i !== owned);
      await saveStats(tx, { id: a.id, stats: fitUpgrade(stats, { host: a.host, weapon: a.weapon, entry, tier }) });
      return { ok: true };
    }

    case "character.objectives": {
      // A STORY link names this campaign's adventure, or one of its scenes with that scene's own adventure (§11.163).
      const beatIds = a.objectives.flatMap((o) => (o.beatId ? [o.beatId] : []));
      const adventureIds = a.objectives.flatMap((o) => (o.adventureId ? [o.adventureId] : []));
      const beats = beatIds.length
        ? await tx
            .select({ id: beat.id, adventureId: beat.adventureId })
            .from(beat)
            .where(and(eq(beat.campaignId, cid), inArray(beat.id, beatIds)))
        : [];
      const adventures = adventureIds.length
        ? await tx
            .select({ id: adventure.id })
            .from(adventure)
            .where(and(eq(adventure.campaignId, cid), inArray(adventure.id, adventureIds)))
        : [];
      const adventureOf = new Map(beats.map((b) => [b.id, b.adventureId]));
      const known = new Set(adventures.map((r) => r.id));
      for (const o of a.objectives) {
        if (o.adventureId && !known.has(o.adventureId)) fail("That adventure isn't in this campaign");
        if (o.beatId && adventureOf.get(o.beatId) !== o.adventureId) fail("That scene isn't in that adventure");
      }
      const r = await tx
        .update(character)
        .set({ objectives: a.objectives })
        .where(inCampaign(a.characterId))
        .returning({ id: character.id });
      return r.length ? { ok: true } : fail("Character not found");
    }

    // The d6 the player rolled on their Faction's Objectives table (Core p.43), at the start of a session. The server
    // reads the row, so the phone never holds the table; a new roll replaces the session's last (§11.161).
    case "character.rollObjective": {
      const row = await ownCharacter(tx, { campaignId: cid, id: a.characterId });
      const [open] = await tx
        .select({ id: session.id })
        .from(session)
        .where(and(eq(session.campaignId, cid), isNull(session.endedAt)));
      if (!open) fail("Start a session first: the Objective is rolled each session (Core p.43)");
      // shortcut: a hand-made sheet has no Background table to roll on; the GM writes its Objective in ORDERS
      const made = CharacterBuild.safeParse(row.build);
      const tableId = made.success ? made.data.background?.tableId : undefined;
      const text = tableId ? factionObjective({ tableId, roll: a.roll }) : null;
      if (!text) fail(`No Faction Objectives table on ${row.name}: the GM writes it in`);
      const kept = Objectives.parse(row.objectives).filter((o) => !o.rolled);
      if (kept.length >= MAX_OBJECTIVES) fail(`${row.name} has ${MAX_OBJECTIVES} objectives already`);
      await tx
        .update(character)
        .set({ objectives: [...kept, { text, done: false, rolled: true }] })
        .where(inCampaign(row.id));
      return { ok: true };
    }

    case "character.respite": {
      const { dying, dead } = await healthOf(tx, {
        campaignId: cid,
        row: await ownCharacter(tx, { campaignId: cid, id: a.id }),
      });
      if (dead) fail("A Dead or Lost character can't Respite (pp.193, 286)");
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
