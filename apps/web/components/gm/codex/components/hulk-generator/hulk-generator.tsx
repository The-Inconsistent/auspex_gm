"use client";
import { useState } from "react";

import {
  HULK_HAZARDS,
  MAX_HULK_ORIGINS,
  MAX_PLACES_PER_ADD,
  rowsFor,
  threatCite,
  type Codex,
  type Dice,
  type HazardTable,
  type SpaceHulkGenerator,
} from "@wg/shared";

import { TableRoll } from "@/components/ui/table-roll/table-roll";
import type { Send } from "@/hooks/use-table/use-table";
import { placeOptions } from "@/lib/places/places";

import { HULK_MODES, type HulkMode } from "./constants";

type Row = { id: string; name: string; from?: number; to?: number };

type HulkGeneratorProps = {
  generator: SpaceHulkGenerator;
  hazards: HazardTable[]; // Stage 4 is the Hazards Table among them (issue #49)
  codex: Pick<Codex, "locations">; // where the hulk, or more rooms, can go
  send: Send;
  onError: (error: string | null) => void;
};

const range = (r: Row) => (r.from === r.to ? `${r.from}` : `${r.from}–${r.to}`);

// One stage: ROLL or I ROLLED lands on a row (a print gap lands on none), or the GM taps one from the table. Every stage
// may be rolled again (RR1 p.6, rules-flow §11.101).
function Stage({
  label,
  table,
  noun,
  picked,
  onPick,
}: {
  label: string;
  table: { id: string; name: string; page: number; dice: Dice; rows: Row[] };
  noun: string;
  picked: Row[];
  onPick: (row: Row) => void;
}) {
  const [rolled, setRolled] = useState<number | null>(null);
  const ranged = table.rows.flatMap((r) =>
    r.from === undefined || r.to === undefined ? [] : [{ ...r, from: r.from, to: r.to }],
  );
  const hits = rolled === null ? [] : rowsFor(ranged, rolled);

  // ROLL or I ROLLED: one row is picked; a print gap or two rows leave the pick to the GM.
  const land = (n: number) => {
    setRolled(n);
    const [hit, other] = rowsFor(ranged, n);
    if (hit && !other) onPick(hit);
  };

  return (
    <div className="field stack" style={{ gap: 6 }}>
      <span className="label">
        {label} · {table.name.toUpperCase()}, p.{table.page}
      </span>
      <TableRoll key={table.id} dice={table.dice} rolled={rolled} hits={hits.length} noun={noun} onLand={land} />
      <details>
        <summary className="dim" style={{ cursor: "pointer" }}>
          OR PICK FROM THE TABLE
        </summary>
        <div className="list" style={{ paddingTop: 6, maxHeight: 320, overflowY: "auto" }}>
          {ranged.map((r) => {
            const on = picked.some((p) => p.id === r.id);
            return (
              <button
                key={r.id}
                className={`btn sm ${on ? "primary" : ""}`}
                style={{ justifyContent: "flex-start", textAlign: "left" }}
                aria-pressed={on}
                onClick={() => onPick(r)}
              >
                {on ? "✓ " : hits.includes(r) ? "▸ " : ""}
                {range(r)} · {r.name.toUpperCase()}
              </button>
            );
          })}
        </div>
      </details>
    </div>
  );
}

// The picks of a stage that keeps several (origins, rooms, hazards), each with × to drop it.
function Picks({ rows, onDrop }: { rows: Row[]; onDrop: (i: number) => void }) {
  if (!rows.length) return null;
  return (
    <div className="keys" style={{ paddingTop: 0 }}>
      {rows.map((r, i) => (
        <button key={i} className="chip" aria-label={`Drop ${r.name}`} onClick={() => onDrop(i)}>
          {r.name.toUpperCase()} ×
        </button>
      ))}
    </div>
  );
}

const without = <T,>(list: T[], i: number) => list.filter((_, j) => j !== i);

// SPACE HULK GENERATOR (RR1 pp.6–11, issue #50 step 8): Origin, Occupants and Objective, Rooms, and Features & Hazards,
// each rolled or picked, then written to the codex as a hidden hulk with its rooms inside it. ROOMS FOR rolls only rooms,
// inside a place already here: the book lets rooms come "as the group enters" (§11.102). WRITE sends row ids only; the
// server copies the printed text into GM NOTES.
export function HulkGenerator({ generator: g, hazards, codex, send, onError }: HulkGeneratorProps) {
  const [mode, setMode] = useState<HulkMode>("hulk");
  const [name, setName] = useState("Space hulk");
  const [parentId, setParentId] = useState("");
  const [origins, setOrigins] = useState<Row[]>([]);
  const [occupants, setOccupants] = useState<Row | null>(null);
  const [objective, setObjective] = useState<Row | null>(null);
  const [rooms, setRooms] = useState<Row[]>([]);
  const [features, setFeatures] = useState<Row[]>([]);
  const [writing, setWriting] = useState(false);
  const [wrote, setWrote] = useState<string | null>(null);
  const [round, setRound] = useState(0); // a new round remounts the stages, so the last hulk's rolls go too
  const stage4 = hazards.find((t) => t.id === HULK_HAZARDS);
  // INSIDE falls back to none once its place is deleted (here or on another tablet), so WRITE never sends a stale id.
  const parent = codex.locations.some((l) => l.id === parentId) ? parentId : "";
  const tooMany = rooms.length > MAX_PLACES_PER_ADD - 1;
  const ready =
    !tooMany &&
    (mode === "hulk"
      ? !!name.trim() && origins.length > 0 && !!occupants && !!objective
      : !!parent && rooms.length > 0);

  const reset = () => {
    setOrigins([]);
    setOccupants(null);
    setObjective(null);
    setRooms([]);
    setFeatures([]);
    setRound((n) => n + 1);
  };

  // WRITE TO CODEX: one codex.addHulk; the button waits until it lands.
  const write = async () => {
    setWriting(true);
    const r = await send({
      type: "codex.addHulk",
      parentId: parent || null,
      hulk:
        mode === "hulk" && occupants && objective
          ? {
              name: name.trim(),
              origins: origins.map((o) => o.id),
              occupants: occupants.id,
              objective: objective.id,
              hazards: features.map((f) => f.id),
            }
          : null,
      rooms: rooms.map((x) => x.id),
    });
    setWriting(false);
    onError(r.ok ? null : r.error);
    if (!r.ok) return setWrote(null);
    const n = rooms.length;
    const roomsText = `${n} room${n === 1 ? "" : "s"}`;
    setWrote(mode === "hulk" ? `Wrote ${name.trim()}${n ? ` with ${roomsText} inside` : ""}.` : `Wrote ${roomsText}.`);
    reset();
  };

  return (
    <details className="field">
      <summary className="label">SPACE HULK GENERATOR</summary>
      <div className="stack" style={{ gap: 12, paddingTop: 8 }}>
        <div className="keys" role="group" aria-label="What to generate" style={{ paddingTop: 0 }}>
          {(Object.keys(HULK_MODES) as HulkMode[]).map((m) => (
            <button
              key={m}
              className={`btn sm ${mode === m ? "primary" : ""}`}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              {HULK_MODES[m]}
            </button>
          ))}
        </div>
        <div className="dim">
          {threatCite(g)}. If a result doesn&apos;t take the adventure where you want it, roll again.
        </div>

        {mode === "hulk" && (
          <>
            <div className="field">
              <label className="label" htmlFor="hulk-name">
                NAME
              </label>
              <input id="hulk-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Stage
              key={`origin-${round}`}
              label="1 · ORIGIN"
              table={g.origin}
              noun="origin"
              picked={origins}
              onPick={(r) => setOrigins((o) => (o.length < MAX_HULK_ORIGINS ? [...o, r] : o))}
            />
            <Picks rows={origins} onDrop={(i) => setOrigins((o) => without(o, i))} />
            <Stage
              key={`occupants-${round}`}
              label="2 · OCCUPANTS"
              table={g.occupants}
              noun="occupant"
              picked={occupants ? [occupants] : []}
              onPick={setOccupants}
            />
            {occupants && <div>{occupants.name}</div>}
            <Stage
              key={`objective-${round}`}
              label="2 · OBJECTIVE"
              table={g.objectives}
              noun="objective"
              picked={objective ? [objective] : []}
              onPick={setObjective}
            />
            {objective && <div>{objective.name}</div>}
          </>
        )}

        <Stage
          key={`rooms-${round}`}
          label={mode === "hulk" ? "3 · ROOMS" : "ROOMS"}
          table={g.rooms}
          noun="room"
          picked={rooms}
          onPick={(r) => setRooms((x) => [...x, r])}
        />
        <Picks rows={rooms} onDrop={(i) => setRooms((x) => without(x, i))} />
        {tooMany && <div className="red">! Up to {MAX_PLACES_PER_ADD - 1} rooms at once.</div>}

        {mode === "hulk" && stage4?.dice && (
          <>
            <Stage
              key={`hazards-${round}`}
              label="4 · FEATURES & HAZARDS"
              table={{ ...stage4, dice: stage4.dice }}
              noun="hazard"
              picked={features}
              onPick={(r) => setFeatures((f) => (f.some((x) => x.id === r.id) ? f : [...f, r]))}
            />
            <Picks rows={features} onDrop={(i) => setFeatures((f) => without(f, i))} />
          </>
        )}

        <div className="field">
          <label className="label" htmlFor="hulk-inside">
            INSIDE
          </label>
          <select id="hulk-inside" className="input" value={parent} onChange={(e) => setParentId(e.target.value)}>
            <option value="">{mode === "hulk" ? "— TOP LEVEL" : "— PICK A PLACE"}</option>
            {placeOptions(codex.locations).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="dim">
          {mode === "hulk"
            ? "The hulk's GM NOTES get its origins, occupants and objective; each room's, its printed text. Features go on the hulk's HAZARDS."
            : "Each room's GM NOTES get its printed text."}{" "}
          DESCRIPTION stays empty for your own words (Core p.315), and everything starts HIDDEN.
        </div>
        <button className="btn primary" disabled={writing || !ready} onClick={write}>
          WRITE TO CODEX
        </button>
        {wrote && <div>{wrote}</div>}
      </div>
    </details>
  );
}
