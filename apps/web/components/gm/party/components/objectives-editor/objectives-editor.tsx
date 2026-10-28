"use client";
import type { FormEvent } from "react";

import { MAX_OBJECTIVES, type ActionResult, type Character, type Objective } from "@wg/shared";

import { useGm } from "@/components/gm/gm-app/gm-context";
import { sceneNumber } from "@/components/gm/prep/utils";
import type { Send } from "@/hooks/use-table/use-table";

type ObjectivesEditorProps = { character: Character; send: Send; onResult: (r: ActionResult, ok: string) => void };

// The GM's private objectives for one Agent: only that character's player sees them (toPlayerView). Every change
// sends the whole list, so there's no half-saved edit. Each may be tied to an adventure or one of its scenes, where
// STORY and SCENE show it (§11.163); the session's rolled Objective (Core p.43) is marked SESSION.
export function ObjectivesEditor({ character: c, send, onResult }: ObjectivesEditorProps) {
  const { codex } = useGm();
  const save = async (objectives: Objective[], ok: string) =>
    onResult(await send({ type: "character.objectives", characterId: c.id, objectives }), ok);

  // ADD: appends the typed objective and clears the box once it's saved.
  const handleAdd = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const text = String(new FormData(form).get("text") ?? "").trim();
    if (!text) return;
    await save([...c.objectives, { text, done: false }], `${c.name.toUpperCase()} OBJECTIVE ADDED`);
    form.reset();
  };

  // The link picker: a scene's id or an adventure's, saved with the adventure it sits in; empty unlinks.
  const handleLink = (i: number, value: string) => {
    const beatOf = codex.adventures.find((a) => a.beats.some((b) => b.id === value));
    const link = beatOf ? { adventureId: beatOf.id, beatId: value } : { adventureId: value || null, beatId: null };
    save(
      c.objectives.map((o, j) => (j === i ? { ...o, ...link } : o)),
      `${c.name.toUpperCase()} OBJECTIVES SAVED`,
    );
  };

  // Done checkbox: ticks the objective off, or back on.
  const toggleDone = (i: number) =>
    save(
      c.objectives.map((o, j) => (j === i ? { ...o, done: !o.done } : o)),
      `${c.name.toUpperCase()} OBJECTIVES SAVED`,
    );

  return (
    <div className="field">
      <span className="label">OBJECTIVES (only {c.name.toUpperCase()}&apos;S PLAYER SEES THEM)</span>
      {c.objectives.map((o, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label className="check" style={{ flex: 1, minWidth: 0 }}>
            <input type="checkbox" checked={o.done} onChange={() => toggleDone(i)} />
            <span style={{ textDecoration: o.done ? "line-through" : undefined }}>{o.text}</span>
            {o.rolled && <span className="chip">SESSION</span>}
          </label>
          <select
            className="input"
            style={{ width: "auto", maxWidth: "40%" }}
            aria-label={`Where "${o.text}" sits in STORY`}
            value={o.beatId ?? o.adventureId ?? ""}
            onChange={(e) => handleLink(i, e.target.value)}
          >
            <option value="">NO LINK</option>
            {codex.adventures.map((a) => (
              <optgroup key={a.id} label={a.title.toUpperCase()}>
                <option value={a.id}>WHOLE ADVENTURE</option>
                {a.beats.map((b, j) => (
                  <option key={b.id} value={b.id}>
                    → {sceneNumber(j)} · {b.title.toUpperCase()}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            className="btn sm"
            aria-label={`Remove objective "${o.text}" for ${c.name}`}
            onClick={() => save(c.objectives.toSpliced(i, 1), `${c.name.toUpperCase()} OBJECTIVE REMOVED`)}
          >
            ✕
          </button>
        </div>
      ))}
      {c.objectives.length < MAX_OBJECTIVES && (
        <form style={{ display: "flex", gap: 6 }} onSubmit={handleAdd}>
          <input
            className="input"
            name="text"
            maxLength={500}
            aria-label={`New objective for ${c.name}`}
            placeholder="NEW OBJECTIVE"
          />
          <button className="btn sm">ADD</button>
        </form>
      )}
    </div>
  );
}
