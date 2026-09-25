"use client";
import { useId, useState } from "react";

import { LIST_LIMIT } from "../../constants";
import { matches } from "../../utils";

export type RecordItem = { id: string; label: string; meta?: string; xp?: number; blocked?: string };

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
          return (
            <button
              key={i.id}
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
