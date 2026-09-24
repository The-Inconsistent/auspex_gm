import { z } from "zod";

// Bestiary format: Core Rulebook p.323. Stats don't vary by Tier, only the Threat class does.

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
});
export type Weapon = z.infer<typeof Weapon>;

export const AbilityType = z.enum([
  "BATTLECRY",
  "ACTION",
  "RUIN",
  "WRATH",
  "COMPLICATION",
  "REACTION",
  "ANNIHILATION",
]);

export const Ability = z.object({
  type: AbilityType.optional(), // untyped = plain rule, e.g. Mob Rule
  name: z.string().optional(),
  text: z.string().optional(),
  weapons: z.array(Weapon).default([]),
});
export type Ability = z.infer<typeof Ability>;

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
  source: z.enum(["core", "threat-assessment", "gutshivas-kommandos", "vow-of-absolution"]).default("core"),
  page: z.number().int().positive(), // printed page number in `source`
  faction: z.enum(["imperial", "heretic", "daemon", "ork", "aeldari", "drukhari", "genestealer", "necron", "tau", "mechanicus"]),
  threat: z.array(ThreatClass).min(4).max(5), // Tier 1..4 (supplements add Tier 5)
  keywords: z.array(z.string()).min(1),
  attributes: z.object({
    S: z.number().int(),
    T: z.number().int(),
    A: z.number().int(),
    I: z.number().int(),
    Wil: z.number().int(),
    Int: z.number().int(),
    Fel: z.number().int(),
  }),
  resilience: z.object({ value: z.number().int(), note: z.string().optional() }),
  defence: z.number().int(),
  wounds: z.number().int().positive(),
  shock: z.number().int().positive().nullable(), // null = "–", never suffers Shock
  skills: z.object({
    default: z.number().int().nullable(),
    list: z.array(
      z.object({ name: z.string(), dice: z.number().int(), passive: z.number().int().optional() }),
    ),
  }),
  personalRuin: z.number().int().positive().optional(), // Champions
  bonuses: z.array(z.object({ name: z.string(), text: z.string() })).default([]),
  abilities: z.array(Ability).default([]),
  determination: z.string().optional(),
  conviction: z.number().int(),
  resolve: z.number().int(),
  speed: z.number().int(),
  size: z.enum(["Tiny", "Small", "Avg", "Large", "Huge", "Gargantuan"]),
  options: z.array(ThreatOption).default([]),
  mobAbilities: z.array(Ability).default([]),
});
export type Threat = z.infer<typeof Threat>;

export const threatClassAt = (t: Threat, tier: number): ThreatClass => t.threat[Math.min(tier, t.threat.length) - 1]!;

// What each class changes at the table (pp.323-324), shown to the GM as chips. Free Monstrous Determination is §11.3.
export const THREAT_CLASS_RULES: Record<ThreatClass, string[]> = {
  T: ["No Crits or Complications (bar abilities)", "Determination: 1 Ruin", "No Ammo or Salvo", "Forms Mobs"],
  E: ["Determination: 1 Ruin", "3 Ammo, Salvo"],
  A: ["Determination free", "Unlimited Ammo, Salvo"],
  M: ["Determination free", "Unlimited Ammo, Salvo", "Immune: Fear, Pinned, Staggered", "Causes Terror"],
};

// Monstrous Creatures are immune to these Conditions (p.323).
export const MONSTROUS_IMMUNE = ["Fear", "Pinned", "Staggered"] as const;
