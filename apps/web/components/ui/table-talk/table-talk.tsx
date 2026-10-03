"use client";
import { useState, type FormEvent } from "react";

import { MAX_TABLE_LINE, MAX_TABLE_LINES, TableLines } from "@wg/shared";

import { FieldError } from "@/components/ui/field-error/field-error";
import { useFieldErrors } from "@/hooks/use-field-errors/use-field-errors";

import { KIND_EXAMPLES, LIMIT_EXAMPLES } from "./constants";

type Lines = { kind: string[]; limits: string[] };
type TableTalkProps = Lines & { onChange: (lines: Lines) => void };
type LineListProps = {
  id: string;
  label: string;
  examples: readonly string[];
  lines: string[];
  onChange: (lines: string[]) => void;
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// One list: the book's examples toggle on and off, a typed line joins the list, and ✕ takes it out again.
function LineList({ id, label, examples, lines, onChange }: LineListProps) {
  const [draft, setDraft] = useState("");
  const fields = useFieldErrors(`${id}-add`);
  const full = lines.length >= MAX_TABLE_LINES;
  const own = lines.filter((l) => !examples.some((e) => same(e, l)));
  const toggle = (line: string) =>
    onChange(lines.some((l) => same(l, line)) ? lines.filter((l) => !same(l, line)) : [...lines, line]);

  // ADD: the typed line, once; an empty one is marked instead (TableLines).
  const handleAdd = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (full) return;
    const line = fields.check(TableLines.element, draft);
    if (line === null) return;
    if (!lines.some((l) => same(l, line))) onChange([...lines, line]);
    setDraft("");
  };

  return (
    <div className="field">
      <span className="label" id={`${id}-label`}>
        {label}
      </span>
      <div className="keys" role="group" aria-labelledby={`${id}-label`} style={{ paddingTop: 0 }}>
        {examples.map((e) => {
          const on = lines.some((l) => same(l, e));
          return (
            <button
              key={e}
              className={`btn ${on ? "primary" : ""}`}
              aria-pressed={on}
              disabled={!on && full}
              onClick={() => toggle(e)}
            >
              {e.toUpperCase()}
            </button>
          );
        })}
        {own.map((l) => (
          <button key={l} className="btn primary" aria-label={`Remove ${l}`} onClick={() => toggle(l)}>
            {l.toUpperCase()} ✕
          </button>
        ))}
      </div>
      <form className="keys" onSubmit={handleAdd}>
        <input
          id={`${id}-add`}
          className="input"
          style={{ maxWidth: 320 }}
          aria-label={`Add to ${label.toLowerCase()}`}
          placeholder="Type another…"
          maxLength={MAX_TABLE_LINE}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            fields.clear();
          }}
          {...fields.marks()}
        />
        <button className="btn" disabled={full}>
          ADD
        </button>
      </form>
      <FieldError {...fields.reason()} />
    </div>
  );
}

// KIND OF GAME and LEAVE OUT (Core p.316): the whole table agrees both, and nobody has to give a reason. Stored on the
// campaign, and every phone shows them under MISSION (rules-flow §11.79).
export function TableTalk({ kind, limits, onChange }: TableTalkProps) {
  return (
    <div id="table-talk" className="stack">
      <LineList
        id="tt-kind"
        label="KIND OF GAME"
        examples={KIND_EXAMPLES}
        lines={kind}
        onChange={(k) => onChange({ kind: k, limits })}
      />
      <LineList
        id="tt-limits"
        label="LEAVE OUT"
        examples={LIMIT_EXAMPLES}
        lines={limits}
        onChange={(l) => onChange({ kind, limits: l })}
      />
    </div>
  );
}
