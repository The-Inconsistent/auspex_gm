"use client";
import { Fragment } from "react";

import { parseMentions } from "@wg/shared";

import { useMentions, type MentionEntry } from "./mentions-provider";

type MentionsProps = { text: string; self?: string };

// A codex text with its mentions as links (issue #200): `@[npc:<id>]` tokens, then plain names that spell an entry.
// A link shows the entry's live name; a token this seat can't resolve shows the placeholder, never a name. `self` is
// the entry the text belongs to, so it doesn't link itself. The caller keeps its own <pre> for the whitespace.
export function Mentions({ text, self }: MentionsProps) {
  const { get, link, missing, open } = useMentions();
  const parts: ({ text: string } | MentionEntry)[] = parseMentions(text).flatMap((p) => {
    if ("text" in p) return link({ text: p.text, self });
    const e = get(p.kind, p.id);
    return e ? [e] : [{ text: missing }];
  });
  return parts.map((p, i) => {
    if ("text" in p) return <Fragment key={i}>{p.text}</Fragment>;
    return (
      <Fragment key={i}>
        <button type="button" className="rule-link" aria-label={`Codex: ${p.name}`} onClick={() => open(p)}>
          {p.name}
        </button>
        {/* Only the GM's snapshot holds unrevealed entries: a link the table can't follow yet. */}
        {p.hidden && <span className="dim"> (HIDDEN)</span>}
      </Fragment>
    );
  });
}
