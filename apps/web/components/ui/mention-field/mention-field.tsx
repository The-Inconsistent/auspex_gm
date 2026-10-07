"use client";
import { useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type SyntheticEvent } from "react";

import { insertMention, mentionQuery, mentionToken } from "@wg/shared";

import { KIND_LABEL } from "@/components/ui/mentions/constants";
import { useMentions, type MentionEntry } from "@/components/ui/mentions/mentions-provider";
import { fold } from "@/lib/threat-filter/threat-filter";

import { PICK_LIMIT } from "./constants";

type MentionFieldProps = {
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean; // a <textarea>; otherwise a one-line <input>
  id?: string;
  "aria-label"?: string;
  placeholder?: string;
  // useFieldErrors' marks
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  onInput?: () => void;
};

// A codex text field where `@` plus a few letters lists matching entries; picking one writes its token (issue #200).
// The field shows the raw `@[npc:<id>]` (a textarea can't hold a chip); the saved text shows it as a link.
export function MentionField({ value, onChange, multiline, ...rest }: MentionFieldProps) {
  const { entries } = useMentions();
  const field = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const matches = useMemo(() => {
    if (!query) return [];
    const q = fold(query.query);
    const hits = entries.filter((e) => fold(e.name).includes(q));
    // Names that start with what was typed come first.
    return [
      ...hits.filter((e) => fold(e.name).startsWith(q)),
      ...hits.filter((e) => !fold(e.name).startsWith(q)),
    ].slice(0, PICK_LIMIT);
  }, [entries, query]);

  // The open `@` before the caret, if the caret is a plain cursor rather than a selection.
  function track(el: HTMLTextAreaElement | HTMLInputElement) {
    const caret = el.selectionStart ?? 0;
    setQuery(caret === el.selectionEnd ? mentionQuery({ text: el.value, caret }) : null);
  }

  // Swaps the typed `@query` for the token and puts the caret after it once the new value has rendered.
  function pick(e: MentionEntry) {
    if (!query) return;
    const r = insertMention({
      text: value,
      start: query.start,
      caret: query.start + 1 + query.query.length,
      token: mentionToken(e),
    });
    onChange(r.text);
    setQuery(null);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(r.caret, r.caret);
    });
  }

  // Keeps the parent's draft and follows the caret for an open `@`.
  function handleChange(e: SyntheticEvent<HTMLTextAreaElement | HTMLInputElement>) {
    onChange(e.currentTarget.value);
    track(e.currentTarget);
  }

  // While the list is open, Escape closes it and Enter takes the first match. Enter right after a bare `@`, or one
  // that confirms an IME composition, stays the field's own.
  function handleKeyDown(e: KeyboardEvent) {
    if (!matches.length || e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && query?.query) {
      e.preventDefault();
      pick(matches[0]!);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery(null);
    }
  }

  // Leaving the field closes the list, unless focus went to one of its rows.
  const handleBlur = (e: FocusEvent) => !list.current?.contains(e.relatedTarget) && setQuery(null);

  const props = {
    ...rest,
    ref: field,
    className: "input",
    value,
    onChange: handleChange,
    onSelect: (e: SyntheticEvent<HTMLTextAreaElement | HTMLInputElement>) => track(e.currentTarget),
    onKeyDown: handleKeyDown,
    onBlur: handleBlur,
  };
  return (
    <>
      {multiline ? <textarea {...props} /> : <input {...props} />}
      {matches.length > 0 && (
        <div ref={list} className="list table" role="group" aria-label="Codex entries to mention">
          {matches.map((e) => (
            <div key={`${e.kind}:${e.id}`} className="bld-row">
              <button
                type="button"
                className="bld-pick"
                // Keeps focus (and the caret) in the field: Safari doesn't focus a tapped button, so a blur would
                // close the list before the tap lands.
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => pick(e)}
              >
                <span className="bld-pick-name">
                  @ {e.name || "(unnamed)"}
                  <span className="dim bld-cite"> {KIND_LABEL[e.kind]}</span>
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
