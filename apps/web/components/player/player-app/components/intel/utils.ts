import type { Codex } from "@wg/shared";

import { headerOf } from "@/components/ui/handout-doc/constants";
import { isFresh } from "@/lib/seen/seen";

import { HANDOUT_STAMP, STAMP } from "./constants";

type Handout = Codex["handouts"][number];
type Npc = Codex["npcs"][number];
type Place = Codex["locations"][number];

// One codex entry INTEL can open, tagged by kind so the sheet and the inbox draw each as it needs.
export type IntelEntry =
  { kind: "handout"; entry: Handout } | { kind: "npc"; entry: Npc } | { kind: "location"; entry: Place };
export type EntryRef = { kind: IntelEntry["kind"]; id: string };

// Newest reveal first, as HANDOUTS always listed them.
export const handoutsNewestFirst = (handouts: Handout[]) =>
  [...handouts].sort((a, b) => (b.revealedAt ?? "").localeCompare(a.revealedAt ?? ""));

export const asEntries = {
  handouts: (codex: Codex): IntelEntry[] =>
    handoutsNewestFirst(codex.handouts).map((entry) => ({ kind: "handout", entry })),
  npcs: (codex: Codex): IntelEntry[] => codex.npcs.map((entry) => ({ kind: "npc", entry })),
  locations: (codex: Codex): IntelEntry[] => codex.locations.map((entry) => ({ kind: "location", entry })),
};

// What INBOX holds: every entry the phone hasn't seen (an entry with a new picture counts), handouts first.
export const inboxEntries = (codex: Codex, fresh: ReadonlySet<string>): IntelEntry[] =>
  [...asEntries.handouts(codex), ...asEntries.npcs(codex), ...asEntries.locations(codex)].filter((e) =>
    isFresh({ fresh, kind: e.kind, entry: e.entry }),
  );

// The live entry behind a ref, so an edit on the GM's side shows in an open sheet; null once it is hidden again.
export function findEntry(codex: Codex, ref: EntryRef | null): IntelEntry | null {
  if (!ref) return null;
  const all = [...asEntries.handouts(codex), ...asEntries.npcs(codex), ...asEntries.locations(codex)];
  return all.find((e) => e.kind === ref.kind && e.entry.id === ref.id) ?? null;
}

export const entryName = (e: IntelEntry) => (e.kind === "handout" ? e.entry.title : e.entry.name);

export const stampOf = (e: IntelEntry) =>
  e.kind === "handout" ? `HANDOUT · ${HANDOUT_STAMP[e.entry.style]}` : STAMP[e.kind];

// A picture or a handout is something to hold up at the table; a person or place without a picture is not.
export const canShowTable = (e: IntelEntry) => e.kind === "handout" || !!e.entry.imageId;

// The first non-empty line of a handout's body, for its card.
export const firstLine = (body: string) =>
  body
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean) ?? "";

// A place's parent, as the codex lists it (toPlayerCodex clears a hidden parent's id).
export const parentName = (codex: Codex, place: Place) =>
  codex.locations.find((l) => l.id === place.parentId)?.name ?? null;

// The second line of an ARCHIVE row: a person's role, a place's parent (`parents`: place id → name, built once per
// list), a handout's banner and whether it is for this Agent's eyes only.
export const subline = (e: IntelEntry, parents: ReadonlyMap<string, string>) => {
  if (e.kind === "npc") return e.entry.role;
  if (e.kind === "location") {
    const parent = e.entry.parentId ? parents.get(e.entry.parentId) : undefined;
    return parent ? `In ${parent}` : "";
  }
  return [headerOf(e.entry), e.entry.audience.length > 0 && "FOR YOUR EYES ONLY"].filter(Boolean).join(" · ");
};
