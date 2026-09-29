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
