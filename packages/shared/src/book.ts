import { z } from "zod";
import { THREAT_SOURCES, type ThreatSource } from "./threat.ts";

// The books a GM can serve to the table from their own PDFs (gm/books). Nothing is uploaded: the GM's browser renders
// the one page a player taps and the api relays that image to that player only. `offset` turns a printed page into a
// PDF page (docs/data.md §3); Legacy of the Necrontyr and the High Altar of Technology are cited by PDF page already.
export const BOOKS: Record<ThreatSource, { name: string; offset: number }> = {
  core: { name: "Core Rulebook", offset: 1 },
  "vow-of-absolution": { name: "Vow of Absolution", offset: 0 },
  "inheritance-of-embers": { name: "Aeldari: Inheritance of Embers", offset: 0 },
  "forsaken-system": { name: "Forsaken System Player's Guide", offset: 0 },
  "threat-assessment": { name: "Threat Assessment", offset: 0 },
  "gutshivas-kommandos": { name: "Gutshiva's Kommandos", offset: 0 },
  "high-altar-of-technology": { name: "The High Altar of Technology (homebrew)", offset: 0 },
  apocrypha: { name: "An Abundance of Apocrypha (homebrew)", offset: 3 },
  "legacy-of-the-necrontyr": { name: "Legacy of the Necrontyr (homebrew)", offset: 0 },
};
export const BookSource = z.enum(Object.keys(BOOKS) as [ThreatSource, ...ThreatSource[]]);

export const BookPage = z.object({ source: BookSource, page: z.number().int().min(1).max(2000) });
export type BookPage = z.infer<typeof BookPage>;
export const pdfPage = ({ source, page }: BookPage) => page + BOOKS[source].offset;

// "Core p.113" back to its book and page: the sheet stores cites as text (build.ts addRule). Anything else is null.
const BY_CITE = new Map<string, ThreatSource>(
  Object.entries(THREAT_SOURCES).map(([id, s]) => [s.cite, id as ThreatSource]),
);
export function parseCite(cite: string): BookPage | null {
  const m = /^(\S+) p\.(\d+)$/.exec(cite.trim());
  const source = m && BY_CITE.get(m[1]!);
  return source ? { source, page: Number(m[2]) } : null;
}

// Socket events (table.gateway.ts). A GM socket says which books it serves; players hear the union.
export const BookServing = z.object({ sources: z.array(BookSource).max(Object.keys(BOOKS).length) });
export type BookServing = z.infer<typeof BookServing>;
export type BookAvailable = { sources: ThreatSource[] };
// A JPEG of one page, about 150–400 KB at the width the GM renders.
export const MAX_PAGE_BYTES = 1_500_000;
export type BookReply = { ok: true; image: ArrayBuffer } | { ok: false; error: string };
