"use client";
import { useState, type ChangeEvent } from "react";

import {
  BOOKS,
  BeatTest,
  presetScene,
  results,
  roll,
  rowsFor,
  threatCite,
  type EventTable,
  type ThreatSource,
} from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

import { dnLabel, testTitle } from "../../utils";

type ScenePickerProps = { adventureId: string; tables: EventTable[]; send: Send; onDone: (msg: string) => void };

// NEW SCENE FROM A TABLE (issue #39): a book, one of its event tables, then an event, by tapping it, rolling (the app
// rolls on a book table in prep only) or typing what the GM rolled. MAKE THIS SCENE saves `presetScene` as a new scene
// of this adventure: the event's name, read-aloud, text and Tests, nothing else.
export function ScenePicker({ adventureId, tables, send, onDone }: ScenePickerProps) {
  const sources = [...new Set(tables.map((t) => t.source))];
  const [source, setSource] = useState<ThreatSource | undefined>(sources[0]);
  const inBook = tables.filter((t) => t.source === source);
  const [tableId, setTableId] = useState(inBook[0]?.id);
  const table = inBook.find((t) => t.id === tableId) ?? inBook[0];
  const [rolled, setRolled] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<number | null>(null); // index into table.rows
  const [error, setError] = useState<string | null>(null);

  // A new book or table starts the choice again.
  const choose = ({ book, id }: { book?: ThreatSource; id?: string }) => {
    setSource(book);
    setTableId(id);
    setRolled(null);
    setTyped("");
    setPicked(null);
  };

  // Book select: its first table.
  const handleBookChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const book = sources.find((s) => s === e.target.value);
    choose({ book, id: tables.find((t) => t.source === book)?.id });
  };

  // ROLL or I ROLLED: lands on the event(s) for that result; two where the book prints overlapping ranges.
  const land = (result: number) => {
    if (!table) return;
    setRolled(result);
    const hits = rowsFor(table.rows, result);
    setPicked(hits.length === 1 ? table.rows.indexOf(hits[0]!) : null);
  };

  // I ROLLED: only a result these dice can show.
  const handleTyped = (e: ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
    setTyped(digits);
    if (table && results(table.dice).includes(Number(digits))) land(Number(digits));
  };

  // MAKE THIS SCENE: saves the event as a scene, last in the adventure, then closes the picker.
  const make = async () => {
    const row = table && picked !== null ? table.rows[picked] : undefined;
    if (!table || !row) return;
    const r = await send({ type: "codex.save", kind: "beat", data: { ...presetScene({ table, row }), adventureId } });
    if (!r.ok) return setError(r.error);
    onDone(`SCENE CREATED: ${row.name.toUpperCase()}`);
  };

  if (!table) return <div className="panel pad dim">No book tables are loaded.</div>;
  const hits = rolled === null ? [] : rowsFor(table.rows, rolled);
  const row = picked === null ? undefined : table.rows[picked];
  const scene = row && presetScene({ table, row });
  const range = (from: number, to: number) => (from === to ? `${from}` : `${from}–${to}`);

  return (
    <div className="panel pad stack">
      <span className="label">NEW SCENE FROM A TABLE</span>
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
              {BOOKS[s].name}
            </option>
          ))}
        </select>
        {inBook.map((t) => (
          <button
            key={t.id}
            className={`btn sm ${t.id === table.id ? "primary" : ""}`}
            aria-pressed={t.id === table.id}
            onClick={() => choose({ book: source, id: t.id })}
          >
            {t.name.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="dim" style={{ fontSize: 12 }}>
        {table.dice.toUpperCase()} · {threatCite({ source: table.source, page: table.page })}
        {table.defaultDn ? ` · Tests are DN ${table.defaultDn} unless you decide otherwise` : ""}
      </div>
      {table.gm && (
        <details className="field plate">
          <summary className="label">HOW TO USE THIS TABLE</summary>
          <pre className="text">{table.gm}</pre>
        </details>
      )}

      <div className="keys" style={{ alignItems: "center" }}>
        <button className="btn sm primary" onClick={() => land(roll(table.dice))}>
          ROLL {table.dice.toUpperCase()}
        </button>
        <input
          className="input"
          style={{ width: 90 }}
          aria-label={`I rolled (${table.dice})`}
          placeholder="I ROLLED"
          inputMode="numeric"
          value={typed}
          onChange={handleTyped}
        />
        {rolled !== null && (
          <span>
            <b>ROLLED {rolled}</b>
            {table.dice === "d66" && (
              <span className="dim">
                {" "}
                (TENS {Math.floor(rolled / 10)} · UNITS {rolled % 10})
              </span>
            )}
            {!hits.length && <span className="red"> · the book prints no event for {rolled}</span>}
            {hits.length > 1 && <span className="dim"> · the book prints two events for {rolled}: pick one</span>}
          </span>
        )}
      </div>

      <div className="list">
        {table.rows.map((e, i) => (
          <button
            key={i}
            className={`btn sm ${i === picked ? "primary" : ""}`}
            style={{ justifyContent: "flex-start", textAlign: "left" }}
            aria-pressed={i === picked}
            onClick={() => setPicked(i)}
          >
            {hits.includes(e) && i !== picked ? "▸ " : ""}
            {range(e.from, e.to)} · {e.name.toUpperCase()}
            {e.tests.length > 0 && ` · ${e.tests.length} TEST${e.tests.length > 1 ? "S" : ""}`}
          </button>
        ))}
      </div>

      {row && scene && (
        <div className="item stack" style={{ gap: 6 }}>
          <b>{row.name.toUpperCase()}</b>
          {row.readAloud && (
            <div className="field">
              <span className="label">READ ALOUD</span>
              <pre className="text">{row.readAloud}</pre>
            </div>
          )}
          <div className="field">
            <span className="label">GM NOTES</span>
            <pre className="text">{scene.gmNotes}</pre>
          </div>
          {scene.tests.length > 0 && (
            <div className="field">
              <span className="label">TESTS · {scene.tests.length}</span>
              {scene.tests.map((t, i) => {
                const test = BeatTest.parse(t);
                return (
                  <div key={i}>
                    <b>{testTitle(test)}</b> <span className="chip">{dnLabel(test)}</span> {test.purpose}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {error && <div className="red">! {error}</div>}
      <div className="keys">
        <button className="btn primary" disabled={!row} onClick={make}>
          MAKE THIS SCENE
        </button>
        <button className="btn" onClick={() => onDone("")}>
          CANCEL
        </button>
      </div>
    </div>
  );
}
