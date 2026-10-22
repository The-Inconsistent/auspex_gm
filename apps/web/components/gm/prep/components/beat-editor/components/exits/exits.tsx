"use client";
import { MAX_EXITS, type BeatExit } from "@wg/shared";

import type { Beat } from "../../../../types";
import { sceneNumber } from "../../../../utils";

type ExitsProps = {
  exits: BeatExit[];
  scenes: Beat[]; // this adventure's scenes, in order, so each keeps its number
  current?: string; // the scene being edited, which isn't an exit of its own
  onChange: (exits: BeatExit[]) => void;
  onNewScene: (title: string) => Promise<string | null>; // saves a scene by that title; its id, or null if refused
};

const NEW = "\u0000new"; // the select's "new scene" value: not an id, so no scene can clash with it

// Where the scene can go next: what the Agents might do, and the scene it leads to when the GM has written it (issue
// #38). One blank row always waits at the end; the save drops blank ones, so clearing the text drops an exit.
export function Exits({ exits, scenes, current, onChange, onNewScene }: ExitsProps) {
  const rows = exits.length < MAX_EXITS ? [...exits, { label: "", beatId: null }] : exits;
  const setExit = (i: number, patch: Partial<BeatExit>) =>
    onChange(
      i < exits.length
        ? exits.map((e, j) => (j === i ? { ...e, ...patch } : e))
        : [...exits, { label: "", beatId: null, ...patch }],
    );

  // → NEW SCENE: saves it now, then points the exit at it; a refusal leaves the exit as it was.
  const handleTarget = async (i: number, value: string) => {
    if (value !== NEW) return setExit(i, { beatId: value || null });
    const id = await onNewScene(rows[i]!.label.trim());
    if (id) setExit(i, { beatId: id });
  };

  return (
    <div className="field">
      {rows.map((e, i) => (
        <div key={i} className="ed-pair">
          <input
            className="input"
            aria-label={`Exit ${i + 1}`}
            placeholder="If they…"
            maxLength={200}
            value={e.label}
            onChange={(ev) => setExit(i, { label: ev.target.value })}
          />
          <select
            className="input"
            aria-label={`Exit ${i + 1} goes to`}
            value={e.beatId ?? ""}
            onChange={(ev) => void handleTarget(i, ev.target.value)}
          >
            <option value="">→ NO SCENE YET</option>
            {scenes.map(
              (s, j) =>
                s.id !== current && (
                  <option key={s.id} value={s.id}>
                    → {sceneNumber(j)} · {s.title.toUpperCase()}
                  </option>
                ),
            )}
            {e.label.trim() && <option value={NEW}>→ NEW SCENE “{e.label.trim()}”</option>}
          </select>
        </div>
      ))}
      <span className="dim" style={{ fontSize: 12 }}>
        Clear the text to drop an exit. Keep the plot moving without forcing one path (Core Rulebook p.318, step 5). An
        exit is a note: DONE doesn’t follow it.
      </span>
    </div>
  );
}
