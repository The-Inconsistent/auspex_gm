import { z } from "zod";
import { Dice, tableProblems } from "./roll-table.ts";
import { THREAT_SOURCES, threatCite, type ThreatSource } from "./threat.ts";

// GM-only book data for CODEX › LOCATIONS' ADD FROM BOOK (GitHub issue #50): the books' systems, worlds, sites and rooms,
// in packages/data/places/<source>.json. /places sends only a summary; codex.addPlaces copies the text server-side.

const slug = z.string().regex(/^[a-z0-9-]+$/);

export const MAX_PLACES_PER_ADD = 60; // codex.addPlaces copies a place and at most 59 inside it

export const Place = z.object({
  id: slug, // unique across every place file, prefixed by its source id
  name: z.string().min(1).max(200),
  parent: slug.optional(), // a place earlier in the same file
  source: z.enum(Object.keys(THREAT_SOURCES) as [ThreatSource, ...ThreatSource[]]),
  page: z.number().int().positive(), // printed page
  stats: z
    .array(z.object({ label: z.string().min(1).max(60), value: z.string().min(1).max(500) }))
    .max(12)
    .default([]),
  hooks: z
    .array(z.object({ title: z.string().min(1).max(200), text: z.string().min(1).max(5000) }))
    .max(12)
    .default([]),
  gm: z.string().max(5000).default(""), // the printed description, cut at a paragraph to fit (§11.100)
});
export type Place = z.infer<typeof Place>;

// What /places sends: enough to draw the books' trees, with no printed text.
export const PlaceSummary = z.object({
  id: slug,
  name: z.string(),
  parentId: slug.nullable(),
  source: Place.shape.source,
  page: z.number().int().positive(),
});
export type PlaceSummary = z.infer<typeof PlaceSummary>;

export const placeSummary = (p: Place): PlaceSummary => ({
  id: p.id,
  name: p.name,
  parentId: p.parent ?? null,
  source: p.source,
  page: p.page,
});

// A copied place's GM NOTES: the cite first (so the GM can open the page), the stat line, the hook sidebars, then the
// description. DESCRIPTION stays empty: players read it, so the GM writes it in their own words (Core p.315).
export function placeNotes(p: Place): string {
  const stats = p.stats.map((s) => `${s.label}: ${s.value}`).join("\n");
  const hooks = p.hooks.map((h) => `${h.title.toUpperCase()}\n${h.text}`);
  return [threatCite(p), stats, ...hooks, p.gm].filter(Boolean).join("\n\n");
}

// The Space Hulk Generator (RR1 pp.6–11, issue #50 step 8): roll a hulk's Origin, Occupants and Objective, and its
// Rooms, in scene-presets/space-hulk.json. Stage 4, Features & Hazards, is the hazard table HULK_HAZARDS (issue #49).
// codex.addHulk writes the hulk and its rooms as places from the rows' ids, so the client never sends book text.
export const HULK_HAZARDS = "redacted-records-space-hulk-hazards";
export const MAX_HULK_ORIGINS = 5; // Mixed Origin: "consider rolling more than once" (RR1 p.7)

export const HulkRow = z.object({
  id: slug, // unique across the generator
  from: z.number().int(),
  to: z.number().int(),
  name: z.string().min(1).max(200), // as printed in the table
  page: z.number().int().positive(), // printed page of the text
  text: z.string().min(1).max(1000).optional(), // the printed description; the Occupants rows have none
});
export type HulkRow = z.infer<typeof HulkRow>;

const HulkTable = z
  .object({
    id: slug,
    name: z.string().min(1).max(200),
    page: z.number().int().positive(),
    dice: Dice,
    rows: z.array(HulkRow).min(1),
    gaps: z.array(z.number().int()).default([]), // results the book prints no row for
  })
  .superRefine((t, ctx) => {
    for (const message of tableProblems({ ...t, overlaps: [] })) ctx.addIssue({ code: "custom", message });
  });
export type HulkTable = z.infer<typeof HulkTable>;

export const SpaceHulkGenerator = z.object({
  source: Place.shape.source,
  page: z.number().int().positive(),
  origin: HulkTable,
  occupants: HulkTable,
  objectives: HulkTable,
  rooms: HulkTable,
});
export type SpaceHulkGenerator = z.infer<typeof SpaceHulkGenerator>;

const block = (g: SpaceHulkGenerator, label: string, r: HulkRow) =>
  [`${label}: ${r.name} (${threatCite({ source: g.source, page: r.page })})`, r.text].filter(Boolean).join("\n");

// A generated hulk's GM NOTES, cite first like placeNotes. DESCRIPTION stays empty for the GM's own words.
export function hulkNotes(
  g: SpaceHulkGenerator,
  { origins, occupants, objective }: { origins: HulkRow[]; occupants: HulkRow; objective: HulkRow },
): string {
  return [
    threatCite(g),
    ...origins.map((o) => block(g, "ORIGIN", o)),
    block(g, "OCCUPANTS", occupants),
    block(g, "OBJECTIVE", objective),
  ].join("\n\n");
}

// A generated room's GM NOTES: its cite and printed text.
export const roomNotes = (g: SpaceHulkGenerator, r: HulkRow) =>
  [threatCite({ source: g.source, page: r.page }), r.text].filter(Boolean).join("\n\n");
