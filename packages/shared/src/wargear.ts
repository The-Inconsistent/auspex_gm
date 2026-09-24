import { z } from "zod";
import { Rarity, type RequisitionKind } from "./requisition.ts";
import { Weapon } from "./threat.ts";

// The Wargear catalogue (Core pp.211–247, VoA pp.59–75), for the GM's requisition form. It holds book text, so like the bestiary
// it is served to the GM only.

// "grenade": Grenades and Missiles, which are requisitioned like Ammo (p.229); their launchers are "weapon".
// Books the catalogue draws on, and how a page cite names them.
export const WARGEAR_SOURCES = { core: "Core", "vow-of-absolution": "VoA" } as const;
export const WargearSource = z.enum(Object.keys(WARGEAR_SOURCES) as [keyof typeof WARGEAR_SOURCES, ...(keyof typeof WARGEAR_SOURCES)[]]);
export const wargearCite = ({ source, page }: { source: WargearSource; page: number }) => `${WARGEAR_SOURCES[source]} p.${page}`;
export type WargearSource = z.infer<typeof WargearSource>;

export const WargearKind = z.enum(["weapon", "grenade", "armour", "equipment", "upgrade", "ammo", "augmetic"]);
export type WargearKind = z.infer<typeof WargearKind>;

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
  source: WargearSource,
  page: z.number().int().positive(), // printed page in `source`
  category: z.string().min(1).max(60), // the table or section heading, e.g. "Bolt Weapons"
  kind: WargearKind,
  value: z.number().int().min(0).max(30).nullable(), // null: none printed
  rarity: Rarity.nullable(),
  keywords: z.array(z.string().min(1)).default([]), // as printed, upper case; "[ANY]" kept
  weapon: WargearWeapon.optional(),
  armour: WargearArmour.optional(),
  effect: z.string().max(3000).default(""), // the Effect line (equipment, upgrades, augmetics, special ammo)
  note: z.string().max(500).optional(), // a print error copied as printed, or a transcription remark
});
export type Wargear = z.infer<typeof Wargear>;

// A catalogue weapon as a sheet weapon. A thrown range becomes N × the character's Strength in metres (p.207); a
// weapon that is also melee keeps its reach and notes the throw as a trait.
export function sheetWeapon({ name, weapon: { thrown, range, ...w } }: { name: string; weapon: WargearWeapon }, strength: number) {
  const throwM = thrown === undefined ? undefined : thrown * strength;
  if (range === undefined) return { name, ...w, range: [throwM ?? 1] };
  return { name, ...w, range, traits: throwM === undefined ? w.traits : [...w.traits, `Thrown (${throwM} m)`] };
}

// A catalogue item as a gear line on the sheet (≤ 200 characters): the name, armour's AR, and where to read it.
export function gearLine({ name, armour: a, source, page }: Pick<Wargear, "name" | "armour" | "source" | "page">) {
  const ar = a ? `AR ${a.ar}${a.invulnerable ? "*" : ""}${a.powered ? `, Powered (${a.powered})` : ""}${a.traits.length ? `, ${a.traits.join(", ")}` : ""}; ` : "";
  return `${name} (${ar}${wargearCite({ source, page })})`.slice(0, 200);
}

// Which requisition Test a catalogue item takes: Ammo and Grenades share the session's Ammo Test (p.205, p.229).
export const requisitionKindOf = (kind: WargearKind): RequisitionKind => (kind === "ammo" || kind === "grenade" ? kind : "wargear");
