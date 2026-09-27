import { z } from "zod";
import { Marker, Visibility } from "./state.ts";

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
