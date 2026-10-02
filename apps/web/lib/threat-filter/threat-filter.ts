import { threatClassAt, type Threat, type ThreatClass, type ThreatSource } from "@wg/shared";

// Case-insensitive, and punctuation is ignored on both sides, so a typed "tau" finds "T'au" and "Kommandos" finds
// "Kommandoz"-style apostrophes. Curly quotes fold with the rest (as rules-ref does). Letters keep their identity: an
// accent is decomposed and dropped, but the letter it sat on survives, so a typed "é" narrows instead of folding away
// to an empty query that would match the whole bestiary.
const fold = (s: string) =>
  s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");

export type ThreatFacets = {
  query?: string;
  faction?: Threat["faction"] | null;
  cls?: ThreatClass | null;
  source?: ThreatSource | null;
};

// The bestiary narrowed to what the GM is looking for: a search over the name and keywords, plus faction, book and
// class. The class is the one printed for this campaign's Tier (Core p.323), so a threat that is an Elite at Tier 2
// and a Troop at Tier 4 answers a different chip in each game.
export function filterThreats(bestiary: readonly Threat[], facets: ThreatFacets, tier: number): Threat[] {
  const q = fold(facets.query ?? "");
  return bestiary.filter(
    (t) =>
      (!facets.faction || t.faction === facets.faction) &&
      (!facets.source || t.source === facets.source) &&
      (!facets.cls || threatClassAt(t, tier) === facets.cls) &&
      (!q || [t.name, ...t.keywords].some((text) => fold(text).includes(q))),
  );
}
