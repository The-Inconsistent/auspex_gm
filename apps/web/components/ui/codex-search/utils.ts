import { plainMentions } from "@wg/shared";

import { PEEK_FIELDS } from "@/components/ui/mentions/constants";
import type { MentionEntry } from "@/components/ui/mentions/mentions-provider";
import { fold } from "@/lib/fold/fold";

import { SNIPPET_BEFORE, SNIPPET_LENGTH } from "./constants";

export type Hit = { entry: MentionEntry; snippet: string | null }; // null: the name matched

// Where `q` (already folded) starts in `text`, or -1. A miss, the usual case, costs one fold of the whole text. A hit
// is folded again a character at a time, keeping where each folded character came from, so the match maps back to the
// original for its snippet.
function matchAt(text: string, q: string): number {
  if (!fold(text).includes(q)) return -1;
  let folded = "";
  const from: number[] = [];
  let i = 0;
  for (const ch of text) {
    const f = fold(ch);
    folded += f;
    for (let k = 0; k < f.length; k++) from.push(i);
    i += ch.length;
  }
  const at = folded.indexOf(q);
  return at < 0 ? -1 : from[at]!;
}

// One line of the text around the match, cut ends marked. A cut start moves to the next word, short of the match.
function snippet(text: string, at: number): string {
  let start = Math.max(0, at - SNIPPET_BEFORE);
  if (start > 0) start = Math.min(at, start + (text.slice(start, at).search(/\s/) + 1));
  const end = start + SNIPPET_LENGTH;
  const line = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${line}${end < text.length ? "…" : ""}`;
}

// The codex search (issue #198) over the entries this seat holds: the GM's whole codex, or a phone's toPlayerCodex,
// whose blanked GM fields never match. It reads what a Peek shows (PEEK_FIELDS), with mention tokens spelled out as
// names first, so "npc" doesn't hit every text that links an NPC. Name matches come first, then the rest by name.
export function searchEntries(entries: readonly MentionEntry[], query: string, missing: string): Hit[] {
  const q = fold(query);
  if (!q) return [];
  const names = new Map(entries.map((e) => [e.id, e.name]));
  const hits: (Hit & { rank: number })[] = [];
  for (const entry of entries) {
    if (fold(entry.name).includes(q)) {
      hits.push({ entry, snippet: null, rank: 0 });
      continue;
    }
    for (const [key] of PEEK_FIELDS[entry.kind]) {
      const raw = entry.row[key];
      if (typeof raw !== "string" || !raw) continue;
      const text = plainMentions({ text: raw, nameOf: (id) => names.get(id), missing });
      const at = matchAt(text, q);
      if (at < 0) continue;
      hits.push({ entry, snippet: snippet(text, at), rank: 1 });
      break;
    }
  }
  return hits
    .sort((a, b) => a.rank - b.rank || a.entry.name.localeCompare(b.entry.name))
    .map(({ entry, snippet }) => ({ entry, snippet }));
}
