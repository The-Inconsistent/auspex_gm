"use client";
import { useMemo, useState } from "react";

import {
  CUSTOM_THREAT_CAP,
  Marker,
  THREAT_CLASS_LABEL,
  Visibility,
  threatCite,
  threatClassAt,
  type PoolPresetTable,
  type Threat,
  type Wargear,
} from "@wg/shared";

import { FindField } from "@/components/ui/find-field/find-field";
import { StatBlock } from "@/components/ui/stat-block/stat-block";
import { RUIN_ACTIONS_TABLE, type ThreatDraft } from "@/components/ui/threat-builder/constants";
import { ThreatBuilder } from "@/components/ui/threat-builder/threat-builder";
import { ThreatPicker } from "@/components/ui/threat-picker/threat-picker";
import { ThreatScale } from "@/components/ui/threat-scale/threat-scale";
import { ThreatStarts } from "@/components/ui/threat-starts/threat-starts";
import { VISIBILITY_LABEL } from "@/components/ui/visibility-select/constants";
import { DragHandle, moveItem, useReorder } from "@/hooks/use-reorder/use-reorder";
import type { Send } from "@/hooks/use-table/use-table";

import type { EncounterEntry } from "../../../../types";
import { BudgetPanel } from "../budget-panel/budget-panel";

type FightEntriesProps = {
  entries: EncounterEntry[];
  agents: number; // who the budget is sized for
  tier: number;
  bestiary: Threat[];
  wargear: Wargear[]; // + NEW CUSTOM THREAT's weapons, as CODEX › THREATS has them
  poolTables: PoolPresetTable[];
  send: Send;
  onChange: (entries: EncounterEntry[]) => void;
  onDrafting: (drafting: boolean) => void; // a stat block is being written: the scene's SAVE waits for it
};

// The prepared fight: the budget, then one compact row per threat (one open at a time), then a find box over the
// bestiary and + NEW CUSTOM THREAT (canvas Flow-EditorFight).
export function FightEntries({
  entries,
  agents,
  tier,
  bestiary,
  wargear,
  poolTables,
  send,
  onChange,
  onDrafting,
}: FightEntriesProps) {
  const [open, setOpen] = useState<number | null>(null);
  // + NEW CUSTOM THREAT: closed, choosing how to start (clone, blank, quick), or writing that draft.
  const [building, setBuilding] = useState<"start" | ThreatDraft | null>(null);
  const [typed, setTyped] = useState(""); // the name typed into the find box, to start the new stat block with
  // Counted from the merged bestiary: nothing outside CODEX › THREATS reads codex.customThreats (issue #43).
  const customsFull = bestiary.filter((t) => t.source === "custom").length >= CUSTOM_THREAT_CAP;

  // The GM's own stat blocks first and marked, so they aren't lost past the find box's first hits among 369 threats.
  const options = useMemo(
    () =>
      [...bestiary.filter((t) => t.source === "custom"), ...bestiary.filter((t) => t.source !== "custom")].map((t) => ({
        id: t.id,
        name: t.name,
        detail: `${threatCite(t)} · ${THREAT_CLASS_LABEL[threatClassAt(t, tier)]}`,
        chip: t.source === "custom" ? <span className="chip">CUSTOM</span> : undefined,
      })),
    [bestiary, tier],
  );

  const reorder = useReorder({
    count: entries.length,
    onMove: (from, to) => {
      onChange(moveItem(entries, from, to));
      // The open row moves with its content; the neighbour it swapped with takes its old place.
      setOpen((o) => (o === from ? to : o === to ? from : o));
    },
  });

  const setEntry = (i: number, patch: Partial<EncounterEntry>) =>
    onChange(entries.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  // A pick or a new stat block: one model of it, opened so the GM can set the count.
  const addEntry = (threatId: string) => {
    onChange([...entries, { threatId, count: 1, asMob: false, profiles: [], scale: false }]);
    setOpen(entries.length);
  };

  const removeEntry = (i: number) => {
    onChange(entries.filter((_, j) => j !== i));
    setOpen(null);
  };

  const build = (next: "start" | ThreatDraft | null) => {
    setBuilding(next);
    onDrafting(next !== null && next !== "start");
  };

  // CREATE: the new stat block joins this fight; it's in CODEX › THREATS too.
  const handleThreatBuilt = (threatId: string) => {
    addEntry(threatId);
    build(null);
  };

  return (
    <div className="field">
      <BudgetPanel entries={entries} agents={agents} bestiary={bestiary} tier={tier} />
      <div className="ed-rows">
        {entries.map((e, i) => {
          const t = bestiary.find((x) => x.id === e.threatId);
          const name = e.label ?? t?.name ?? e.threatId;
          const visibility = e.visibility ?? "bars";
          const isOpen = open === i;
          return (
            <div key={i} ref={reorder.rowRef(i)} className={`ed-row ${isOpen ? "open" : ""}`}>
              <div className="ed-row-head">
                <DragHandle label={name} {...reorder.handle(i)} />
                <button
                  className="ed-sum"
                  aria-expanded={isOpen}
                  aria-label={`${e.count} × ${name}`}
                  onClick={() => setOpen(isOpen ? null : i)}
                >
                  <b className="ed-count red">{e.count}</b>
                  <span aria-hidden="true">×</span>
                  <span className="ed-threat">{name.toUpperCase()}</span>
                  {t && <span className="chip">{THREAT_CLASS_LABEL[threatClassAt(t, tier)]}</span>}
                  {e.asMob && <span className="chip">MOB</span>}
                  {e.marker && <span className="chip">MARKER: {e.marker.toUpperCase()}</span>}
                  <span className="chip">{VISIBILITY_LABEL[visibility]}</span>
                  {t && (
                    <span className="ed-stats">
                      DEF {t.defence} · W {t.wounds} · S {t.shock ?? "–"} · RES {t.resilience.value} · SPD {t.speed}
                    </span>
                  )}
                </button>
              </div>
              {isOpen && (
                <div className="ed-row-body">
                  <div className="field">
                    <span className="label">THREAT</span>
                    <div>
                      <ThreatPicker
                        bestiary={bestiary}
                        tier={tier}
                        value={e.threatId}
                        onPick={(p) => setEntry(i, { threatId: p.id })}
                      />
                    </div>
                  </div>
                  {/* The combatant's name in the fight (encounter.actions.ts); blank keeps the stat block's. */}
                  <label className="field">
                    <span className="label">NAME</span>
                    <input
                      className="input"
                      placeholder={t?.name ?? e.threatId}
                      maxLength={100}
                      value={e.label ?? ""}
                      onChange={(ev) => setEntry(i, { label: ev.target.value || undefined })}
                    />
                  </label>
                  <div className="ed-pair">
                    <div className="field">
                      <span className="label">COUNT</span>
                      <div className="keys" style={{ alignItems: "center" }}>
                        <button
                          className="btn sq"
                          aria-label="Fewer"
                          disabled={e.count <= 1}
                          onClick={() => setEntry(i, { count: e.count - 1 })}
                        >
                          −
                        </button>
                        <b className="ed-count" aria-live="polite">
                          {e.count}
                        </b>
                        <button
                          className="btn sq"
                          aria-label="More"
                          onClick={() => setEntry(i, { count: e.count + 1 })}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <label className="ed-check">
                      <input
                        type="checkbox"
                        checked={e.asMob}
                        onChange={(ev) => setEntry(i, { asMob: ev.target.checked })}
                      />
                      AS A MOB
                    </label>
                  </div>
                  <div className="field">
                    <span className="label">WHAT PLAYERS SEE</span>
                    <div className="seg" role="group" aria-label="What players see">
                      {Visibility.options.map((v) => (
                        <button
                          key={v}
                          className={`btn sm ${visibility === v ? "primary" : ""}`}
                          aria-pressed={visibility === v}
                          onClick={() => setEntry(i, { visibility: v })}
                        >
                          {VISIBILITY_LABEL[v]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <span className="label">MARKER</span>
                    <div className="keys" role="group" aria-label="Marker">
                      {Marker.options.map((m) => (
                        <button
                          key={m}
                          className="ed-swatch"
                          style={{ background: `var(--marker-${m})` }}
                          aria-pressed={e.marker === m}
                          aria-label={`Marker: ${m}`}
                          onClick={() => setEntry(i, { marker: e.marker === m ? undefined : m })}
                        />
                      ))}
                    </div>
                  </div>
                  {/* Profiles and scaling fold under the row: more controls beside the picker would shrink the 44px
                    tap targets this tablet needs. */}
                  <ThreatScale
                    threat={t}
                    tier={tier}
                    agents={agents}
                    asMob={e.asMob && e.count > 1}
                    profiles={e.profiles}
                    scale={e.scale}
                    onChange={(next) => setEntry(i, next)}
                  />
                  {t && <StatBlock t={t} tier={tier} />}
                  <div>
                    <button className="lnk red" onClick={() => removeEntry(i)}>
                      REMOVE
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="ed-find-row">
        <FindField
          label="Find a threat"
          options={options}
          onPick={addEntry}
          // Writing one here keeps the scene open; leaving for CODEX › THREATS would drop its unsaved changes. A stat
          // block being written closes only by its own CANCEL, so a stray tap can't drop it.
          newLabel={customsFull || building ? undefined : (q) => `+ NEW CUSTOM THREAT “${q}”`}
          onCreate={(q) => {
            setTyped(q);
            build("start");
          }}
        />
        {/* The same start as typing an unknown name, for a GM who doesn't know that route exists. */}
        {!customsFull && !building && (
          <button
            className="btn"
            onClick={() => {
              setTyped("");
              build("start");
            }}
          >
            + NEW CUSTOM THREAT
          </button>
        )}
      </div>
      {/* The find box disables itself with nothing to show; say why, because a failed load looks like an empty book. */}
      {!bestiary.length && <span className="dim">No bestiary loaded.</span>}
      {customsFull && <span className="dim">Custom threats are full ({CUSTOM_THREAT_CAP}).</span>}
      {building === "start" && (
        <div className="panel pad stack">
          <ThreatStarts
            bestiary={bestiary}
            tier={tier}
            full={customsFull}
            onStart={(d) => build({ ...d, name: d.name || typed })}
          />
          <div>
            <button className="lnk" onClick={() => build(null)}>
              CANCEL
            </button>
          </div>
        </div>
      )}
      {building && building !== "start" && (
        <>
          <i className="dim">CREATE saves it to CODEX › THREATS straight away, whatever happens to this scene.</i>
          <ThreatBuilder
            start={{ slug: null, draft: building }}
            tier={tier}
            wargear={wargear}
            ruinActions={poolTables.find((t) => t.id === RUIN_ACTIONS_TABLE) ?? null}
            send={send}
            onSaved={handleThreatBuilt}
            onCancel={() => build(null)}
          />
        </>
      )}
    </div>
  );
}
