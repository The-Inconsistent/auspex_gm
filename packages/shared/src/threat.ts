import { z } from "zod";
import { SOURCES } from "./source.ts";

// Bestiary format: Core Rulebook p.323. Stats don't vary by Tier, only the Threat class does.

// Threat books that aren't creation/wargear sources, so they have no SOURCES entry. The threat `source` enum is built
// from these keys, so a new threat-only book can't be added without its cite.
export const THREAT_ONLY_SOURCES = {
  "threat-assessment": { cite: "TA", official: true },
  "gutshivas-kommandos": { cite: "GK", official: true },
  "high-altar-of-technology": { cite: "HAT", official: false }, // homebrew Mechanicus supplement, no printed pages: PDF pages
  // Not a book at all: a stat block the GM wrote or cloned for their own table (GitHub issue #43). It lives in the
  // campaign's `custom_threat` rows, never in threats/, and its id is always `custom-<slug>`. It has no page, so its
  // cite is "Custom" alone and the Books tab never offers it as a PDF (`BOOKS` leaves it out). `official` gates the homebrew
  // books out of the creation catalogues, which a custom threat never joins.
  custom: { cite: "Custom", official: false },
} as const;
export const THREAT_SOURCES = { ...SOURCES, ...THREAT_ONLY_SOURCES };
export type ThreatSource = keyof typeof THREAT_SOURCES;

// "Core p.339", "TA p.8": a stat block's page cite. A custom threat's `page` is a placeholder, so it cites no page.
export const threatCite = ({ source, page }: { source: ThreatSource; page: number }) =>
  source === "custom" ? THREAT_SOURCES.custom.cite : `${THREAT_SOURCES[source].cite} p.${page}`;

// A custom threat's id, from its slug. The id carries the slug so an import needs no rewriting of the `threatId`s
// inside beats and NPCs (GitHub issue #43).
export const CUSTOM_PREFIX = "custom-";
export const customThreatId = (slug: string) => `${CUSTOM_PREFIX}${slug}`;
export const isCustomThreatId = (id: string) => id.startsWith(CUSTOM_PREFIX);

export const MAX_SLUG = 60;
// ponytail: 999 same-named threats in one campaign is already absurd; a fuller scheme if a table ever gets there
const MAX_SLUG_TRIES = 999;

// A custom threat's slug, made once from its name and never changed again, so a prepared encounter or an NPC pointing at
// `custom-<slug>` survives a rename (issue #43). `taken` is this campaign's slugs; a clash takes -2, -3…
export function threatSlug(name: string, taken: Iterable<string> = []): string {
  const base =
    name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/\p{M}+/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_SLUG)
      .replace(/-+$/, "") || "threat"; // a name with nothing a slug can keep ("???") still needs one
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n <= MAX_SLUG_TRIES; n++) {
    const suffix = `-${n}`;
    const next = `${base.slice(0, MAX_SLUG - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!used.has(next)) return next;
  }
  return `${base.slice(0, MAX_SLUG - 14)}-${Date.now().toString(36)}`; // last resort, still unique per campaign
}

// A threat on a picker row, a select or a scene card: the name with where it came from.
export const threatLabel = (t: { name: string; source: ThreatSource; page: number }) => `${t.name} · ${threatCite(t)}`;

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
  // On a character's sheet only, and all four about upgrades (Core p.227, rules-flow.md §11.63–§11.65). What is stored
  // is the profile **as printed** plus the ids of what is fitted, never the result: `withUpgrades` derives the shown
  // profile on the way out, so nothing double-applies and a data fix re-derives.
  wargearId: z.string().optional(), // the catalogue entry this profile came from
  upgrades: z.array(z.string()).max(8).optional(), // from the build: starting wargear's own upgrades (§11.42)
  fitted: z.array(z.string()).max(8).optional(), // fitted in play (character.fitUpgrade), so a rebuild keeps them
  // A hand-written profile a rebuild matched to its catalogue entry (keepPlay), so an upgrade can be fitted to it. Its
  // numbers may already count a Talent (a volkus pregen's printed Rapid Fire), so no weapon effect is applied to it
  // (rules-flow.md §11.68) until the build's own line replaces it.
  asPrinted: z.literal(true).optional(),
  // Derived, never stored: set by `withUpgrades` for display.
  upgradeNames: z.array(z.string()).optional(),
  effects: z.array(z.string()).optional(), // the Talents and abilities `withWeaponEffects` applied, by name
  notes: z.array(z.string()).optional(), // what a profile can't hold, for the GM to apply (the `gm` mods)
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

// The class as the GM reads it on a chip or a tracker row (pp.323-324).
export const THREAT_CLASS_LABEL: Record<ThreatClass, string> = {
  T: "TROOP",
  E: "ELITE",
  A: "ADVERSARY",
  M: "MONSTROUS",
};

// Two or more Troops that share a profile form one Mob (p.324).
export const MOB_MIN = 2;

export type EncounterBudget = { troops: number; inMobs: number; elites: number; enemies: number };

// Building Encounters (Threat Assessment p.8): two Troops per Agent, half of those forming a Mob, plus one Elite or
// Adversary; more than 10 enemies is hard to keep track of. Fortified ground - cover, clear lines of sight, distance
// or surprise - lets the Agents take on twice as many, so it doubles every target (rules-flow §11.82).
export const encounterBudget = ({
  agents,
  fortified = false,
}: {
  agents: number;
  fortified?: boolean;
}): EncounterBudget => {
  const ground = fortified ? 2 : 1;
  const troops = Math.max(0, agents) * 2 * ground;
  return { troops, inMobs: Math.floor(troops / 2), elites: ground, enemies: 10 * ground };
};

export type RosterTally = {
  troops: number;
  inMobs: number;
  elites: number;
  monstrous: number;
  models: number;
  tracked: number;
  unclassed: number;
};

type ClassedEntry = { cls: ThreatClass | null; count: number; asMob?: boolean };

// A roster counted line by line. `models` is bodies on the table; `tracked` is combatants the GM moves, where a Mob is
// one (the same rule as `encounterRows`, codex.ts). Both answer "more than 10 enemies" (TA p.8, rules-flow §11.82).
export const tallyByClass = (entries: readonly ClassedEntry[]): RosterTally =>
  entries.reduce<RosterTally>(
    (t, e) => {
      const count = Math.max(0, e.count);
      const mob = e.asMob === true && count >= MOB_MIN;
      return {
        troops: t.troops + (e.cls === "T" ? count : 0),
        inMobs: t.inMobs + (e.cls === "T" && mob ? count : 0),
        elites: t.elites + (e.cls === "E" || e.cls === "A" ? count : 0),
        monstrous: t.monstrous + (e.cls === "M" ? count : 0),
        models: t.models + count,
        tracked: t.tracked + (mob ? 1 : count),
        unclassed: t.unclassed + (e.cls === null ? count : 0),
      };
    },
    { troops: 0, inMobs: 0, elites: 0, monstrous: 0, models: 0, tracked: 0, unclassed: 0 },
  );

// A prepared encounter's roster, classed at the campaign's Tier (p.323: the class is printed per Tier). The entries are
// structural because `EncounterEntry` lives in codex.ts, which imports this file. An id the bestiary lost is unclassed.
export const rosterTally = (
  entries: readonly { threatId: string; count: number; asMob?: boolean }[],
  { bestiary, tier }: { bestiary: readonly Threat[]; tier: number },
): RosterTally => {
  const byId = new Map(bestiary.map((t) => [t.id, t]));
  return tallyByClass(
    entries.map((e) => {
      const t = byId.get(e.threatId);
      return { cls: t ? threatClassAt(t, tier) : null, count: e.count, asMob: e.asMob };
    }),
  );
};
