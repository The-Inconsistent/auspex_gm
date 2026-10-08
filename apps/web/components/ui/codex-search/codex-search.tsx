"use client";
import { useEffect, useMemo, useRef } from "react";

import { MentionKind } from "@wg/shared";

import { KIND_LABEL } from "@/components/ui/mentions/constants";
import { useMentions } from "@/components/ui/mentions/mentions-provider";
import { LIST_LIMIT } from "@/components/ui/record-list/constants";

import { searchEntries } from "./utils";

type CodexSearchProps = { query: string; onQuery: (q: string) => void };

// One box over every codex entry this seat holds (issue #198). With text in it the hits show, grouped by kind; the
// caller hides its own list meanwhile. A hit opens the entry's Peek, as a mention does.
export function CodexSearch({ query, onQuery }: CodexSearchProps) {
  const { entries, open, missing } = useMentions();
  const box = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchEntries(entries, query, missing), [entries, query, missing]);
  const shown = hits.slice(0, LIST_LIMIT);

  // Syncs with the document's keyboard: "/" jumps to the box (a tablet with a keyboard), unless the GM is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      const typing =
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        (t instanceof HTMLElement && t.isContentEditable);
      if (e.key !== "/" || typing || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      box.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="stack">
      <input
        ref={box}
        className="input"
        type="search"
        placeholder="Search the codex  /"
        aria-label="Search the codex"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
      {query.trim() && (
        <>
          {MentionKind.options.map((kind) => {
            const group = shown.filter((h) => h.entry.kind === kind);
            if (group.length === 0) return null;
            return (
              <div key={kind} className="stack" style={{ gap: 4 }}>
                {/* Every hit of the kind, shown or past the cap. */}
                <div className="rule">
                  {KIND_LABEL[kind]} · {hits.filter((h) => h.entry.kind === kind).length}
                </div>
                <div className="list table">
                  {group.map(({ entry, snippet }) => (
                    <button key={entry.id} type="button" className="bld-pick" onClick={() => open(entry)}>
                      <span>
                        <b>{entry.name.toUpperCase()}</b>
                        {entry.hidden && <span className="dim"> · HIDDEN</span>}
                        {snippet && (
                          <span className="dim" style={{ display: "block" }}>
                            {snippet}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {hits.length === 0 && <div className="dim">Nothing matches.</div>}
          {hits.length > shown.length && (
            <div className="dim">{hits.length - shown.length} more; narrow the search to see them.</div>
          )}
        </>
      )}
    </div>
  );
}
