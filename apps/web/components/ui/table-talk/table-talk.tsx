"use client";
import { useState, type FormEvent, type ReactNode } from "react";

import { MAX_TABLE_LINE, MAX_TABLE_LINES, TableLines } from "@wg/shared";

import { FieldError } from "@/components/ui/field-error/field-error";
import { Help } from "@/components/ui/term/term";
import { useFieldErrors } from "@/hooks/use-field-errors/use-field-errors";

import { KIND_EXAMPLES, LIMIT_EXAMPLES } from "./constants";

type Lines = { kind: string[]; limits: string[] };
type TableTalkProps = Lines & { onChange: (lines: Lines) => void };
type LineListProps = {
  id: string;
  label: string;
  help: ReactNode; // the ⓘ card beside the label
  examples: readonly string[];
  lines: string[];
  onChange: (lines: string[]) => void;
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// One list: the book's examples toggle on and off, a typed line joins the list, and ✕ takes it out again.
function LineList({ id, label, help, examples, lines, onChange }: LineListProps) {
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
      <span className="label">
        <span id={`${id}-label`}>{label}</span> {help}
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
          onChange={(e) => setDraft(e.target.value)}
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
        help={
          <Help title="Kind of game" cite="Core Rulebook p.316">
            What the group wants most from play: investigative, combat heavy, political, whatever you like best. Settle
            it with the Framework, so the adventures fit it. Pick the book&apos;s examples or type your own.
          </Help>
        }
        examples={KIND_EXAMPLES}
        lines={kind}
        onChange={(k) => onChange({ kind: k, limits })}
      />
      <LineList
        id="tt-limits"
        label="LEAVE OUT"
        help={
          <Help title="Leave out" cite="Core Rulebook pp.315–316">
            Content someone doesn&apos;t want at the table, such as sex, violence or body horror. Give everyone a chance
            to say it, and don&apos;t ask why: nobody has to explain. Encourage players to speak up later too.
          </Help>
        }
        examples={LIMIT_EXAMPLES}
        lines={limits}
        onChange={(l) => onChange({ kind, limits: l })}
      />
    </div>
  );
}
