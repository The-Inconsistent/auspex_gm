"use client";
import { useState, type ChangeEvent } from "react";

import {
  BeatType,
  CodexSave,
  CUSTOM_THREAT_CAP,
  Marker,
  type BeatExit,
  type BeatStatus,
  type BeatTest,
  type Codex,
  type HazardTable,
  type PoolPresetTable,
  type SkillDn,
  type Threat,
  type Wargear,
} from "@wg/shared";

import { FieldError } from "@/components/ui/field-error/field-error";
import { MentionField } from "@/components/ui/mention-field/mention-field";
import { RUIN_ACTIONS_TABLE, type ThreatDraft } from "@/components/ui/threat-builder/constants";
import { ThreatBuilder } from "@/components/ui/threat-builder/threat-builder";
import { ThreatPicker } from "@/components/ui/threat-picker/threat-picker";
import { ThreatScale } from "@/components/ui/threat-scale/threat-scale";
import { ThreatStarts } from "@/components/ui/threat-starts/threat-starts";
import { VisibilitySelect } from "@/components/ui/visibility-select/visibility-select";
import { useFieldErrors } from "@/hooks/use-field-errors/use-field-errors";
import type { Send } from "@/hooks/use-table/use-table";
import { hazardView } from "@/lib/hazards/hazards";
import { placeOptions } from "@/lib/places/places";

import type { Beat, EncounterEntry, PoolDrafts } from "../../types";
import { savedPools, stripBeat } from "../../utils";
import { BudgetPanel } from "./components/budget-panel/budget-panel";
import { Exits } from "./components/exits/exits";
import { RuinGlory } from "./components/ruin-glory/ruin-glory";
import { Tests } from "./components/tests/tests";
import { BEAT_TEXT_FIELDS, type BeatTextField } from "./constants";

type BeatEditorProps = {
  adventureId: string;
  beat: Beat | null;
  codex: Codex;
  agents: number; // the Agents a fight would add, which is who the budget is sized for
  tier: number;
  send: Send;
  bestiary: Threat[];
  skillDns: SkillDn[];
  poolTables: PoolPresetTable[];
  hazardTables: HazardTable[]; // to name the place's book hazards (issue #49)
  wargear: Wargear[]; // + NEW CUSTOM THREAT's weapons, as CODEX › THREATS has them
  onDone: () => void;
};

// The beat as the editor holds it: a Ruin or Glory amount, or a spend's cost, may be empty until the GM sets it.
type Draft = Omit<ReturnType<typeof stripBeat>, keyof PoolDrafts> & PoolDrafts;

// Adds `id` to the list, or removes it if already there.
const toggled = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export function BeatEditor({
  adventureId,
  beat,
  codex,
  agents,
  tier,
  send,
  bestiary,
  skillDns,
  poolTables,
  hazardTables,
  wargear,
  onDone,
}: BeatEditorProps) {
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
          itemIds: [] as string[],
          encounter: [] as EncounterEntry[],
          exits: [] as BeatExit[],
          tests: [] as BeatTest[],
          ruin: [],
          glory: [],
          spends: [],
          hazards: [],
          onEntry: [] as string[],
        },
  );
  const [error, setError] = useState<string | null>(null);
  const fieldErrors = useFieldErrors("b-"); // each text field's input is b-<key>
  // + NEW CUSTOM THREAT: closed, choosing how to start (clone, blank, quick), or writing that draft.
  const [building, setBuilding] = useState<"start" | ThreatDraft | null>(null);
  // Counted from the merged bestiary: nothing outside CODEX › THREATS reads codex.customThreats (issue #43).
  const customsFull = bestiary.filter((t) => t.source === "custom").length >= CUSTOM_THREAT_CAP;
  const drafting = building !== null && building !== "start"; // a stat block is being written

  const setEntry = (i: number, patch: Partial<EncounterEntry>) =>
    setB({ ...b, encounter: b.encounter.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const scenes = codex.adventures.find((a) => a.id === adventureId)?.beats ?? [];

  // SAVE SCENE: creates or updates the beat, then closes the editor. Blank exit rows, Shift rungs and Ruin and Glory
  // lines go, and an exit target deleted while the editor was open (its select shows —) is dropped rather than refused
  // by the server. A Ruin or Glory line with no amount, or a spend with no cost, holds the save.
  const save = async () => {
    setError(null);
    const pools = savedPools(b);
    if (!pools) return setError("Set the amount of every Ruin and Glory line, and the cost of every spend");
    const exits = b.exits
      .map((e) => ({ ...e, beatId: scenes.some((s) => s.id === e.beatId) ? e.beatId : null }))
      .filter((e) => e.label.trim() || e.beatId);
    const tests = b.tests.map((t) => ({ ...t, shifts: t.shifts.filter((s) => s.trim()) }));
    const data = { ...b, exits, tests, ...pools };
    // CodexSave first: a nameless scene can't be listed or picked, so TITLE is marked on the field.
    if (!fieldErrors.check(CodexSave.beat, data)) return;
    const r = await send({ type: "codex.save", kind: "beat", ...(beat ? { id: beat.id } : {}), data });
    if (!r.ok) return setError(r.error);
    onDone();
  };

  const place = codex.locations.find((l) => l.id === b.locationId);
  // A hazard chip: the scene picks one of its place's hazards, unspotted, or drops it.
  const toggleHazard = (id: string) =>
    setB({
      ...b,
      hazards: b.hazards.some((x) => x.id === id)
        ? b.hazards.filter((x) => x.id !== id)
        : [...b.hazards, { id, spotted: false }],
    });

  // DELETE: removes the beat, then closes the editor; a refusal stays open with the reason.
  const handleDelete = async () => {
    if (!beat) return;
    const r = await send({ type: "codex.delete", kind: "beat", id: beat.id });
    if (!r.ok) return setError(r.error);
    onDone();
  };

  // + THREAT: the picker names the threat, so the new entry is one model of it.
  // Functional, because + NEW CUSTOM THREAT adds after the save's round trip, and the scene may have changed meanwhile.
  const addEntry = (threatId: string) =>
    setB((p) => ({
      ...p,
      encounter: [...p.encounter, { threatId, count: 1, asMob: false, profiles: [], scale: false }],
    }));

  // + NEW CUSTOM THREAT: opens or closes START FROM. A stat block being written closes only by its own CANCEL, so a stray
  // tap can't drop it; START FROM always closes, even once the cap is reached from another tablet.
  const handleToggleBuilder = () => setBuilding(building === "start" ? null : "start");

  // + NEW CUSTOM THREAT › CREATE: the new stat block joins this scene's encounter; it's in CODEX › THREATS too.
  const handleThreatBuilt = (threatId: string) => {
    addEntry(threatId);
    setBuilding(null);
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
        {/* Every scene text but its title can mention a codex entry (issue #200). */}
        {key === "title" ? (
          <input
            id={`b-${key}`}
            {...fieldErrors.marks(key)}
            className="input"
            value={b[key]}
            onChange={(e) => setB({ ...b, [key]: e.target.value })}
          />
        ) : (
          <MentionField
            id={`b-${key}`}
            {...fieldErrors.marks(key)}
            multiline={area}
            value={b[key]}
            onChange={(v) => setB({ ...b, [key]: v })}
          />
        )}
        <FieldError {...fieldErrors.reason(key)} />
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
          onChange={(e) => setB({ ...b, locationId: e.target.value || null, hazards: [] })}
        >
          <option value="">—</option>
          {placeOptions(codex.locations).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {place && place.hazardList.length > 0 && (
        <div className="field plate">
          <span className="label">HAZARDS AT THIS PLACE · PICK WHAT APPLIES</span>
          <div className="keys" role="group" aria-label="Hazards in this scene">
            {place.hazardList.map((h) => {
              const on = b.hazards.some((x) => x.id === h.id);
              const name = hazardView({ entry: h, tables: hazardTables, tier })?.name ?? "Unknown hazard";
              return (
                <button
                  key={h.id}
                  className={`btn sm ${on ? "primary" : ""}`}
                  aria-pressed={on}
                  onClick={() => toggleHazard(h.id)}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
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
      <div className="field">
        <span className="label">ITEMS TO FIND</span>
        <div className="keys" role="group" aria-label="Items to find">
          {codex.items.map((it) => (
            <button
              key={it.id}
              className={`btn sm ${b.itemIds.includes(it.id) ? "primary" : ""}`}
              aria-pressed={b.itemIds.includes(it.id)}
              onClick={() => setB({ ...b, itemIds: toggled(b.itemIds, it.id) })}
            >
              {it.name}
            </button>
          ))}
          {codex.items.length === 0 && <span className="dim">Add items in CODEX.</span>}
        </div>
        <span className="dim">
          <i>What the Agents can find in this scene. Hand one over with GIVE TO on the scene&apos;s card in PREP.</i>
        </span>
      </div>

      <Tests tests={b.tests} skillDns={skillDns} onChange={(tests) => setB({ ...b, tests })} />
      <RuinGlory lines={b} tables={poolTables} onChange={(lines) => setB({ ...b, ...lines })} />

      <div className="field">
        <span className="label">PREPARED ENCOUNTER</span>
        <BudgetPanel entries={b.encounter} agents={agents} bestiary={bestiary} tier={tier} />
        {b.encounter.map((e, i) => (
          <div key={i} className="keys" style={{ alignItems: "center" }}>
            <ThreatPicker
              bestiary={bestiary}
              tier={tier}
              value={e.threatId}
              onPick={(t) => setEntry(i, { threatId: t.id })}
            />
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
            {/* Profiles and scaling fold under the row: four more controls beside the picker would shrink the 44px
                tap targets this tablet needs. */}
            <div style={{ flexBasis: "100%" }}>
              <ThreatScale
                threat={bestiary.find((t) => t.id === e.threatId)}
                tier={tier}
                agents={agents}
                asMob={e.asMob && e.count > 1}
                profiles={e.profiles}
                scale={e.scale}
                onChange={(next) => setEntry(i, next)}
              />
            </div>
          </div>
        ))}
        <div className="keys" style={{ alignItems: "center" }}>
          <ThreatPicker
            bestiary={bestiary}
            tier={tier}
            onPick={(t) => addEntry(t.id)}
            label="+ THREAT"
            className="btn sm"
          />
          {/* Writing one here keeps the scene open; leaving for CODEX › THREATS would drop its unsaved changes. */}
          <button
            className={`btn sm ${building ? "primary" : ""}`}
            aria-expanded={building !== null}
            disabled={drafting || (building === null && customsFull)}
            onClick={handleToggleBuilder}
          >
            + NEW CUSTOM THREAT
          </button>
          {/* The picker disables itself with nothing to show; say why, because a failed load looks like an empty book. */}
          {!bestiary.length && <span className="dim">No bestiary loaded.</span>}
          {customsFull && <span className="dim">Custom threats are full ({CUSTOM_THREAT_CAP}).</span>}
        </div>
        {building === "start" && (
          <div className="keys" style={{ alignItems: "center" }}>
            <span className="label">START FROM</span>
            <ThreatStarts bestiary={bestiary} tier={tier} disabled={customsFull} onStart={setBuilding} />
          </div>
        )}
        {drafting && (
          <i className="dim">CREATE saves it to CODEX › THREATS straight away, whatever happens to this scene.</i>
        )}
        {building && building !== "start" && (
          <ThreatBuilder
            start={{ slug: null, draft: building }}
            wargear={wargear}
            ruinActions={poolTables.find((t) => t.id === RUIN_ACTIONS_TABLE) ?? null}
            send={send}
            onSaved={handleThreatBuilt}
            onCancel={() => setBuilding(null)}
          />
        )}
      </div>
      {textField({ key: "outcome" })}
      {(error ?? fieldErrors.elsewhere(Object.keys(BEAT_TEXT_FIELDS))) && (
        <div className="red">! {error ?? fieldErrors.elsewhere(Object.keys(BEAT_TEXT_FIELDS))}</div>
      )}
      {drafting && <div className="dim">Finish or cancel the custom threat to save the scene.</div>}
      <div className="keys">
        {/* Not while a custom threat is open: its CREATE adds to this encounter, so the scene waits for it or CANCEL. */}
        <button className="btn primary" disabled={drafting} onClick={save}>
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
