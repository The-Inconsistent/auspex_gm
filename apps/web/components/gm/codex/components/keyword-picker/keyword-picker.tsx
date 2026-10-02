"use client";
import { useId, useState, type KeyboardEvent } from "react";

import { MAX_FACTION_KEYWORDS, MAX_KEYWORD_LENGTH, sourceCite, type FactionKeyword } from "@wg/shared";

import { LIST_LIMIT } from "@/components/ui/record-list/constants";
import { matchKeywords } from "@/lib/keywords/keywords";

type KeywordPickerProps = {
  id: string; // the search box's id, for the field's <label>
  value: string[];
  suggestions: readonly FactionKeyword[];
  onChange: (keywords: string[]) => void;
};

// A faction's Keywords (issue #46): the chosen ones as chips that remove on tap, and a search over the books' Keywords
// (Core pp.375–378) that also takes a write-in, since the books don't list them all. Enter adds exactly what was
// typed (`matchKeywords`' `enter`); a row adds that Keyword.
export function KeywordPicker({ id, value, suggestions, onChange }: KeywordPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const rulesId = useId();
  const full = value.length >= MAX_FACTION_KEYWORDS;
  const { matches, writeIn, enter } = matchKeywords({ query, suggestions, chosen: value });
  const shown = matches.slice(0, LIST_LIMIT);

  const add = (keyword: string) => {
    if (full) return;
    onChange([...value, keyword]);
    setQuery("");
  };
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (enter) add(enter);
  };

  return (
    <div className="stack">
      {value.length > 0 && (
        <div className="keys" role="group" aria-label="Chosen Keywords" style={{ paddingTop: 0 }}>
          {value.map((k) => (
            <button
              key={k}
              type="button"
              className="btn sm"
              aria-label={`Remove ${k}`}
              onClick={() => onChange(value.filter((x) => x !== k))}
            >
              {k} ×
            </button>
          ))}
        </div>
      )}
      <input
        id={id}
        className="input"
        type="search"
        placeholder={full ? `${MAX_FACTION_KEYWORDS} Keywords at most` : "Search or type a Keyword"}
        disabled={full}
        maxLength={MAX_KEYWORD_LENGTH}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {(shown.length > 0 || writeIn) && (
        <div className="list table">
          {shown.map((k, i) => {
            const expanded = open === k.name;
            const rulesFor = `${rulesId}-${i}`; // ids can't hold the spaces in "ADEPTUS ASTARTES"
            return (
              <div key={k.name} className="bld-row">
                <div className="bld-row-head">
                  <button type="button" className="bld-pick" onClick={() => add(k.name)}>
                    <span className="bld-pick-name">
                      + {k.name}
                      <span className="dim bld-cite"> {sourceCite(k)}</span>
                    </span>
                  </button>
                  {k.text && (
                    <button
                      type="button"
                      className="btn sm bld-rules-btn"
                      aria-expanded={expanded}
                      aria-controls={rulesFor}
                      aria-label={`${expanded ? "Hide" : "Show"} the glossary for ${k.name}`}
                      onClick={() => setOpen(expanded ? null : k.name)}
                    >
                      {expanded ? "HIDE" : "RULES"}
                    </button>
                  )}
                </div>
                {k.text && expanded && (
                  <pre id={rulesFor} className="text bld-rules">
                    {k.text}
                  </pre>
                )}
              </div>
            );
          })}
          {writeIn && (
            <div className="bld-row">
              <button type="button" className="bld-pick" onClick={() => add(writeIn)}>
                <span className="bld-pick-name">
                  + {writeIn}
                  <span className="dim bld-cite"> not in the books&apos; list</span>
                </span>
              </button>
            </div>
          )}
        </div>
      )}
      {matches.length > shown.length && (
        <div className="dim">{matches.length - shown.length} more; narrow the search to see them.</div>
      )}
    </div>
  );
}
