import { z } from "zod";
import { Requirement, WargearFilter } from "./creation.ts";
import { UpgradeMod } from "./weapon-effect.ts";
export { UpgradeMod };
import { Rarity, WargearKind, type RequisitionKind } from "./requisition.ts";
import { Source, sourceCite } from "./source.ts";
import { Weapon } from "./threat.ts";

// The Wargear catalogue (Core pp.211–247, VoA pp.59–75, FSPG pp.120–128, IoE pp.77–99, Necrontyr PDF pp.10–13, Apocrypha
// pp.326–482), for the GM's requisition form. It holds book text, so like the bestiary it is served to the GM only.

// A weapon profile as printed. Melee "S + X" is addStrength + damage X. A thrown range is "S × N" (p.207), so it
// carries the multiplier N and gets metres from the character's Strength when it joins a sheet. A knife has both: a
// melee reach in `range` and `thrown`.
export const WargearWeapon = Weapon.omit({ name: true, range: true })
  .extend({
    addStrength: z.boolean().default(false),
    range: Weapon.shape.range.optional(),
    thrown: z.number().int().positive().optional(),
  })
  .refine((w) => w.range !== undefined || w.thrown !== undefined, "a weapon needs range or thrown");
export type WargearWeapon = z.infer<typeof WargearWeapon>;

export const WargearArmour = z.object({
  ar: z.number().int().min(0).max(20),
  invulnerable: z.boolean().default(false), // printed with an asterisk (p.231)
  powered: z.number().int().min(0).max(10).default(0), // the Powered (X) Trait
  traits: z.array(z.string()).default([]),
});
export type WargearArmour = z.infer<typeof WargearArmour>;

// ── upgrades (Core pp.227–228, rules-flow.md §11.63–§11.65) ──────────────────────────────────────────────────────────

// An item takes at most three upgrades, "and only one of each type" (Core p.227). The book names only grips and
// scopes, so every upgrade carries a slot from this closed vocabulary, proposed per entry and confirmed by the GM
// (§11.64). The last three are armour's.
export const UPGRADE_SLOTS = [
  "sight",
  "grip",
  "muzzle",
  "magazine",
  "bayonet",
  "attachment", // a second weapon carried on the first (Combi Weapon)
  "mount", // bracing that carries the weapon (Suspensor Rig)
  "core", // the works (Megathoule Accelerator, Powered Blade)
  "craft", // a quality of the whole item (Mastercrafted, Distinction)
  "coating", // one substance on one blade (Envenomed Blade, the Drukhari toxins)
  "crest",
  "plate",
  "system",
] as const;
export const UpgradeSlot = z.enum(UPGRADE_SLOTS);
export type UpgradeSlot = z.infer<typeof UpgradeSlot>;

// What an upgrade is fitted to. Three things key off it: `fits.kinds`, an entry's per-host slot (`slotOn`) and the
// action's host (§11.64–§11.65).
export const UPGRADE_HOSTS = ["weapon", "armour"] as const;
export const UpgradeHost = z.enum(UPGRADE_HOSTS);
export type UpgradeHost = z.infer<typeof UpgradeHost>;

// What an upgrade fits and what it does. `fits` is the printed compatibility line ("any melee weapon with the BLADE
// keyword", Apocrypha p.387) as a filter, so the server can refuse a bad fit.
export const Upgrade = z.object({
  slot: UpgradeSlot,
  fits: WargearFilter,
  mods: z.array(UpgradeMod).default([]),
  // "max": Distinction doesn't count toward the three (Core p.228). "slot": a SUPPORT SYSTEM shares `system` with the
  // other nine but isn't one-per-slot (§11.64).
  exempt: z.enum(["max", "slot"]).optional(),
  copies: z.number().int().min(2).optional(), // its own printed limit: "may be purchased up to 3 times" (IoE p.96)
  // One entry that fits either host and is a different "type" on each: the Anti-Gravitic Suspensor Crystal is the
  // bracing that carries a Heavy weapon (`mount`) and a system inside Aeldari armour (`system`) — one entry in the book,
  // so one entry here, with its printed "no more than 1" holding whichever it is (IoE p.95, §11.64). `slot` is what it
  // is on any host this doesn't name.
  slotOn: z.partialRecord(UpgradeHost, UpgradeSlot).optional(),
  // Matched Pair is a property of two weapons, not one (Apocrypha p.388, §11.64): the player's picker doesn't offer it,
  // and the GM fits it on both and polices the pairing.
  gmOnly: z.boolean().optional(),
});
export type Upgrade = z.infer<typeof Upgrade>;

export const Wargear = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  source: Source,
  page: z.number().int().positive(), // printed page in `source`
  category: z.string().min(1).max(60), // the table or section heading, e.g. "Bolt Weapons"
  kind: WargearKind,
  value: z.number().int().min(0).max(30).nullable(), // null: none printed
  rarity: Rarity.nullable(),
  keywords: z.array(z.string().min(1)).default([]), // as printed, upper case; "[ANY]" kept
  weapon: WargearWeapon.optional(),
  armour: WargearArmour.optional(),
  upgrade: Upgrade.optional(), // every `kind: "upgrade"` entry carries one; validate.ts holds that line
  // A follower's stat block, and the variant it is when the book prints one profile with variants ("MV-4 Shield
  // Drone" is the T'au Drone profile, Apocrypha p.479)
  threatId: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  variant: z.string().min(1).optional(),
  effect: z.string().max(3000).default(""), // the Effect line (equipment, upgrades, augmetics, special ammo)
  note: z.string().max(500).optional(), // a print error copied as printed, or a transcription remark
  // Who may buy or install it, structured from its printed "Requirements:" line (B.O.N.E, FSPG p.128)
  requires: z.array(Requirement).optional(),
});
export type Wargear = z.infer<typeof Wargear>;

// A catalogue weapon as a sheet weapon. A thrown range becomes N × the character's Strength in metres (p.207); a
// weapon that is also melee keeps its reach and notes the throw as a trait.
export function sheetWeapon(
  { name, weapon: { thrown, range, ...w } }: { name: string; weapon: WargearWeapon },
  strength: number,
) {
  const throwM = thrown === undefined ? undefined : thrown * strength;
  if (range === undefined) return { name, ...w, range: [throwM ?? 1] };
  return { name, ...w, range, traits: throwM === undefined ? w.traits : [...w.traits, `Thrown (${throwM} m)`] };
}

// A catalogue weapon as a **Threat's** weapon (GitHub issue #43). A stat block prints final numbers, and `Weapon` has
// no `addStrength`, so melee "(S) + X" (Core pp.211–213) is resolved here against this threat's Strength: zod would
// drop the flag silently and the line would read as X damage on its own. Thrown ranges come out as `sheetWeapon`
// already makes them (Core p.208). Every number stays editable afterwards.
export function threatWeapon(entry: { name: string; weapon: WargearWeapon }, strength: number): Weapon {
  const { addStrength, ...w } = sheetWeapon(entry, strength);
  return Weapon.parse({ ...w, damage: addStrength ? strength + w.damage : w.damage });
}

// A catalogue item as a gear line on the sheet (≤ 200 characters): the name, armour's AR, and where to read it.
export function gearLine({ name, armour: a, source, page }: Pick<Wargear, "name" | "armour" | "source" | "page">) {
  const ar = a
    ? `AR ${a.ar}${a.invulnerable ? "*" : ""}${a.powered ? `, Powered (${a.powered})` : ""}${a.traits.length ? `, ${a.traits.join(", ")}` : ""}; `
    : "";
  return `${name} (${ar}${sourceCite({ source, page })})`.slice(0, 200);
}

// Which requisition Test a catalogue item takes: Ammo and Grenades share the session's Ammo Test (p.205, p.229).
export const requisitionKindOf = (kind: WargearKind): RequisitionKind =>
  kind === "ammo" || kind === "grenade" ? kind : "wargear";
// ── fitting upgrades (Core pp.227–228, rules-flow.md §11.63–§11.65) ──────────────────────────────────────────────────

// An item takes at most three upgrades; Distinction doesn't count toward that (Core p.228, `exempt: "max"`).
export const MAX_UPGRADES = 3;

// A Trait's printed name from its rules id, for a profile the sheet shows: "rapid-fire" → "Rapid Fire". The rules
// reference isn't in this package, so a caller that has it (the api, the RULES tab) passes `traitName` instead.
const titleCase = (id: string) =>
  id
    .split("-")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
const traitKey = (t: string) => t.split("(")[0]!.trim().toLowerCase();
const rated = (name: string, rating?: number) => (rating === undefined ? name : `${name} (${rating})`);

// The slot an upgrade takes on this host: the same for all but the Suspensor Crystal (§11.64).
export const slotOf = (u: Upgrade, host: UpgradeHost = "weapon"): UpgradeSlot => u.slotOn?.[host] ?? u.slot;

// The three Trait mods, which read the same on a weapon's profile and on a suit's, so both paths share them and can't
// drift. Returns the Traits after the mod; anything else is the caller's.
function traitMods(
  traits: string[],
  m: Extract<UpgradeMod, { kind: "trait" | "removeTrait" | "traitRating" }>,
  traitName: (id: string) => string,
): string[] {
  const name = traitName(m.traitId);
  const at = traits.findIndex((t) => traitKey(t) === traitKey(name));
  switch (m.kind) {
    case "trait": {
      // It already has the Trait: the better rating stands, rather than the item carrying it twice.
      if (at < 0) return [...traits, rated(name, m.rating)];
      if (m.rating === undefined) return traits;
      const had = Number(traits[at]!.match(/\((\d+)\)/)?.[1] ?? 0);
      return traits.with(at, rated(name, Math.max(had, m.rating)));
    }
    case "removeTrait":
      return traits.filter((t) => traitKey(t) !== traitKey(name));
    case "traitRating": {
      // Moves a rating the item already has; one without that Trait is untouched (VoA p.68).
      if (at < 0) return traits;
      const now = Number(traits[at]!.match(/\((\d+)\)/)?.[1] ?? 0) + m.delta;
      // A rating of 0 is an inert Trait (Rapid Fire (0) adds no dice), so it comes off the profile instead.
      return now <= 0 ? traits.filter((_, i) => i !== at) : traits.with(at, rated(name, now));
    }
  }
}

// Why an upgrade can't be fitted, or null. The catalogue entry, the item it would go on, and what is already fitted.
export function upgradeRefusal({
  upgrade,
  item,
  fitted,
  matches,
  host = "weapon",
}: {
  upgrade: Wargear;
  item: Wargear;
  fitted: Wargear[];
  matches: (w: Wargear, f: WargearFilter) => boolean;
  host?: UpgradeHost;
}): string | null {
  const u = upgrade.upgrade;
  if (!u) return `${upgrade.name} isn't an upgrade`;
  if (fitted.some((f) => f.id === upgrade.id) && !u.copies) return `${item.name} already has ${upgrade.name}`;
  if (u.copies && fitted.filter((f) => f.id === upgrade.id).length >= u.copies)
    return `${upgrade.name} goes on at most ${u.copies} times (its own limit)`;
  if (!matches(item, u.fits)) return `${upgrade.name} doesn't fit ${item.name}`;
  // The maximum of three counts the upgrades that count (Core p.228). Armour takes the same cap, which is the GM's
  // ruling, not the book's: one rule reads the same on a suit as on a rifle (§11.65).
  if (u.exempt !== "max" && fitted.filter((f) => f.upgrade?.exempt !== "max").length >= MAX_UPGRADES)
    return `${item.name} already has ${MAX_UPGRADES} upgrades (Core p.227)`;
  // "Only one of each type": a slot is taken unless the upgrade is exempt, or is another copy of its own entry.
  const slot = slotOf(u, host);
  if (u.exempt !== "slot") {
    const taken = fitted.find(
      (f) => f.upgrade && slotOf(f.upgrade, host) === slot && f.upgrade.exempt !== "slot" && f.id !== upgrade.id,
    );
    if (taken) return `${item.name} already has a ${slot}: ${taken.name} (Core p.227)`;
  }
  return null;
}

// The profile an upgraded weapon shows, and the prose the sheet prints under it. Pure: the base weapon stays as it is
// stored, so a later data fix re-derives rather than rewriting what was made (like a threat's snapshot).
export function applyUpgrades(
  weapon: Weapon,
  upgrades: Wargear[],
  opts: { traitName?: (id: string) => string } = {},
): { weapon: Weapon; notes: string[] } {
  return applyMods(
    weapon,
    upgrades.flatMap((u) => u.upgrade?.mods ?? []),
    opts,
  );
}

// The profile changes themselves, in order, shared by upgrades and a Talent's weapon effects (`withWeaponEffects`,
// build.ts, once their Rank amounts are numbers).
export function applyMods(
  weapon: Weapon,
  mods: UpgradeMod[],
  { traitName = titleCase }: { traitName?: (id: string) => string } = {},
): { weapon: Weapon; notes: string[] } {
  let traits = [...weapon.traits];
  let { damage, ed, ap, salvo, range } = weapon;
  const notes: string[] = [];

  for (const m of mods) {
    switch (m.kind) {
      // The three Trait mods read the same on a weapon's profile and on a suit's, so both paths share them and
      // can't drift (§11.65).
      case "trait":
      case "removeTrait":
      case "traitRating":
        traits = traitMods(traits, m, traitName);
        break;
      case "damage":
        damage += m.delta;
        break;
      case "ed":
        // A rolled ED ("1d3") can't take a delta, so it stays and the change is printed.
        if (typeof ed === "number") ed += m.delta;
        else notes.push(`ED ${m.delta >= 0 ? "+" : ""}${m.delta}, on a rolled ${String(ed)}`);
        break;
      case "setAp":
        ap = m.value === 0 ? undefined : m.value;
        break;
      case "ap": {
        // AP is a penalty, so it never goes above 0 (Weapon.ap); a weapon with no AP that gains none keeps none.
        const now = Math.min(0, (ap ?? 0) + m.delta);
        ap = ap === undefined && now === 0 ? undefined : now;
        break;
      }
      case "salvo":
        // A weapon printed "–" has no Salvo track (p.207), so a change to it is the GM's call, not a silent 0 + X.
        if (typeof salvo === "number") salvo = Math.max(0, salvo + m.delta);
        else notes.push(`Salvo ${m.delta >= 0 ? "+" : ""}${m.delta}, on a weapon printed "–"`);
        break;
      case "range":
        range = range.map((r, i) =>
          Math.max(1, Math.round(r * (m.multiply ?? 1) + (m.delta ?? 0) + (m.bands?.[i] ?? 0))),
        );
        break;
      case "ar": // armour's, and never a weapon's, so on a weapon it is prose: see applyArmourUpgrades
        notes.push(`AR ${m.delta >= 0 ? "+" : ""}${m.delta}`);
        break;
      case "bonusDice":
        notes.push(`${m.dice >= 0 ? "+" : ""}${m.dice} bonus ${Math.abs(m.dice) === 1 ? "die" : "dice"} to ${m.when}`);
        break;
      case "gm":
        notes.push(m.what);
        break;
    }
  }
  return {
    weapon: { ...weapon, damage, ed, ap, salvo, range, traits },
    notes,
  };
}

// The sheet's armour, as much of it as fitting an upgrade reads. The schema is `CharacterStats.armour` in state.ts,
// which this package can't import from here without a cycle (creation.ts → state.ts → wargear.ts).
export type SheetArmourLike = {
  ar: number;
  traits: string[];
  wargearId?: string;
  upgrades?: string[];
  fitted?: string[];
  upgradeNames?: string[];
  notes?: string[];
};

// The profile an upgraded suit shows, and the prose the sheet prints under it (Core pp.227–228, §11.65). The twin of
// `applyUpgrades`, and pure the same way: the stored suit stays as printed, so a later data fix re-derives. A mod that
// reads on a weapon's profile (damage, ED, AP, Salvo, range) is printed as a note rather than dropped, so a
// mis-transcribed entry shows at the table instead of going quiet.
export function applyArmourUpgrades<A extends { ar: number; traits: string[] }>(
  armour: A,
  upgrades: Wargear[],
  { traitName = titleCase }: { traitName?: (id: string) => string } = {},
): { armour: A; notes: string[] } {
  let traits = [...armour.traits];
  let ar = armour.ar;
  const notes: string[] = [];

  for (const entry of upgrades) {
    for (const m of entry.upgrade?.mods ?? []) {
      switch (m.kind) {
        case "trait":
        case "removeTrait":
        case "traitRating":
          traits = traitMods(traits, m, traitName);
          break;
        case "ar":
          ar = Math.min(20, Math.max(0, ar + m.delta)); // CharacterStats.armour.ar's bounds
          break;
        case "damage":
        case "ed":
        case "ap":
        case "setAp":
        case "salvo":
        case "range":
          notes.push(`${m.kind} reads on a weapon's profile, not on armour`);
          break;
        case "bonusDice":
          notes.push(
            `${m.dice >= 0 ? "+" : ""}${m.dice} bonus ${Math.abs(m.dice) === 1 ? "die" : "dice"} to ${m.when}`,
          );
          break;
        case "gm":
          notes.push(m.what);
          break;
      }
    }
  }
  return { armour: { ...armour, ar, traits }, notes };
}

// The sheet as it is shown: every weapon's and the suit's fitted upgrades applied, their names listed and the prose they
// leave to the GM printed under them. The stored sheet keeps the printed profile and the ids, so this is the only place
// the two meet and nothing is ever applied twice. The api runs it for the live sheet (a phone doesn't hold the
// catalogue), and the builder runs it for its preview. `armour` is optional, so a caller probing one weapon can pass
// `{ weapons: [w] }`.
export function withUpgrades<T extends { weapons: Weapon[]; armour?: SheetArmourLike }>(
  stats: T,
  catalogue: ReadonlyMap<string, Wargear>,
  opts: { traitName?: (id: string) => string } = {},
): T {
  // An id the catalogue no longer holds keeps its place, so a rename shows as the id rather than vanishing.
  const named = (ids: string[]) => ids.map((id) => catalogue.get(id)?.name ?? id);
  const entries = (ids: string[]) => ids.map((id) => catalogue.get(id)).filter((u) => u !== undefined);
  const suit = stats.armour;
  const suitIds = [...(suit?.upgrades ?? []), ...(suit?.fitted ?? [])];
  return {
    ...stats,
    ...(suit && suitIds.length > 0
      ? (() => {
          const { armour, notes } = applyArmourUpgrades(suit, entries(suitIds), opts);
          return { armour: { ...armour, upgradeNames: named(suitIds), notes: notes.length ? notes : undefined } };
        })()
      : {}),
    weapons: stats.weapons.map((w) => {
      const ids = [...(w.upgrades ?? []), ...(w.fitted ?? [])];
      if (ids.length === 0 && !w.mods?.length) return w;
      // A given relic's Powers read like one more upgrade, after the ones fitted to it (rules-flow.md §11.116).
      const mods = [...entries(ids).flatMap((u) => u.upgrade?.mods ?? []), ...(w.mods ?? [])];
      const { weapon, notes } = applyMods(w, mods, opts);
      return { ...weapon, upgradeNames: named(ids), notes: notes.length ? notes : undefined };
    }),
  };
}
