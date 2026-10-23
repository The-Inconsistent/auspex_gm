// The books' Keyword texts, for any sheet (the JOIN page included): the publisher approved showing faction Keyword text
// in full to anyone (CLAUDE.md, Copyright). Static JSON imports and no node:fs, so the web bundles it; nothing else from
// packages/data goes to a browser.
import { SOURCES } from "@wg/shared";

import kwApocrypha from "./creation/keywords/apocrypha.json" with { type: "json" };
import kwCore from "./creation/keywords/core.json" with { type: "json" };
import kwForsaken from "./creation/keywords/forsaken-system.json" with { type: "json" };
import kwEmbers from "./creation/keywords/inheritance-of-embers.json" with { type: "json" };
import kwNecrontyr from "./creation/keywords/legacy-of-the-necrontyr.json" with { type: "json" };
import kwRedacted from "./creation/keywords/redacted-records-2.json" with { type: "json" };
import sfApocrypha from "./creation/sub-factions/apocrypha.json" with { type: "json" };
import sfCore from "./creation/sub-factions/core.json" with { type: "json" };
import sfEmbers from "./creation/sub-factions/inheritance-of-embers.json" with { type: "json" };
import sfVow from "./creation/sub-factions/vow-of-absolution.json" with { type: "json" };

type KeywordRow = { name: string; text: string; source: string; page: number; placeholder?: string };
type SubFactionRow = { name: string; type: string; keyword?: string };

// What a sheet shows for one of its Keywords. `kind` names a filled bracket ("a Chapter") when the text is the
// bracket's own, because the books describe [CHAPTER], not each Chapter; `text` is "" where a book names the Keyword
// without describing it (LEGIO CYBERNETICA, RR2 p.51) and we have written no HOUSE text for it.
export type KeywordText = { name: string; kind: string | null; text: string; cite: string };

const KEYWORDS = [kwCore, kwApocrypha, kwEmbers, kwForsaken, kwNecrontyr, kwRedacted].flat() as KeywordRow[];
const SUB_FACTIONS = [sfCore, sfApocrypha, sfEmbers, sfVow].flat() as SubFactionRow[];

// House text for a Keyword the books name but never describe, in our own words. DEATHWATCH is written after the
// Warhammer 40k Wiki and Warhammer Community's Kill Team: Tomb World preview (18 July 2025). Never book text; the
// card shows it with no page (`cite` empty).
const HOUSE: Record<string, { text: string; cite: string }> = {
  DEATHWATCH: {
    text:
      "The Long Vigil: veteran Space Marines lent by their own Chapters to the Ordo Xenos, as its Chamber Militant. " +
      "Sworn to a term of service they may not speak of even at home, they hunt the alien in small kill-teams of " +
      "specialists, sent out from Watch Fortresses to wherever a xenos threat rises.",
    cite: "",
  },
};

const cite = (k: KeywordRow) => `${SOURCES[k.source as keyof typeof SOURCES]?.cite ?? k.source} p.${k.page}`;
// The first printing that describes a Keyword wins over one that only names it; Core comes first in KEYWORDS.
const byName = new Map<string, KeywordRow>();
for (const k of KEYWORDS) {
  const known = byName.get(k.name);
  if (!known || (!known.text && k.text)) byName.set(k.name, k);
}
const bracketOf = new Map(
  KEYWORDS.filter((k) => k.name.startsWith("[") && k.placeholder).map((k) => [k.placeholder!, k]),
);

// A sheet's Keyword (upper case, as the sheet prints it) to its text, or null when no book in the data names it (a
// Chapter the books don't list, a campaign's own Keyword).
export function keywordText(name: string): KeywordText | null {
  const own = byName.get(name);
  const house = HOUSE[name];
  if (own && !own.text && house) return { name, kind: null, ...house };
  if (own) return { name, kind: null, text: own.text, cite: cite(own) };
  const sub = SUB_FACTIONS.find((s) => (s.keyword ?? s.name.toUpperCase()) === name);
  const bracket = sub && bracketOf.get(sub.type);
  if (!sub || !bracket) return null;
  return { name, kind: `a ${sub.type[0]!.toUpperCase()}${sub.type.slice(1)}`, text: bracket.text, cite: cite(bracket) };
}
