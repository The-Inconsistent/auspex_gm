import { z } from "zod";
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
