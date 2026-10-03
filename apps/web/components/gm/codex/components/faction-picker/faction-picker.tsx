"use client";
import { useState, type ChangeEvent } from "react";

import {
  BOOKS,
  sourceName,
  fromPreset,
  presetFaction,
  threatCite,
  type FactionPreset,
  type ThreatSource,
} from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

type FactionPickerProps = {
  presets: FactionPreset[];
  factions: readonly { name: string; notes: string }[]; // the codex's, to mark the presets already added
  send: Send;
  onError: (error: string | null) => void;
  open?: boolean; // NEW CAMPAIGN's FACTIONS step shows it open; CODEX keeps it folded
};

// ADD FROM BOOK (issue #46): a book, then one of its printed factions. + ADD saves `presetFaction` as a new faction:
// its name, the Keywords the page prints and a cite line, neutral until the GM says otherwise. A faction already added
// from that book isn't offered twice. Books follow BOOKS, so the Core Rulebook leads and homebrew comes last.
export function FactionPicker({ presets, factions, send, onError, open }: FactionPickerProps) {
  const order = Object.keys(BOOKS);
  const sources = [...new Set(presets.map((p) => p.source))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const [source, setSource] = useState<ThreatSource | undefined>(sources[0]);
  const [adding, setAdding] = useState<string | null>(null); // a preset id being saved: a second tap waits for it

  const handleBookChange = (e: ChangeEvent<HTMLSelectElement>) => setSource(sources.find((s) => s === e.target.value));

  const add = async (p: FactionPreset) => {
    setAdding(p.id);
    const r = await send({ type: "codex.save", kind: "faction", data: presetFaction(p) });
    setAdding(null);
    onError(r.ok ? null : r.error);
  };

  return (
    <details className="field" open={open}>
      <summary className="label">ADD FROM BOOK</summary>
      <div className="stack" style={{ paddingTop: 8 }}>
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
        <div className="list">
          {presets
            .filter((p) => p.source === source)
            .map((p) => {
              const inCodex = factions.some((f) => fromPreset(f, p));
              return (
                <div key={p.id} className="item-head">
                  <span style={{ flex: 1 }}>
                    <b>{p.name.toUpperCase()}</b>
                    {p.keywords.join() !== p.name.toUpperCase() && p.keywords.length > 0 && (
                      <span> · {p.keywords.join(" · ")}</span>
                    )}
                    <span className="dim"> · {threatCite(p)}</span>
                  </span>
                  <button
                    className="btn sm"
                    disabled={inCodex || adding !== null}
                    aria-label={inCodex ? `${p.name} is in the codex` : `Add ${p.name}`}
                    onClick={() => add(p)}
                  >
                    {inCodex ? "✓ IN CODEX" : "+ ADD"}
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    </details>
  );
}
