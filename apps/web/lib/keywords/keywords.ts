import type { FactionKeyword } from "@wg/shared";

import { fold } from "@/lib/threat-filter/threat-filter";

export type KeywordMatches = { matches: FactionKeyword[]; writeIn: string | null; enter: string | null };

// The faction editor's Keyword search (issue #46): the books' Keywords that contain the query, minus the ones already
// chosen, the one it spells exactly first, then those that start with it. The books don't list every Keyword
// (KOMMANDO, GROT, the volkus pack's own), so a query no suggestion spells exactly is also offered as a write-in,
// upper-cased as the books print Keywords. `enter` is what Enter adds: exactly what was typed, in the books' spelling
// when they have it ("tau" → T'AU, never the longer T'AU EMPIRE).
export function matchKeywords({
  query,
  suggestions,
  chosen,
}: {
  query: string;
  suggestions: readonly FactionKeyword[];
  chosen: readonly string[];
}): KeywordMatches {
  const q = fold(query);
  if (!q) return { matches: [], writeIn: null, enter: null };
  const taken = new Set(chosen.map(fold));
  const rank = (k: FactionKeyword) => (fold(k.name) === q ? 0 : fold(k.name).startsWith(q) ? 1 : 2);
  const matches = suggestions
    .filter((k) => !taken.has(fold(k.name)) && fold(k.name).includes(q))
    .sort((a, b) => rank(a) - rank(b));
  const exact = matches[0] && rank(matches[0]) === 0 ? matches[0].name : null;
  const writeIn =
    exact || taken.has(q) || suggestions.some((k) => fold(k.name) === q) ? null : query.trim().toUpperCase();
  return { matches, writeIn, enter: exact ?? writeIn };
}
