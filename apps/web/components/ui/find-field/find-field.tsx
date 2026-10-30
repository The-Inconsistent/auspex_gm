"use client";
import { useId, useState, type ReactNode } from "react";

import { fold } from "@/lib/fold/fold";

import { findHits } from "./utils";

export type FindOption = {
  id: string;
  name: string;
  detail?: string; // a dim line under the name: its kind, its cite
  chip?: ReactNode; // on the right: a handout's reach, a spend's cost
};

type FindFieldProps = {
  label: string; // the field's accessible name and placeholder: "Find or name a handout"
  options: FindOption[]; // what it searches; leave out what the list already holds
  onPick: (id: string) => void;
  newLabel?: (typed: string) => string; // "+ NEW HANDOUT “x”": offered last when given
  onCreate?: (typed: string) => void;
  footnote?: string;
};

const SHOWN = 8; // hits before "type to narrow"

// One box that finds an entry to add, or names a new one (STORY's scene editor, canvas Flow-EditorPeople): typing lists
// the matches under it, the last row makes a new one, and Enter takes the top row. Tapping it before typing lists
// every option, for a GM who wants to see what the books hold before writing.
export function FindField({ label, options, onPick, newLabel, onCreate, footnote }: FindFieldProps) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [browse, setBrowse] = useState(false);
  const q = fold(query);
  const typed = query.trim();
  const hits = findHits(options, query);
  const browsing = browse && !typed;
  const shown = browsing ? options : hits.slice(0, SHOWN);
  // + NEW only for a name nothing already has, so the codex doesn't fill with twins.
  const canCreate = !!typed && !!onCreate && !!newLabel && !options.some((o) => fold(o.name) === q);
  const rows = shown.length + (canCreate ? 1 : 0);
  const open = (browsing || !!typed) && rows > 0;

  const done = () => {
    setQuery("");
    setActive(0);
    setBrowse(false);
  };
  const pick = (id: string) => {
    onPick(id);
    done();
  };
  const create = () => {
    onCreate?.(typed);
    done();
  };
  const choose = (i: number) => (i < shown.length ? pick(shown[i]!.id) : create());

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && !open) setBrowse(true);
    else if (e.key === "ArrowDown" && open) {
      e.preventDefault();
      setActive((a) => (a + 1) % rows);
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      setActive((a) => (a - 1 + rows) % rows);
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      choose(Math.min(active, rows - 1));
    } else if (e.key === "Escape") done();
  };

  return (
    <div className="find">
      <input
        className="input find-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={label}
        placeholder={`+ ${label}…`}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onFocus={() => setBrowse(true)}
        onClick={() => setBrowse(true)}
        onBlur={() => setBrowse(false)}
        onKeyDown={handleKey}
      />
      {open && (
        <div className="find-pop">
          <div id={listId} role="listbox" aria-label={label}>
            {shown.map((o, i) => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={i === active}
                className="find-row"
                // Keep the field focused, so the list stays open until a row is taken.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o.id)}
              >
                <span className="find-name">
                  {o.name}
                  {o.detail && <span className="label">{o.detail}</span>}
                </span>
                {o.chip}
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                role="option"
                aria-selected={active === shown.length}
                className="find-row find-new"
                onMouseDown={(e) => e.preventDefault()}
                onClick={create}
              >
                {newLabel!(typed)}
              </button>
            )}
          </div>
          {(hits.length > SHOWN || footnote) && (
            <div className="find-note">
              {hits.length > SHOWN ? `${hits.length - SHOWN} more · type to narrow` : footnote}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
