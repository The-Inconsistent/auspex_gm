import { z } from "zod";
import { Requirement } from "./creation.ts";
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
