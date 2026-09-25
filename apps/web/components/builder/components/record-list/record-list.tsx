"use client";
import { useId, useState } from "react";

import { LIST_LIMIT } from "../../constants";
import { matches } from "../../utils";

// `detail`: the record's rules text (a Talent's effect, a power's profile), shown under the row on RULES.
export type RecordItem = { id: string; label: string; meta?: string; xp?: number; blocked?: string; detail?: string };

type RecordListProps = {
  items: RecordItem[];
  selected: readonly string[];
  onPick: (id: string) => void;
  label: string; // the search box's accessible name
  searchable?: boolean;
};

// A catalogue list to pick from. Long lists show the first LIST_LIMIT matches and ask for a narrower search, which keeps
// the phone responsive without virtualising. `blocked` greys an item out with the reason.
export function RecordList({ items, selected, onPick, label, searchable = items.length > 8 }: RecordListProps) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const id = useId();
  const found = items.filter((i) => matches(q, i.label, i.meta ?? ""));
  const shown = found.slice(0, LIST_LIMIT);
  return (
    <div className="stack">
      {searchable && (
        <input
          id={id}
          className="input"
          type="search"
          placeholder="Search"
          aria-label={label}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      <div className="list table">
        {shown.map((i) => {
          const on = selected.includes(i.id);
          const expanded = open === i.id;
          return (
            <div key={i.id} className="bld-row">
              <div className="bld-row-head">
                <button
                  className="bld-pick"
                  aria-pressed={on}
                  disabled={!!i.blocked && !on}
                  onClick={() => onPick(i.id)}
                >
                  <span className="bld-pick-name">
                    {on ? "✓ " : ""}
                    {i.label}
                    {(i.meta || i.blocked) && (
                      <span className="dim bld-cite">
                        {" "}
                        {i.meta}
                        {i.blocked && ` · ${i.blocked}`}
                      </span>
                    )}
                  </span>
                  {i.xp !== undefined && <b>{i.xp} XP</b>}
                </button>
                {i.detail && (
                  <button
                    className="btn sm bld-rules-btn"
                    aria-expanded={expanded}
                    aria-controls={`${id}-${i.id}`}
                    aria-label={`${expanded ? "Hide" : "Show"} the rules for ${i.label}`}
                    onClick={() => setOpen(expanded ? null : i.id)}
                  >
                    {expanded ? "HIDE" : "RULES"}
                  </button>
                )}
              </div>
              {i.detail && expanded && (
                <pre id={`${id}-${i.id}`} className="text bld-rules">
                  {i.detail}
                </pre>
              )}
            </div>
          );
        })}
        {found.length === 0 && <div className="dim pad">Nothing matches.</div>}
      </div>
      {found.length > shown.length && (
        <div className="dim">{found.length - shown.length} more; narrow the search to see them.</div>
      )}
    </div>
  );
}
