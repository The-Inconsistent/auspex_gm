"use client";
import { MAX_EXITS, type BeatExit } from "@wg/shared";

import type { Beat } from "../../../../types";
import { sceneNumber } from "../../../../utils";

type ExitsProps = { exits: BeatExit[]; scenes: Beat[]; onChange: (exits: BeatExit[]) => void };

// Where the scene can go next: a note, and the scene it leads to when the GM has written it (issue #38).
export function Exits({ exits, scenes, onChange }: ExitsProps) {
  const setExit = (i: number, patch: Partial<BeatExit>) =>
    onChange(exits.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  return (
    <div className="field">
      <span className="label">EXITS</span>
      {exits.map((e, i) => (
        <div key={i} className="keys" style={{ alignItems: "center" }}>
          <input
            className="input"
            style={{ flex: "1 1 240px", width: "auto" }}
            aria-label={`Exit ${i + 1}`}
            placeholder="If they…"
            maxLength={200}
            value={e.label}
            onChange={(ev) => setExit(i, { label: ev.target.value })}
          />
          <select
            className="input"
            style={{ maxWidth: 280 }}
            aria-label={`Exit ${i + 1} goes to`}
            value={e.beatId ?? ""}
            onChange={(ev) => setExit(i, { beatId: ev.target.value || null })}
          >
            <option value="">—</option>
            {scenes.map((s, j) => (
              <option key={s.id} value={s.id}>
                {sceneNumber(j)} · {s.title.toUpperCase()}
              </option>
            ))}
          </select>
          <button
            className="btn sm danger"
            aria-label={`Remove exit ${i + 1}`}
            onClick={() => onChange(exits.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <div className="keys" style={{ alignItems: "center" }}>
        <button
          className="btn sm"
          disabled={exits.length >= MAX_EXITS}
          onClick={() => onChange([...exits, { label: "", beatId: null }])}
        >
          + EXIT
        </button>
        <span className="dim" style={{ fontSize: 12 }}>
          Keep the plot moving without forcing one path (Core Rulebook p.318, step 5). An exit is a note: DONE doesn’t
          follow it.
        </span>
      </div>
    </div>
  );
}
