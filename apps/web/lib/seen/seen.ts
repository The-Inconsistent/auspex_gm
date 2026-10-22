import type { Codex } from "@wg/shared";

export const SEEN_KINDS = ["handout", "npc", "location"] as const;
export type SeenKind = (typeof SEEN_KINDS)[number];

type Shown = { id: string; imageId?: string | null };

// What one entry is known by: its own key, plus its picture's, so a picture revealed later on a seen entry is new again.
// toPlayerCodex already nulls the id of a held-back picture, so an id here is a shown one.
export const entryKeys = (kind: SeenKind, e: Shown): string[] => [
  `${kind}:${e.id}`,
  ...(e.imageId ? [`picture:${e.imageId}`] : []),
];

const shown = (codex: Pick<Codex, "handouts" | "npcs" | "locations">): [SeenKind, Shown][] => [
  ...codex.handouts.map((e): [SeenKind, Shown] => ["handout", e]),
  ...codex.npcs.map((e): [SeenKind, Shown] => ["npc", e]),
  ...codex.locations.map((e): [SeenKind, Shown] => ["location", e]),
];

// Every key this phone is shown now (the player's codex holds only revealed entries).
export const shownKeys = (codex: Pick<Codex, "handouts" | "npcs" | "locations">): string[] =>
  shown(codex).flatMap(([kind, e]) => entryKeys(kind, e));

// The keys not yet seen. `seen: null` is a device that has never opened this campaign (or can't remember): nothing is
// new, so a fresh phone isn't flooded; the caller then stores shownKeys as the baseline.
export const freshKeys = (codex: Pick<Codex, "handouts" | "npcs" | "locations">, seen: ReadonlySet<string> | null) =>
  new Set(seen ? shownKeys(codex).filter((k) => !seen.has(k)) : []);

// Whether this entry (or its picture) is new.
export const isFresh = ({ fresh, kind, entry }: { fresh: ReadonlySet<string>; kind: SeenKind; entry: Shown }) =>
  entryKeys(kind, entry).some((k) => fresh.has(k));

// How many entries are new (an entry with a new picture counts once).
export const freshCount = (codex: Pick<Codex, "handouts" | "npcs" | "locations">, fresh: ReadonlySet<string>) =>
  shown(codex).filter(([kind, e]) => isFresh({ fresh, kind, entry: e })).length;
