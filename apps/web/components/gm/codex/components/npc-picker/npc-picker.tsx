"use client";
import { useState } from "react";

import { BOOKS, citeLine, npcFromPreset, presetNpc, type Codex, type NpcPreset, type ThreatSource } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";
import { fold } from "@/lib/threat-filter/threat-filter";

type NpcPickerProps = {
  presets: NpcPreset[];
  codex: Pick<Codex, "npcs" | "factions">; // the NPCs already added, and the factions a preset can link to
  send: Send;
  onError: (error: string | null) => void;
};

// ADD FROM BOOK (issue #47): a printed NPC, by book or by name. + ADD saves `presetNpc`: hidden, a name and a role
// label for players, the cites and printed text in GM NOTES, and the stat source only where the book names one. Someone
// printed in two books is one entry under both. Books follow BOOKS, so the Core Rulebook leads.
export function NpcPicker({ presets, codex, send, onError }: NpcPickerProps) {
  const order = Object.keys(BOOKS);
  const sources = [...new Set(presets.flatMap((p) => p.cites.map((c) => c.source)))].sort(
    (a, b) => order.indexOf(a) - order.indexOf(b),
  );
  const [source, setSource] = useState<ThreatSource | "">("");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<string | null>(null); // a preset id being saved: a second tap waits for it
  const shown = presets.filter(
    (p) => (!source || p.cites.some((c) => c.source === source)) && fold(p.name).includes(fold(query.trim())),
  );

  // + ADD: one codex.save of the preset as a hidden NPC; every row waits until it lands.
  const add = async (p: NpcPreset) => {
    setAdding(p.id);
    const r = await send({ type: "codex.save", kind: "npc", data: presetNpc(p, codex.factions) });
    setAdding(null);
    onError(r.ok ? null : r.error);
  };

  return (
    <details className="field">
      <summary className="label">ADD FROM BOOK</summary>
      <div className="stack" style={{ paddingTop: 8 }}>
        <div className="keys" style={{ paddingTop: 0 }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 200 }}
            aria-label="Search by name"
            placeholder="Search by name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="input"
            style={{ maxWidth: 320 }}
            aria-label="Book"
            value={source}
            onChange={(e) => setSource(sources.find((s) => s === e.target.value) ?? "")}
          >
            <option value="">All books</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {BOOKS[s].name}
              </option>
            ))}
          </select>
        </div>
        <div className="list">
          {shown.length === 0 && <div className="dim">Nothing matches.</div>}
          {shown.map((p) => {
            const inCodex = codex.npcs.some((n) => npcFromPreset(n, p));
            return (
              <div key={p.id} className="item-head">
                <span style={{ flex: 1 }}>
                  <b>{p.name.toUpperCase()}</b>
                  {p.role && <span> · {p.role}</span>}
                  <span className="dim"> · {citeLine(p)}</span>
                </span>
                {p.statSource.kind !== "none" && <span className="chip">STATS</span>}
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
