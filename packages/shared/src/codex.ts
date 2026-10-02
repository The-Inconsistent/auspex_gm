import { z } from "zod";
import { ATTRIBUTES, Marker, Pool, SKILLS, Visibility, type Skill } from "./state.ts";

// Campaign content beyond combat (docs/campaign-model.md). Broadcast separately from the live state,
// so a Wounds tap doesn't resend every NPC and beat.

const text = (max = 5000) => z.string().max(max);
const id = z.uuid();

// Attitude (optional rule, p.168): DN modifier for social Tests with this NPC.
export const Attitude = z.enum(["hostile", "uncooperative", "neutral", "friendly", "helpful"]);

// Where an NPC's or encounter entry's stats come from.
export const StatSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bestiary"), threatId: z.string() }),
  z.object({ kind: z.literal("quick"), tier: z.number().int().min(1).max(4) }), // Quick NPC table, p.326
  z.object({ kind: z.literal("none") }),
]);

export const EncounterEntry = z.object({
  threatId: z.string(),
  count: z.number().int().min(1).max(500).default(1),
  asMob: z.boolean().default(false),
  marker: Marker.optional(),
  label: z.string().max(100).optional(),
  visibility: Visibility.optional(), // "hidden" for ambushers and reinforcements (rules-flow §11.56)
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

export const AdventureStatus = z.enum(["planned", "running", "done"]);
export const FactionStance = z.enum(["ally", "neutral", "rival", "enemy"]);

// Editable fields per kind (what the GM sends). `id`/`campaignId` are server-owned.
export const CodexInput = {
  faction: z.object({
    name: text(100),
    keywords: z.array(text(60)).max(20).default([]),
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
  }),
  location: z.object({
    name: text(200),
    parentId: id.nullable().default(null),
    description: text().default(""),
    gmNotes: text().default(""),
    hazards: text().default(""),
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
        parentId: l.parentId && shownLocations.has(l.parentId) ? l.parentId : null,
      })),
    npcs: c.npcs
      .filter((n) => n.revealed)
      .map((n) => ({ ...n, gmNotes: "", secrets: "", statSource: { kind: "none" }, factionId: null })),
    handouts: c.handouts
      .filter((h) => h.revealed && (!h.audience.length || (!!characterId && h.audience.includes(characterId))))
      .map((h) => ({ ...h, audience: h.audience.length && characterId ? [characterId] : [] })),
    sessions: c.sessions,
  };
}
