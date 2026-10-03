import { z } from "zod";
import { THREAT_SOURCES, type ThreatSource } from "./threat.ts";

// The books a GM can serve to the table from their own PDFs (gm/books). Nothing is uploaded: the GM's browser renders
// the one page a player taps and the api relays that image to that player only. `offset` turns a printed page into a
// PDF page (docs/data.md §3); Legacy of the Necrontyr and the High Altar of Technology are cited by PDF page already.
// Every threat source but `custom`, which is a stat block the GM wrote rather than a book (issue #43): it has no PDF,
// no pages and no offset, so leaving it out of BOOKS keeps it out of `BookSource`, the Books tab and every book:* event
// by construction.
export type BookThreatSource = Exclude<ThreatSource, "custom">;

export const BOOKS: Record<BookThreatSource, { name: string; offset: number }> = {
  core: { name: "Core Rulebook", offset: 1 },
  "daemons-and-heretics": { name: "Threat Assessment: Daemons & Heretics", offset: 0 },
  "vow-of-absolution": { name: "Vow of Absolution", offset: 0 },
  "inheritance-of-embers": { name: "Aeldari: Inheritance of Embers", offset: 0 },
  "forsaken-system": { name: "Forsaken System Player's Guide", offset: 0 },
  "litanies-of-the-lost": { name: "Litanies of the Lost", offset: 0 },
  darktide: { name: "Darktide", offset: 0 },
  "redacted-records": { name: "Redacted Records", offset: 0 },
  "church-of-steel": { name: "Church of Steel", offset: 0 },
  "threat-assessment": { name: "Threat Assessment", offset: 0 },
  "redacted-records-2": { name: "Redacted Records 2", offset: 0 },
  "wretches-of-the-writ": { name: "Wretches of the Writ", offset: 0 },
  "bloody-gates": { name: "Bloody Gates", offset: 0 },
  "affliction-ascendant": { name: "Affliction Ascendant", offset: 0 },
  "gutshivas-kommandos": { name: "Gutshiva's Kommandos", offset: 0 },
  "high-altar-of-technology": { name: "The High Altar of Technology (homebrew)", offset: 0 },
  apocrypha: { name: "An Abundance of Apocrypha (homebrew)", offset: 3 },
  "legacy-of-the-necrontyr": { name: "Legacy of the Necrontyr (homebrew)", offset: 0 },
};
export const BookSource = z.enum(Object.keys(BOOKS) as [BookThreatSource, ...BookThreatSource[]]);

// A source's name wherever one is shown beside a threat: the book's title, or "Custom" for one the GM wrote.
export const sourceName = (s: ThreatSource) => (s === "custom" ? THREAT_SOURCES.custom.cite : BOOKS[s].name);

export const BookPage = z.object({ source: BookSource, page: z.number().int().min(1).max(2000) });
export type BookPage = z.infer<typeof BookPage>;
export const pdfPage = ({ source, page }: BookPage) => page + BOOKS[source].offset;

// "Core p.113" back to its book and page: the sheet stores cites as text (build.ts addRule). Anything else is null.
const BY_CITE = new Map<string, BookThreatSource>(
  Object.entries(THREAT_SOURCES).flatMap(([id, s]) => (id === "custom" ? [] : [[s.cite, id as BookThreatSource]])),
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
// The GM tablet's ack as the api receives it: socket.io hands binary over as a Node Buffer, which is a Uint8Array
// (checked as that, so this module still loads in the browser). Untrusted until parsed, like any socket payload.
export const BookAck = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    image: z.instanceof(Uint8Array).refine((b) => b.byteLength > 0 && b.byteLength <= MAX_PAGE_BYTES, "page size"),
  }),
  z.object({ ok: z.literal(false), error: z.string().transform((e) => e.slice(0, 200)) }),
]);
export type BookAck = z.infer<typeof BookAck>;
