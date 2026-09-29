import { z } from "zod";
import { Requirement, WargearFilter } from "./creation.ts";
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

// ── upgrades (Core pp.227–228, rules-flow.md §11.60–§11.62) ──────────────────────────────────────────────────────────

// An item takes at most three upgrades, "and only one of each type" (Core p.227). The book names only grips and
// scopes, so every upgrade carries a slot from this closed vocabulary, proposed per entry and confirmed by the GM
// (§11.61). The last three are armour's.
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

// The structured part of an upgrade's printed effect: what the fitted profile shows. Anything a profile can't hold
// (an Action the wielder takes, a Glory spend, a Test) stays prose in `effect` and takes a `gm` mod, the way a Talent
// does, so nothing is silently dropped.
export const UpgradeMod = z.union([
  // A Trait the item gains, by rules id: "gains Sniper (2)" is { traitId: "sniper", rating: 2 }
  z.object({ kind: z.literal("trait"), traitId: z.string().min(1), rating: z.number().int().optional() }),
  z.object({ kind: z.literal("removeTrait"), traitId: z.string().min(1) }), // "removes the Heavy Trait" (IoE p.95)
  // A rating the item already has, moved: "reduces any Rapid Fire rating by -1" (VoA p.68). Removing the Trait would
  // say something else, so this is its own mod; it does nothing to a weapon without that Trait.
  z.object({ kind: z.literal("traitRating"), traitId: z.string().min(1), delta: z.number().int() }),
  z.object({ kind: z.literal("damage"), delta: z.number().int() }),
  z.object({ kind: z.literal("ed"), delta: z.number().int() }),
  z.object({ kind: z.literal("ap"), delta: z.number().int() }),
  z.object({ kind: z.literal("salvo"), delta: z.number().int() }),
  // "The weapon's ranges are halved" (Apocrypha p.389) is { multiply: 0.5 }; a flat change is { delta }; a band-by-band
  // change ("+3 Short, +6 Medium, +9 Long", Apocrypha p.388) is { bands: [3, 6, 9] }, shortest first, as `range` prints
  z.object({
    kind: z.literal("range"),
    multiply: z.number().positive().optional(),
    delta: z.number().int().optional(),
    bands: z.array(z.number().int()).min(1).max(3).optional(),
  }),
  z.object({ kind: z.literal("ar"), delta: z.number().int() }), // armour only
  // "+2 bonus dice to any Attack Test made with this weapon" (Core p.228): dice the sheet shows, with when to add them
  z.object({ kind: z.literal("bonusDice"), dice: z.number().int(), when: z.string().min(1).max(200) }),
  z.object({ kind: z.literal("gm"), what: z.string().min(1).max(200) }), // the GM applies it at the table
]);
export type UpgradeMod = z.infer<typeof UpgradeMod>;

// What an upgrade fits and what it does. `fits` is the printed compatibility line ("any melee weapon with the BLADE
// keyword", Apocrypha p.387) as a filter, so the server can refuse a bad fit.
export const Upgrade = z.object({
  slot: UpgradeSlot,
  fits: WargearFilter,
  mods: z.array(UpgradeMod).default([]),
  // "max": Distinction doesn't count toward the three (Core p.228). "slot": a SUPPORT SYSTEM shares `system` with the
  // other nine but isn't one-per-slot (§11.61).
  exempt: z.enum(["max", "slot"]).optional(),
  copies: z.number().int().min(2).optional(), // its own printed limit: "may be purchased up to 3 times" (IoE p.96)
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
// ── fitting upgrades (Core pp.227–228, rules-flow.md §11.60–§11.62) ──────────────────────────────────────────────────

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

// Why an upgrade can't be fitted, or null. The catalogue entry, the item it would go on, and what is already fitted.
export function upgradeRefusal({
  upgrade,
  item,
  fitted,
  matches,
}: {
  upgrade: Wargear;
  item: Wargear;
  fitted: Wargear[];
  matches: (w: Wargear, f: WargearFilter) => boolean;
}): string | null {
  const u = upgrade.upgrade;
  if (!u) return `${upgrade.name} isn't an upgrade`;
  if (fitted.some((f) => f.id === upgrade.id) && !u.copies) return `${item.name} already has ${upgrade.name}`;
  if (u.copies && fitted.filter((f) => f.id === upgrade.id).length >= u.copies)
    return `${upgrade.name} goes on at most ${u.copies} times (its own limit)`;
  if (!matches(item, u.fits)) return `${upgrade.name} doesn't fit ${item.name}`;
  // The maximum of three counts the upgrades that count (Core p.228).
  if (u.exempt !== "max" && fitted.filter((f) => f.upgrade?.exempt !== "max").length >= MAX_UPGRADES)
    return `${item.name} already has ${MAX_UPGRADES} upgrades (Core p.227)`;
  // "Only one of each type": a slot is taken unless the upgrade is exempt, or is another copy of its own entry.
  if (u.exempt !== "slot") {
    const taken = fitted.find((f) => f.upgrade?.slot === u.slot && f.upgrade.exempt !== "slot" && f.id !== upgrade.id);
    if (taken) return `${item.name} already has a ${u.slot}: ${taken.name} (Core p.227)`;
  }
  return null;
}

// The profile an upgraded weapon shows, and the prose the sheet prints under it. Pure: the base weapon stays as it is
// stored, so a later data fix re-derives rather than rewriting what was made (like a threat's snapshot).
export function applyUpgrades(
  weapon: Weapon,
  upgrades: Wargear[],
  { traitName = titleCase }: { traitName?: (id: string) => string } = {},
): { weapon: Weapon; notes: string[] } {
  let traits = [...weapon.traits];
  let { damage, ed, ap, salvo, range } = weapon;
  const notes: string[] = [];

  for (const entry of upgrades) {
    for (const m of entry.upgrade?.mods ?? []) {
      switch (m.kind) {
        case "trait": {
          const name = traitName(m.traitId);
          const at = traits.findIndex((t) => traitKey(t) === traitKey(name));
          // It already has the Trait: the better rating stands, rather than the weapon carrying it twice.
          if (at < 0) traits.push(rated(name, m.rating));
          else if (m.rating !== undefined) {
            const had = Number(traits[at]!.match(/\((\d+)\)/)?.[1] ?? 0);
            traits[at] = rated(name, Math.max(had, m.rating));
          }
          break;
        }
        case "removeTrait":
          traits = traits.filter((t) => traitKey(t) !== traitKey(traitName(m.traitId)));
          break;
        case "traitRating": {
          // Moves a rating the weapon already has; a weapon without the Trait is untouched (VoA p.68).
          const name = traitName(m.traitId);
          const at = traits.findIndex((t) => traitKey(t) === traitKey(name));
          if (at >= 0) {
            const had = Number(traits[at]!.match(/\((\d+)\)/)?.[1] ?? 0);
            const now = had + m.delta;
            // A rating of 0 is an inert Trait (Rapid Fire (0) adds no dice), so it comes off the profile instead.
            if (now <= 0) traits = traits.filter((_, i) => i !== at);
            else traits[at] = rated(name, now);
          }
          break;
        }
        case "damage":
          damage += m.delta;
          break;
        case "ed":
          // A rolled ED ("1d3") can't take a delta, so it stays and the change is printed.
          if (typeof ed === "number") ed += m.delta;
          else notes.push(`ED ${m.delta >= 0 ? "+" : ""}${m.delta}, on a rolled ${String(ed)}`);
          break;
        case "ap":
          ap = (ap ?? 0) + m.delta;
          break;
        case "salvo":
          if (typeof salvo === "number") salvo = Math.max(0, salvo + m.delta);
          break;
        case "range":
          range = range.map((r, i) =>
            Math.max(1, Math.round(r * (m.multiply ?? 1) + (m.delta ?? 0) + (m.bands?.[i] ?? 0))),
          );
          break;
        case "ar": // armour's, and never a weapon's: fitting to armour is not built yet (issue #15)
          notes.push(`AR ${m.delta >= 0 ? "+" : ""}${m.delta}`);
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
  return {
    weapon: { ...weapon, damage, ed, ap, salvo, range, traits },
    notes,
  };
}
