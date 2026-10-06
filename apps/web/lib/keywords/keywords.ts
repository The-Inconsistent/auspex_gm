import type { FactionKeyword, FactionStance } from "@wg/shared";

import { fold } from "@/lib/threat-filter/threat-filter";

export type KeywordMatches = { matches: FactionKeyword[]; writeIn: string | null; enter: string | null };

// The faction editor's Keyword search (issue #46): the books' Keywords that contain the query, minus the ones already
// chosen, the one it spells exactly first, then those that start with it. The books don't list every Keyword
// (KOMMANDO, GROT, a campaign's own), so a query no suggestion spells exactly is also offered as a write-in,
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

// Core p.317: "there are very few circumstances in which any Imperial would consider working alongside an Aeldari, and
// almost none with an Ork", and "you might need a reason why Archetypes of different Factions are working together".
// The book names only those two; the GM widened the hint to any non-Imperial Keyword (rules-flow.md §11.83).
const AELDARI = new Set(["AELDARI", "ASURYANI", "ANHRATHE", "DRUKHARI", "HARLEQUIN", "YNNARI"]);
const NON_IMPERIAL = new Set([
  ...AELDARI,
  "ORK",
  "NECRON",
  "T'AU",
  "KROOT",
  "TYRANID",
  "GENESTEALER CULT",
  "CHAOS",
  "HERETIC",
  "HERETIC ASTARTES",
  "DAEMON",
  "DARK MECHANICUM",
  "XENOS",
]);
export const MIXING_HINTS = {
  ork: "Almost no Imperial would work alongside an Ork. Give the Agents a reason.",
  aeldari: "Very few Imperials would consider working alongside an Aeldari. Give the Agents a reason.",
  other: "Agents of different Factions need a reason to work together: ordered, hired, or the only ones left?",
} as const;

// The faction card's hint, for an ally only: a hint, never a block.
export function mixingHint({ stance, keywords }: { stance: FactionStance; keywords: readonly string[] }) {
  if (stance !== "ally") return null;
  const upper = keywords.map((k) => k.toUpperCase());
  const text = upper.includes("ORK")
    ? MIXING_HINTS.ork
    : upper.some((k) => AELDARI.has(k))
      ? MIXING_HINTS.aeldari
      : upper.some((k) => NON_IMPERIAL.has(k))
        ? MIXING_HINTS.other
        : null;
  return text && { text, cite: "Core p.317" };
}
