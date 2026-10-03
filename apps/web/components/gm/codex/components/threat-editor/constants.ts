import {
  quickRow,
  quickScaling,
  threatCite,
  type ActionInput,
  type PoolPreset,
  type PoolPresetTable,
  type Threat,
  type ThreatClass,
} from "@wg/shared";

// What `threat.save` takes: a stat block without the id, source and page the server sets (issue #43).
export type ThreatDraft = Extract<ActionInput, { type: "threat.save" }>["data"];

export const FACTIONS: Threat["faction"][] = [
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
];

export const SIZES: Threat["size"][] = ["Tiny", "Small", "Avg", "Large", "Huge", "Gargantuan"];

// The classes a Tier slot can hold. "–" (null) is a printed thing before the last Tier — a follower not yet available —
// and never on the last one (Core p.323), which the schema also holds.
export const CLASS_OPTIONS: (ThreatClass | null)[] = ["T", "E", "A", "M", null];

export const ABILITY_TYPES: NonNullable<Threat["abilities"][number]["type"]>[] = [
  "BATTLECRY",
  "ACTION",
  "RUIN",
  "WRATH",
  "COMPLICATION",
  "REACTION",
  "ANNIHILATION",
];

// The seven Attributes in the order a stat block prints them, and which may be a printed "–" (Core p.323).
export const ATTR_FIELDS = [
  ["S", "STRENGTH", false],
  ["T", "TOUGHNESS", true],
  ["A", "AGILITY", false],
  ["I", "INITIATIVE", false],
  ["Wil", "WILLPOWER", true],
  ["Int", "INTELLECT", false],
  ["Fel", "FELLOWSHIP", true],
] as const satisfies readonly (readonly [keyof Threat["attributes"], string, boolean])[];

// A blank stat block: four Tiers of Troop, the smallest legal numbers, nothing else filled in. The GM types the rest,
// or CLONE fills it from a book entry.
export const blankDraft = (): ThreatDraft => ({
  name: "",
  faction: "heretic",
  threat: ["T", "T", "T", "T"],
  keywords: [],
  attributes: { S: 3, T: 3, A: 3, I: 3, Wil: 3, Int: 3, Fel: 3 },
  resilience: { value: 3 },
  defence: 1,
  wounds: 1, // Troops usually have 1 Wound and 3 Shock (Core p.326)
  shock: 3,
  skills: { default: 1, list: [] },
  bonuses: [],
  abilities: [],
  conviction: 1,
  resolve: 1,
  speed: 6,
  size: "Avg",
  options: [],
  mobAbilities: [],
});

// QUICK (Tier N): the Quick NPC Stats row for this campaign's Tier (Core p.326), which gives the eight derived
// numbers and nothing else - the table prints no Attributes, so those stay the blank draft's and the GM types them
// (rules-flow §11.110). The row is read through `quickRow`, so a Tier 5 game takes the Tier 4 row (§11.86), and the
// Wounds and Shock are the Troop line, because a blank draft is a Troop at every Tier (p.326).
export const quickDraft = (tier: number): ThreatDraft => {
  const { row, tier: read, capped } = quickRow(tier);
  const base = blankDraft();
  const troop = quickScaling({ row, tier: read, players: 0 }).troop;
  return {
    ...base,
    skills: { ...base.skills, default: row.skills },
    defence: row.defence,
    resilience: { value: row.resilience },
    wounds: troop.wounds,
    shock: troop.shock,
    conviction: row.conviction,
    resolve: row.resolve,
    speed: row.speed,
    note: `Quick NPC Stats, Tier ${read} (Core p.326)${capped ? ", the table's last row" : ""}`,
  };
};

// A stat block as a draft: everything but the id, source and page, which are the server's.
export const draftOf = (t: Threat): ThreatDraft => {
  const { id: _id, source: _source, page: _page, ...rest } = t;
  return structuredClone(rest);
};

// The same, for a copy: the note records where it came from, so the GM can tell a tweaked Ork Boy from the printed one.
export const cloneDraft = (t: Threat, cite: string): ThreatDraft => ({
  ...draftOf(t),
  note: `Cloned from ${t.name} (${cite})`,
});

// Threat Assessment p.7's Additional Ruin Actions are "available to any enemy capable of using Ruin Actions" (issue #43
// step 5). They already reach the GM's tablet as a Ruin pool table on /scene-presets, so the editor offers that table's
// rows as RUIN abilities rather than keeping a second copy of the text.
export const RUIN_ACTIONS_TABLE = "threat-assessment-ruin-actions";
export const ruinAbility = (table: PoolPresetTable, row: PoolPreset) => ({
  type: "RUIN" as const,
  name: row.name,
  text: `${row.text} (${threatCite({ source: table.source, page: row.page ?? table.page })})`,
  weapons: [],
});
