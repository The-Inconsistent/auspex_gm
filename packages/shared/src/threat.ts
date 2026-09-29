import { z } from "zod";
import { SOURCES } from "./source.ts";

// Bestiary format: Core Rulebook p.323. Stats don't vary by Tier, only the Threat class does.

// Threat books that aren't creation/wargear sources, so they have no SOURCES entry. The threat `source` enum is built
// from these keys, so a new threat-only book can't be added without its cite.
export const THREAT_ONLY_SOURCES = {
  "threat-assessment": { cite: "TA" },
  "gutshivas-kommandos": { cite: "GK" },
  "high-altar-of-technology": { cite: "HAT" }, // homebrew Mechanicus supplement, no printed pages: PDF pages
} as const;
export const THREAT_SOURCES = { ...SOURCES, ...THREAT_ONLY_SOURCES };
export type ThreatSource = keyof typeof THREAT_SOURCES;

// "Core p.339", "TA p.8": a stat block's page cite.
export const threatCite = ({ source, page }: { source: ThreatSource; page: number }) =>
  `${THREAT_SOURCES[source].cite} p.${page}`;

export const ThreatClass = z.enum(["T", "E", "A", "M"]); // Troop, Elite, Adversary, Monstrous Creature
export type ThreatClass = z.infer<typeof ThreatClass>;

export const Weapon = z.object({
  name: z.string(),
  count: z.number().int().positive().optional(), // e.g. Stikkbombz (2)
  damage: z.number().int(),
  ed: z.union([z.number().int(), z.string()]), // "1d3" on some weapons
  ap: z.number().int().max(0).optional(),
  range: z.array(z.number().int().positive()).min(1).max(3), // [1] melee, [16] thrown, [S, M, L] ranged
  salvo: z.number().int().nonnegative().nullable().optional(), // null = "–"
  traits: z.array(z.string()).default([]),
  // On a character's sheet only: the catalogue entry this profile came from, and the upgrades fitted to it
  // (Core p.227, rules-flow.md §11.60–§11.62). `applyUpgrades` derives the shown profile from the two.
  wargearId: z.string().optional(),
  upgrades: z.array(z.string()).max(8).optional(),
});
export type Weapon = z.infer<typeof Weapon>;

export const AbilityType = z.enum(["BATTLECRY", "ACTION", "RUIN", "WRATH", "COMPLICATION", "REACTION", "ANNIHILATION"]);

export const Ability = z.object({
  type: AbilityType.optional(), // untyped = plain rule, e.g. Mob Rule
  name: z.string().optional(),
  text: z.string().optional(),
  weapons: z.array(Weapon).default([]),
});
export type Ability = z.infer<typeof Ability>;

export const ThreatSize = z.enum(["Tiny", "Small", "Avg", "Large", "Huge", "Gargantuan"]); // smallest first
export type ThreatSize = z.infer<typeof ThreatSize>;

export const ThreatOption = z.object({
  kind: z.enum(["mob", "variant"]),
  name: z.string(),
  text: z.string(),
  weapons: z.array(Weapon).default([]),
  abilities: z.array(Ability).default([]),
});

export const Threat = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  source: z.enum(Object.keys(THREAT_SOURCES) as [ThreatSource, ...ThreatSource[]]).default("core"),
  page: z.number().int().positive(), // printed page number in `source`
  faction: z.enum([
    "imperial",
    "heretic",
    "daemon",
    "ork",
    "aeldari",
    "drukhari",
    "genestealer",
    "necron",
    "tau",
    "mechanicus",
    "votann",
  ]),
  // Tier 1..4 (supplements add Tier 5). null is a printed "—": no class at that Tier, as a follower not yet
  // available (Arco-Flagellant, Apocrypha p.457). The last Tier is always printed.
  threat: z
    .array(ThreatClass.nullable())
    .min(4)
    .max(5)
    .refine((t) => t.at(-1) !== null, "the last Tier is printed"),
  keywords: z.array(z.string()).min(1),
  // null = a printed "–": no score, the Threat auto-passes those Tests (the High Altar of Technology's Kastelan Robot, PDF p.22)
  attributes: z.object({
    S: z.number().int(),
    T: z.number().int().nullable(),
    A: z.number().int(),
    I: z.number().int(),
    Wil: z.number().int().nullable(),
    Int: z.number().int(),
    Fel: z.number().int().nullable(),
  }),
  resilience: z.object({ value: z.number().int(), note: z.string().optional() }),
  defence: z.number().int(),
  wounds: z.number().int().positive(),
  shock: z.number().int().positive().nullable(), // null = "–", never suffers Shock
  skills: z.object({
    default: z.number().int().nullable(),
    list: z.array(z.object({ name: z.string(), dice: z.number().int(), passive: z.number().int().optional() })),
  }),
  personalRuin: z.number().int().positive().optional(), // Champions
  bonuses: z.array(z.object({ name: z.string(), text: z.string() })).default([]),
  abilities: z.array(Ability).default([]),
  determination: z.string().optional(),
  conviction: z.number().int().nullable(), // null = "–", as attributes
  resolve: z.number().int().nullable(),
  speed: z.number().int(),
  size: ThreatSize,
  options: z.array(ThreatOption).default([]),
  mobAbilities: z.array(Ability).default([]),
  note: z.string().max(500).optional(), // a print error copied as printed, or a transcription remark
});
export type Threat = z.infer<typeof Threat>;

// Below its first printed Tier a threat takes that Tier's class, so the GM can still field it.
export const threatClassAt = (t: Threat, tier: number): ThreatClass =>
  t.threat.slice(Math.min(tier, t.threat.length) - 1).find((c) => c !== null)!;

// What each class changes at the table (pp.323-324), shown to the GM as chips. Free Monstrous Determination is §11.3.
export const THREAT_CLASS_RULES: Record<ThreatClass, string[]> = {
  T: ["No Crits or Complications (bar abilities)", "Determination: 1 Ruin", "No Ammo or Salvo", "Forms Mobs"],
  E: ["Determination: 1 Ruin", "3 Ammo, Salvo"],
  A: ["Determination free", "Unlimited Ammo, Salvo"],
  M: ["Determination free", "Unlimited Ammo, Salvo", "Immune: Fear, Pinned, Staggered", "Causes Terror"],
};

// Monstrous Creatures are immune to these Conditions (p.323).
export const MONSTROUS_IMMUNE = ["Fear", "Pinned", "Staggered"] as const;
