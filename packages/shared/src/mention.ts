import { z } from "zod";

// Codex mentions (GitHub issue #200, docs/campaign-model.md §Mentions): a text field names a codex entry as
// `@[npc:<id>]`. The token holds only the id, so a rename never breaks it and a phone that isn't served the entry has
// no name to show (it shows a placeholder instead).
export const MentionKind = z.enum(["npc", "location", "handout", "faction", "item", "scene"]);
export type MentionKind = z.infer<typeof MentionKind>;

export type MentionPart = { text: string } | { kind: MentionKind; id: string };
export type MentionName = { kind: MentionKind; id: string; name: string };
export type NamePart = { text: string } | MentionName;

const TOKEN = new RegExp(`@\\[(${MentionKind.options.join("|")}):([0-9a-f-]{36})\\]`, "g");

export const mentionToken = ({ kind, id }: { kind: MentionKind; id: string }) => `@[${kind}:${id}]`;

// Text and tokens in order; empty text runs are dropped.
export function parseMentions(text: string): MentionPart[] {
  const parts: MentionPart[] = [];
  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > at) parts.push({ text: text.slice(at, m.index) });
    parts.push({ kind: m[1] as MentionKind, id: m[2]! });
    at = m.index + m[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

// IMPORT GAME gives every row a new id; a token keeps pointing at its entry through the same map. An id outside the
// file stays as it is and shows as the placeholder.
export const remapMentions = (text: string, ids: ReadonlyMap<string, string>) =>
  text.replace(TOKEN, (token, kind: MentionKind, id: string) => {
    const to = ids.get(id);
    return to ? mentionToken({ kind, id: to }) : token;
  });

// Shorter names are left alone: a two-letter name would link half the prose.
const MIN_NAME = 3;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Auto-link: plain text that spells an entry's full name, case and all, as a whole word. Longest name first, so
// "Magos Verrin" wins over "Verrin"; on a shared name the first entry listed wins. Built once per codex; `self` keeps
// an entry from linking itself in its own text.
export function nameLinker(names: readonly MentionName[]): (args: { text: string; self?: string }) => NamePart[] {
  const byName = new Map<string, MentionName>();
  for (const n of names) if (n.name.length >= MIN_NAME && !byName.has(n.name)) byName.set(n.name, n);
  if (!byName.size) return ({ text }) => (text ? [{ text }] : []);
  const alts = [...byName.keys()].sort((a, b) => b.length - a.length).map(escape);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join("|")})(?![\\p{L}\\p{N}])`, "gu");
  return ({ text, self }) => {
    const parts: NamePart[] = [];
    let at = 0;
    for (const m of text.matchAll(re)) {
      const hit = byName.get(m[0])!;
      if (hit.id === self) continue;
      if (m.index > at) parts.push({ text: text.slice(at, m.index) });
      parts.push(hit);
      at = m.index + m[0].length;
    }
    if (at < text.length) parts.push({ text: text.slice(at) });
    return parts;
  };
}

// The `@` the caret is typing after, if any: `@` at the start or after a non-word character (so an email address
// doesn't open the picker), then up to 30 characters with no space.
export function mentionQuery({
  text,
  caret,
}: {
  text: string;
  caret: number;
}): { start: number; query: string } | null {
  const m = /(?:^|[^\p{L}\p{N}])@([^\s@[\]]{0,30})$/u.exec(text.slice(0, caret));
  return m ? { start: caret - m[1]!.length - 1, query: m[1]! } : null;
}

// Swaps the typed `@query` for the token and puts the caret after it.
export function insertMention({
  text,
  start,
  caret,
  token,
}: {
  text: string;
  start: number;
  caret: number;
  token: string;
}) {
  return { text: text.slice(0, start) + token + text.slice(caret), caret: start + token.length };
}
