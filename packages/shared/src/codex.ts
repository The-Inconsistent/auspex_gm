import { z } from "zod";
import { ATTRIBUTES, Marker, Pool, SKILLS, Visibility, type Skill } from "./state.ts";
import type { Threat } from "./threat.ts";
import { Profiles } from "./threat-scale.ts";

// Campaign content beyond combat (docs/campaign-model.md). Broadcast separately from the live state,
// so a Wounds tap doesn't resend every NPC and beat.

const text = (max = 5000) => z.string().max(max);
const id = z.uuid();

// Attitude (optional rule, p.168): DN modifier for social Tests with this NPC.
export const Attitude = z.enum(["hostile", "uncooperative", "neutral", "friendly", "helpful"]);
export type Attitude = z.infer<typeof Attitude>;
// Added to the DN of a social Skill Test against the NPC (Core p.168).
export const ATTITUDE_DN: Record<Attitude, number> = {
  hostile: 4,
  uncooperative: 2,
  neutral: 0,
  friendly: -2,
  helpful: -4,
};

// Quick NPC Stats (Core p.326): one row per Tier, no Attributes, weapons or Keywords. The GM tweaks them to taste.
export const QUICK_NPC = {
  1: { skills: 4, defence: 1, resilience: 4, wounds: 3, shock: 2, conviction: 2, resolve: 2, speed: 6 },
  2: { skills: 6, defence: 2, resilience: 8, wounds: 5, shock: 4, conviction: 4, resolve: 4, speed: 7 },
  3: { skills: 8, defence: 3, resilience: 10, wounds: 7, shock: 6, conviction: 6, resolve: 6, speed: 8 },
  4: { skills: 10, defence: 4, resilience: 12, wounds: 10, shock: 8, conviction: 8, resolve: 8, speed: 9 },
} as const;
export type QuickTier = keyof typeof QUICK_NPC;
export type QuickRow = (typeof QUICK_NPC)[QuickTier];
// The table stops at Tier 4, so a Tier 5 game reads the Tier 4 row (rules-flow §11.86).
export function quickRow(tier: number): { row: QuickRow; tier: QuickTier; capped: boolean } {
  const t = Math.min(Math.max(Math.trunc(tier), 1), 4) as QuickTier;
  return { row: QUICK_NPC[t], tier: t, capped: tier > 4 };
}
// Scaling Threats (Core p.326): Troops usually have 1 Wound and 3 Shock; an Elite may add the Tier to both; an
// Adversary or Monstrous Creature may add the number of players plus the Tier. Shown, not fielded (§11.88).
export const quickScaling = ({ row, tier, players }: { row: QuickRow; tier: number; players: number }) => ({
  troop: { wounds: 1, shock: 3 },
  elite: { wounds: row.wounds + tier, shock: row.shock + tier },
  adversary: { wounds: row.wounds + players + tier, shock: row.shock + players + tier },
});

// Where an NPC's or encounter entry's stats come from.
export const StatSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bestiary"), threatId: z.string() }),
  z.object({
    kind: z.literal("quick"), // Quick NPC table, p.326
    tier: z.number().int().min(1).max(4),
    // The one Skill the GM tweaks up, e.g. "a known gun for hire might have a Ballistic Skill of 6 at Tier 1, instead
    // of 4" (p.326). A house field: the table prints no such column (§11.87).
    specialty: z
      .object({ skill: z.enum(Object.keys(SKILLS) as [Skill, ...Skill[]]), dice: z.number().int().min(1).max(20) })
      .optional(),
  }),
  z.object({ kind: z.literal("none") }),
]);
export type StatSource = z.infer<typeof StatSource>;

export const EncounterEntry = z.object({
  threatId: z.string(),
  count: z.number().int().min(1).max(500).default(1),
  asMob: z.boolean().default(false),
  marker: Marker.optional(),
  label: z.string().max(100).optional(),
  visibility: Visibility.optional(), // "hidden" for ambushers and reinforcements (rules-flow §11.56)
  // What the GM ticks on this entry before the fight: Tier 5 Threat Profiles (VoA p.126) and Scaling Threats
  // (Core p.326). Applied to the stat block as it is snapshotted (threat-scale.ts, rules-flow §11.103–§11.108).
  profiles: Profiles,
  scale: z.boolean().default(false),
});

// ponytail: app limit, not a rule. Bounds the inserts one beat.startEncounter runs in a transaction; a Mob is one row.
export const MAX_ENCOUNTER_ROWS = 60;
const encounterRows = (entries: z.infer<typeof EncounterEntry>[]) =>
  entries.reduce((n, e) => n + (e.asMob && e.count > 1 ? 1 : e.count), 0);

export const BeatType = z.enum(["briefing", "travel", "investigation", "social", "combat", "revelation", "rest"]);
export type BeatType = z.infer<typeof BeatType>;
export const BeatStatus = z.enum(["planned", "active", "done", "skipped"]);
export type BeatStatus = z.infer<typeof BeatStatus>;
// Where a scene can go next (issue #38): a note, with the next scene of the same adventure when the GM has written it.
// Planning only: DONE never follows one, since Core p.318 (step 5) warns against forcing the players down one path.
export const BeatExit = z.object({ label: text(200), beatId: id.nullable().default(null) });
export type BeatExit = z.infer<typeof BeatExit>;
export const MAX_EXITS = 10; // ponytail: app limit, not a rule; raise it if a scene needs more
// What a scene asks the Agents to roll (issue #39). The kind sets the pool: a Skill (its linked Attribute comes from
// SKILLS, Core pp.158-161), an Attribute alone (p.170), or a trait: Influence (p.169), Resolve for Fear and Terror
// (p.170, pp.199-200), Conviction for Corruption (pp.170, 285). An Opposed Test has no DN: most Icons wins (p.170).
// Any other Test may have no DN yet: the GM sets it at the table (p.160, rules-flow.md §11.75).
export const TestKind = z.enum(["skill", "attribute", "opposed", "influence", "resolve", "corruption"]);
export type TestKind = z.infer<typeof TestKind>;
// What each kind rolls: a Skill, an Attribute, either one (Opposed), or a trait the app doesn't name.
export const TEST_POOL = {
  skill: "skill",
  attribute: "attribute",
  opposed: "either",
  influence: "trait",
  resolve: "trait",
  corruption: "trait",
} as const satisfies Record<TestKind, string>;
// One Agent rolls, or each Agent rolls their own (rules-flow.md §11.73).
export const TestWho = z.enum(["one", "each"]);
export const MAX_TESTS = 12; // ponytail: app limits, not rules; raise them if a scene needs more
export const MAX_SHIFTS = 5;
export const BeatTest = z
  .object({
    kind: TestKind,
    skill: z
      .enum(Object.keys(SKILLS) as [Skill, ...Skill[]])
      .nullable()
      .default(null),
    attribute: z.enum(ATTRIBUTES).nullable().default(null),
    // ponytail: app limit. The table on p.161 stops at 12, but penalties stack; raise it if a GM needs more.
    dn: z.number().int().min(1).max(20).nullable().default(null),
    who: TestWho.default("one"),
    purpose: text(300).default(""),
    shifts: z.array(text(200)).max(MAX_SHIFTS).default([]), // what Shift 1, 2, 3… buys: the GM's plan, not a rule (p.165)
    onSuccess: text(500).default(""),
    onFailure: text(500).default(""), // the fail-forward consequence (p.319)
  })
  .superRefine((t, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const pool = TEST_POOL[t.kind];
    if (pool === "skill" && (!t.skill || t.attribute)) fail("A Skill Test names a Skill and no Attribute");
    if (pool === "attribute" && (!t.attribute || t.skill)) fail("An Attribute Test names an Attribute and no Skill");
    if (pool === "either" && !t.skill === !t.attribute) fail("An Opposed Test names a Skill or an Attribute, not both");
    if (pool === "trait" && (t.skill || t.attribute)) fail(`A ${t.kind} Test rolls a trait, not a Skill or Attribute`);
    if (pool === "either" && t.dn !== null) fail("An Opposed Test has no DN");
  });
export type BeatTest = z.infer<typeof BeatTest>;

// The same Test as another kind, keeping what still fits it: the Skill or Attribute it names, its DN and its Shifts.
// An Opposed Test keeps no Shifts: Shifting is defined against a DN (Core p.165), and an Opposed Test has none.
export function retypeTest(t: BeatTest, kind: TestKind): BeatTest {
  const pool = TEST_POOL[kind];
  const skill = pool === "skill" || (pool === "either" && !t.attribute) ? (t.skill ?? "Awareness") : null;
  const attribute = pool === "attribute" || (pool === "either" && !skill) ? (t.attribute ?? "S") : null;
  const opposed = pool === "either";
  return { ...t, kind, skill, attribute, dn: opposed ? null : (t.dn ?? 3), shifts: opposed ? [] : t.shifts };
}
// A scene's Ruin and Glory (issue #40): what earns the GM Ruin here (Core p.320: a failed Corruption or Fear Test, a 6 on
// the Wrath Die; p.163: a Complication taken as Ruin), what earns the Agents Glory (an impressive feat, p.316, which
// prints no amount: the GM sets it, rules-flow.md §11.77), and the spends the GM plans from either pool. A tap moves the
// pool, capped by poolMax as pp.164 and 320 say.
// ponytail: app limits, not rules, and no "used" flag per line: the GM watches the pool. Add one if mis-taps matter.
export const MAX_POOL_LINES = 20;
export const MAX_POOL_STEP = 10;
const poolStep = z.number().int().min(1).max(MAX_POOL_STEP);
export const PoolEntry = z.object({ text: text(200), amount: poolStep.default(1) });
export type PoolEntry = z.infer<typeof PoolEntry>;
export const PoolSpend = z.object({ pool: Pool, name: text(100), cost: poolStep, text: text(500).default("") });
export type PoolSpend = z.infer<typeof PoolSpend>;
// A spend the pool can't pay is refused before it's sent: `pool.adjust` floors at 0, so it would undercharge.
export const canSpend = (pools: Record<Pool, number>, { pool, cost }: Pick<PoolSpend, "pool" | "cost">) =>
  pools[pool] >= cost;

// A place's hazards (issue #49): a book row by its id (the text stays in the GM-only catalogue, as a prepared encounter
// holds a threatId, not a stat block), with the intensity the GM picked where the book prints them (rules-flow.md
// §11.94), or the GM's own. Each has an id of its own, so a scene can pick which of its place's hazards apply (§11.95).
export const Intensity = z.enum(["Light", "Moderate", "Intense"]); // Electricity, Rad Poison (Core pp.201–202)
export type Intensity = z.infer<typeof Intensity>;
export const MAX_HAZARDS = 30; // ponytail: app limit, not a rule; raise it if a place needs more
export const LocationHazard = z.discriminatedUnion("kind", [
  z.object({
    id,
    kind: z.literal("book"),
    hazardId: z.string().regex(/^[a-z0-9-]+$/),
    variant: Intensity.nullable().default(null),
  }),
  z.object({
    id,
    kind: z.literal("custom"),
    name: text(200).min(1),
    tests: z.array(BeatTest).max(4).default([]),
    effect: text(1000).default(""),
  }),
]);
export type LocationHazard = z.infer<typeof LocationHazard>;
// A scene's pick of its place's hazards, by entry id, and whether the Agents spotted it in advance: then the DN to avoid
// it drops by the GM's call (TA p.9, §11.92).
export const BeatHazard = z.object({ id, spotted: z.boolean().default(false) });
export type BeatHazard = z.infer<typeof BeatHazard>;

export const AdventureStatus = z.enum(["planned", "running", "done"]);
export const FactionStance = z.enum(["ally", "neutral", "rival", "enemy"]);
export type FactionStance = z.infer<typeof FactionStance>;
export const MAX_FACTION_KEYWORDS = 20;
export const MAX_KEYWORD_LENGTH = 60;

// Editable fields per kind (what the GM sends). `id`/`campaignId` are server-owned.
export const CodexInput = {
  faction: z.object({
    name: text(100),
    keywords: z.array(text(MAX_KEYWORD_LENGTH)).max(MAX_FACTION_KEYWORDS).default([]),
    stance: FactionStance.default("neutral"),
    notes: text().default(""),
    secrets: text().default(""),
  }),
  adventure: z.object({
    title: text(200),
    premise: text().default(""),
    status: AdventureStatus.default("planned"),
  }),
  beat: z.object({
    adventureId: id,
    title: text(200),
    goal: text(500).default(""), // what the Agents are after in this scene
    type: BeatType.default("social"),
    status: BeatStatus.default("planned"),
    readAloud: text().default(""),
    gmNotes: text().default(""),
    outcome: text().default(""),
    locationId: id.nullable().default(null),
    npcIds: z.array(id).max(50).default([]),
    handoutIds: z.array(id).max(50).default([]),
    encounter: z
      .array(EncounterEntry)
      .max(30)
      .refine(
        (es) => encounterRows(es) <= MAX_ENCOUNTER_ROWS,
        `At most ${MAX_ENCOUNTER_ROWS} combatants; group large counts as a Mob`,
      )
      .default([]),
    exits: z.array(BeatExit).max(MAX_EXITS).default([]),
    tests: z.array(BeatTest).max(MAX_TESTS).default([]),
    ruin: z.array(PoolEntry).max(MAX_POOL_LINES).default([]),
    glory: z.array(PoolEntry).max(MAX_POOL_LINES).default([]),
    spends: z.array(PoolSpend).max(MAX_POOL_LINES).default([]),
    hazards: z.array(BeatHazard).max(MAX_HAZARDS).default([]),
  }),
  location: z.object({
    name: text(200),
    parentId: id.nullable().default(null),
    description: text().default(""),
    gmNotes: text().default(""),
    hazards: text().default(""), // the GM's free-text notes, kept beside the list (issue #49)
    hazardList: z.array(LocationHazard).max(MAX_HAZARDS).default([]),
    revealed: z.boolean().default(false),
  }),
  npc: z.object({
    name: text(200),
    factionId: id.nullable().default(null),
    role: text(200).default(""),
    description: text().default(""),
    gmNotes: text().default(""),
    secrets: text().default(""),
    attitude: Attitude.default("neutral"),
    statSource: StatSource.default({ kind: "none" }),
    revealed: z.boolean().default(false),
  }),
  handout: z.object({
    title: text(200),
    body: text(20000).default(""),
    revealed: z.boolean().default(false),
    audience: z.array(id).max(20).default([]), // character ids it's revealed to; empty = every player
  }),
} as const;
export type CodexKind = keyof typeof CodexInput;
export const CODEX_KINDS = Object.keys(CodexInput) as CodexKind[];

type Row<K extends CodexKind> = z.infer<(typeof CodexInput)[K]> & { id: string };
export type Codex = {
  factions: Row<"faction">[];
  adventures: (Row<"adventure"> & { beats: (Row<"beat"> & { order: number })[] })[];
  locations: Row<"location">[];
  npcs: Row<"npc">[];
  handouts: (Row<"handout"> & { revealedAt: string | null })[];
  sessions: { id: string; number: number; startedAt: string; endedAt: string | null; recap: string; xp: number }[];
  // Stat blocks the GM wrote or cloned for this table (issue #43). Book text, so GM sockets only: `toPlayerCodex`
  // sends none, and the GM's app merges them into the bestiary every picker already reads.
  customThreats: Threat[];
};

// What one player's phone gets (null: a player without a character): revealed NPCs, locations and handouts, without GM
// notes or secrets, plus session recaps. A handout with an audience reaches only those Agents' players. Ids that point
// at something hidden (factions, an unrevealed parent location, the rest of an audience) are cleared too.
export function toPlayerCodex(c: Codex, characterId: string | null): Codex {
  const shownLocations = new Set(c.locations.filter((l) => l.revealed).map((l) => l.id));
  return {
    factions: [],
    adventures: [],
    locations: c.locations
      .filter((l) => l.revealed)
      .map((l) => ({
        ...l,
        gmNotes: "",
        hazards: "",
        hazardList: [],
        parentId: l.parentId && shownLocations.has(l.parentId) ? l.parentId : null,
      })),
    npcs: c.npcs
      .filter((n) => n.revealed)
      // Attitude stays: the table may see how an NPC regards them (rules-flow §11.89).
      .map((n) => ({ ...n, gmNotes: "", secrets: "", statSource: { kind: "none" }, factionId: null })),
    handouts: c.handouts
      .filter((h) => h.revealed && (!h.audience.length || (!!characterId && h.audience.includes(characterId))))
      .map((h) => ({ ...h, audience: h.audience.length && characterId ? [characterId] : [] })),
    sessions: c.sessions,
    customThreats: [], // a custom threat is a stat block: players never receive one
  };
}

// Places nest through `parentId` (GitHub issue #50). Whether putting `id` inside `parentId` would make a loop: the parent
// is the place itself, or walking up from the parent reaches it. `parentOf` holds every place's current parent; the
// visited set stops on a loop that is already there.
export function wouldCycle({
  id,
  parentId,
  parentOf,
}: {
  id: string;
  parentId: string | null;
  parentOf: ReadonlyMap<string, string | null>;
}): boolean {
  const seen = new Set<string>();
  for (let at = parentId; at && !seen.has(at); at = parentOf.get(at) ?? null) {
    if (at === id) return true;
    seen.add(at);
  }
  return false;
}

export type PlaceNode<T> = { row: T; inside: number; children: PlaceNode<T>[] };

// The places as a tree, in the rows' order. A root has no parent, or a parent that isn't in `rows` (a player's codex
// drops hidden ones). A place no root reaches (a loop saved before the guard) becomes a root, so none disappears.
export function placeTree<T extends { id: string; parentId: string | null }>(rows: readonly T[]): PlaceNode<T>[] {
  const ids = new Set(rows.map((r) => r.id));
  const kids = new Map<string, T[]>();
  for (const r of rows)
    if (r.parentId && ids.has(r.parentId)) kids.set(r.parentId, [...(kids.get(r.parentId) ?? []), r]);
  const placed = new Set<string>();
  const grow = (row: T): PlaceNode<T> => {
    placed.add(row.id);
    const children = (kids.get(row.id) ?? []).filter((c) => !placed.has(c.id)).map(grow);
    return { row, children, inside: children.reduce((n, c) => n + 1 + c.inside, 0) };
  };
  const roots = rows.filter((r) => !r.parentId || !ids.has(r.parentId)).map(grow);
  for (const r of rows) if (!placed.has(r.id)) roots.push(grow(r));
  return roots;
}

// The tree in reading order with each place's depth, for a select or a flat list.
export const flatTree = <T>(nodes: PlaceNode<T>[], depth = 0): { row: T; depth: number }[] =>
  nodes.flatMap((n) => [{ row: n.row, depth }, ...flatTree(n.children, depth + 1)]);
