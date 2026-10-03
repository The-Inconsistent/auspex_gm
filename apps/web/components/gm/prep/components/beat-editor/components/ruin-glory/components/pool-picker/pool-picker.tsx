"use client";
import { useState, type ChangeEvent } from "react";

import {
  sourceName,
  MAX_POOL_LINES,
  presetLine,
  threatCite,
  type PoolPreset,
  type PoolPresetTable,
  type ThreatSource,
} from "@wg/shared";

import type { PoolDrafts } from "../../../../../../types";

type PoolPickerProps = { tables: PoolPresetTable[]; lines: PoolDrafts; onChange: (lines: PoolDrafts) => void };

// What a preset is worth, as its chip reads: "+1 RUIN" earned, "GLORY 2" spent, "RUIN · GM SETS" where the book prints
// no number.
const worth = ({ kind, pool, n }: PoolPreset) =>
  n === null
    ? `${pool.toUpperCase()} · GM SETS`
    : kind === "earn"
      ? `+${n} ${pool.toUpperCase()}`
      : `${pool.toUpperCase()} ${n}`;

// ADD FROM BOOK (issue #40): a book, one of its Ruin and Glory lists, then ADD on a row copies it into the scene with
// its cite (presetLine). A cost the book doesn't print stays empty, and SAVE waits for the GM's (rules-flow.md §11.78).
export function PoolPicker({ tables, lines, onChange }: PoolPickerProps) {
  const sources = [...new Set(tables.map((t) => t.source))];
  const [source, setSource] = useState<ThreatSource | undefined>(sources[0]);
  const inBook = tables.filter((t) => t.source === source);
  const [tableId, setTableId] = useState(inBook[0]?.id);
  const table = inBook.find((t) => t.id === tableId) ?? inBook[0];

  // Book select: its first list.
  const handleBookChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const book = sources.find((s) => s === e.target.value);
    setSource(book);
    setTableId(tables.find((t) => t.source === book)?.id);
  };

  // ADD: the row goes last in its list.
  const add = (row: PoolPreset) => {
    if (!table) return;
    const added = presetLine({ table, row });
    if (added.list === "spends") return onChange({ ...lines, spends: [...lines.spends, added.line] });
    const list = added.list;
    onChange({ ...lines, [list]: [...lines[list], added.line] });
  };
  const full = (row: PoolPreset) => lines[row.kind === "spend" ? "spends" : row.pool].length >= MAX_POOL_LINES;

  if (!table) return null;
  return (
    <details className="field">
      <summary className="label" style={{ cursor: "pointer" }}>
        ADD FROM BOOK
      </summary>
      <div className="stack" style={{ gap: 8, paddingTop: 6 }}>
        <div className="keys">
          <select
            className="input"
            style={{ maxWidth: 320 }}
            aria-label="Book"
            value={source}
            onChange={handleBookChange}
          >
            {sources.map((s) => (
              <option key={s} value={s}>
                {sourceName(s)}
              </option>
            ))}
          </select>
          {inBook.map((t) => (
            <button
              key={t.id}
              className={`btn sm ${t.id === table.id ? "primary" : ""}`}
              aria-pressed={t.id === table.id}
              onClick={() => setTableId(t.id)}
            >
              {t.name.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="dim" style={{ fontSize: 12 }}>
          {threatCite({ source: table.source, page: table.page })}
        </div>
        {table.gm && (
          <details className="field plate">
            <summary className="label">HOW TO USE THIS LIST</summary>
            <pre className="text">{table.gm}</pre>
          </details>
        )}
        {table.rows.map((row, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            <span className={`chip ${row.pool === "ruin" ? "warn" : ""}`}>{worth(row)}</span>
            <span style={{ flex: "1 1 240px" }}>
              <b>{row.name}</b>
              {row.text && (
                <span className="dim" style={{ fontSize: 12 }}>
                  {" "}
                  {row.text}
                </span>
              )}
              {row.gm && <i style={{ fontSize: 12 }}> {row.gm}</i>}
            </span>
            <button className="btn sm" disabled={full(row)} aria-label={`Add ${row.name}`} onClick={() => add(row)}>
              + ADD
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}
