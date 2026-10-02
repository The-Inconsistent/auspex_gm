"use client";
import { useState, type ChangeEvent } from "react";

import {
  BeatType,
  Marker,
  type BeatExit,
  type BeatStatus,
  type BeatTest,
  type Codex,
  type SkillDn,
  type Threat,
} from "@wg/shared";

import { VisibilitySelect } from "@/components/ui/visibility-select/visibility-select";
import type { Send } from "@/hooks/use-table/use-table";

import type { Beat, EncounterEntry, PoolDrafts } from "../../types";
import { savedPools, stripBeat } from "../../utils";
import { Exits } from "./components/exits/exits";
import { RuinGlory } from "./components/ruin-glory/ruin-glory";
import { Tests } from "./components/tests/tests";
import { BEAT_TEXT_FIELDS, type BeatTextField } from "./constants";

type BeatEditorProps = {
  adventureId: string;
  beat: Beat | null;
  codex: Codex;
  players: number;
  send: Send;
  bestiary: Threat[];
  skillDns: SkillDn[];
  onDone: () => void;
};

// The beat as the editor holds it: a Ruin or Glory amount, or a spend's cost, may be empty until the GM sets it.
type Draft = Omit<ReturnType<typeof stripBeat>, keyof PoolDrafts> & PoolDrafts;

// Adds `id` to the list, or removes it if already there.
const toggled = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export function BeatEditor({ adventureId, beat, codex, players, send, bestiary, skillDns, onDone }: BeatEditorProps) {
  const [b, setB] = useState<Draft>(() =>
    beat
      ? stripBeat(beat)
      : {
          adventureId,
          title: "",
          goal: "",
          type: "social" as BeatType,
          status: "planned" as BeatStatus,
          readAloud: "",
          gmNotes: "",
          outcome: "",
          locationId: null as string | null,
          npcIds: [] as string[],
          handoutIds: [] as string[],
          encounter: [] as EncounterEntry[],
          exits: [] as BeatExit[],
          tests: [] as BeatTest[],
          ruin: [],
          glory: [],
          spends: [],
        },
  );
  const [error, setError] = useState<string | null>(null);

  const setEntry = (i: number, patch: Partial<EncounterEntry>) =>
    setB({ ...b, encounter: b.encounter.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const troops = b.encounter.reduce((n, e) => n + e.count, 0);
  const scenes = codex.adventures.find((a) => a.id === adventureId)?.beats ?? [];

  // SAVE SCENE: creates or updates the beat, then closes the editor. Blank exit rows, Shift rungs and Ruin and Glory
  // lines go, and an exit target deleted while the editor was open (its select shows —) is dropped rather than refused
  // by the server. A Ruin or Glory line with no amount, or a spend with no cost, holds the save.
  const save = async () => {
    const pools = savedPools(b);
    if (!pools) return setError("Set the amount of every Ruin and Glory line, and the cost of every spend");
    const exits = b.exits
      .map((e) => ({ ...e, beatId: scenes.some((s) => s.id === e.beatId) ? e.beatId : null }))
      .filter((e) => e.label.trim() || e.beatId);
    const tests = b.tests.map((t) => ({ ...t, shifts: t.shifts.filter((s) => s.trim()) }));
    const data = { ...b, exits, tests, ...pools };
    const r = await send({ type: "codex.save", kind: "beat", ...(beat ? { id: beat.id } : {}), data });
    if (!r.ok) return setError(r.error);
    onDone();
  };

  // DELETE: removes the beat, then closes the editor; a refusal stays open with the reason.
  const handleDelete = async () => {
    if (!beat) return;
    const r = await send({ type: "codex.delete", kind: "beat", id: beat.id });
    if (!r.ok) return setError(r.error);
    onDone();
  };

  // + THREAT: adds a one-model entry for the first bestiary threat; the GM picks the real one in its select.
  const addEntry = () => {
    const first = bestiary[0];
    if (first) setB({ ...b, encounter: [...b.encounter, { threatId: first.id, count: 1, asMob: false }] });
  };

  // ×: removes encounter entry i.
  const removeEntry = (i: number) => setB({ ...b, encounter: b.encounter.filter((_, j) => j !== i) });

  // Count: digits only, at least 1.
  const handleCountChange = (i: number, e: ChangeEvent<HTMLInputElement>) =>
    setEntry(i, { count: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1) });

  // Marker: the empty option clears it.
  const handleMarkerChange = (i: number, e: ChangeEvent<HTMLSelectElement>) =>
    setEntry(i, { marker: Marker.safeParse(e.target.value).data });

  const textField = ({ key }: { key: BeatTextField }) => {
    const { label, area, hint } = BEAT_TEXT_FIELDS[key];
    return (
      <div className="field">
        <label className="label" htmlFor={`b-${key}`}>
          {label}
        </label>
        {area ? (
          <textarea
            id={`b-${key}`}
            className="input"
            value={b[key]}
            onChange={(e) => setB({ ...b, [key]: e.target.value })}
          />
        ) : (
          <input
            id={`b-${key}`}
            className="input"
            value={b[key]}
            onChange={(e) => setB({ ...b, [key]: e.target.value })}
          />
        )}
        {hint && (
          <div className="dim" style={{ fontSize: 12 }}>
            {hint}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="panel pad stack">
      {textField({ key: "title" })}
      <div className="field">
        <label className="label" htmlFor="b-type">
          TYPE
        </label>
        <select
          id="b-type"
          className="input"
          value={b.type}
          onChange={(e) => setB({ ...b, type: BeatType.parse(e.target.value) })}
        >
          {BeatType.options.map((t) => (
            <option key={t} value={t}>
              {t.toUpperCase()}
            </option>
          ))}
        </select>
      </div>
      {textField({ key: "goal" })}
      {textField({ key: "readAloud" })}
      {textField({ key: "gmNotes" })}
      <Exits exits={b.exits} scenes={scenes} onChange={(exits) => setB({ ...b, exits })} />
      <div className="field">
        <label className="label" htmlFor="b-loc">
          LOCATION
        </label>
        <select
          id="b-loc"
          className="input"
          value={b.locationId ?? ""}
          onChange={(e) => setB({ ...b, locationId: e.target.value || null })}
        >
          <option value="">—</option>
          {codex.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <span className="label">NPCS PRESENT</span>
        <div className="keys" role="group" aria-label="NPCs present">
          {codex.npcs.map((n) => (
            <button
              key={n.id}
              className={`btn sm ${b.npcIds.includes(n.id) ? "primary" : ""}`}
              aria-pressed={b.npcIds.includes(n.id)}
              onClick={() => setB({ ...b, npcIds: toggled(b.npcIds, n.id) })}
            >
              {n.name}
            </button>
          ))}
          {codex.npcs.length === 0 && <span className="dim">Add NPCs in CODEX.</span>}
        </div>
      </div>
      <div className="field">
        <span className="label">HANDOUTS / CLUES</span>
        <div className="keys" role="group" aria-label="Handouts and clues">
          {codex.handouts.map((h) => (
            <button
              key={h.id}
              className={`btn sm ${b.handoutIds.includes(h.id) ? "primary" : ""}`}
              aria-pressed={b.handoutIds.includes(h.id)}
              onClick={() => setB({ ...b, handoutIds: toggled(b.handoutIds, h.id) })}
            >
              {h.title}
            </button>
          ))}
          {codex.handouts.length === 0 && <span className="dim">Add handouts in CODEX.</span>}
        </div>
      </div>

      <Tests tests={b.tests} skillDns={skillDns} onChange={(tests) => setB({ ...b, tests })} />
      <RuinGlory lines={b} onChange={(lines) => setB({ ...b, ...lines })} />

      <div className="field">
        <span className="label">PREPARED ENCOUNTER</span>
        <div className="dim" style={{ fontSize: 12 }}>
          Guideline (Threat Assessment p.8): 2 Troops per Agent, half in a Mob, plus 1 Elite or Adversary → for{" "}
          {players} Agents: {players * 2} Troops + 1. Over 10 enemies: use Mobs.
          {troops > 0 && ` Current: ${troops} enemies.`}
        </div>
        {b.encounter.map((e, i) => (
          <div key={i} className="keys" style={{ alignItems: "center" }}>
            <select
              className="input"
              style={{ maxWidth: 280 }}
              aria-label="Threat"
              value={e.threatId}
              onChange={(ev) => setEntry(i, { threatId: ev.target.value })}
            >
              {bestiary.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.source === "core" ? "core" : t.source} p.{t.page})
                </option>
              ))}
            </select>
            <input
              className="input"
              style={{ width: 70 }}
              aria-label="Count"
              inputMode="numeric"
              value={e.count}
              onChange={(ev) => handleCountChange(i, ev)}
            />
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={e.asMob} onChange={(ev) => setEntry(i, { asMob: ev.target.checked })} />{" "}
              MOB
            </label>
            <select
              className="input"
              style={{ width: 110 }}
              aria-label="Marker"
              value={e.marker ?? ""}
              onChange={(ev) => handleMarkerChange(i, ev)}
            >
              <option value="">MARKER</option>
              {Marker.options.map((m) => (
                <option key={m} value={m}>
                  {m.toUpperCase()}
                </option>
              ))}
            </select>
            <VisibilitySelect
              className="input"
              value={e.visibility ?? "bars"}
              onChange={(visibility) => setEntry(i, { visibility })}
            />
            <button
              className="btn sm danger"
              aria-label={`Remove encounter entry ${i + 1}`}
              onClick={() => removeEntry(i)}
            >
              ×
            </button>
          </div>
        ))}
        <div>
          <button className="btn sm" disabled={!bestiary.length} onClick={addEntry}>
            + THREAT
          </button>
        </div>
      </div>
      {textField({ key: "outcome" })}
      {error && <div className="red">! {error}</div>}
      <div className="keys">
        <button className="btn primary" onClick={save}>
          SAVE SCENE
        </button>
        <button className="btn" onClick={onDone}>
          CANCEL
        </button>
        {beat && (
          <button className="btn danger" onClick={handleDelete}>
            DELETE
          </button>
        )}
      </div>
    </div>
  );
}
