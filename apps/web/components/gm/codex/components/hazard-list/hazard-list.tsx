"use client";
import { useState, type ChangeEvent } from "react";

import {
  ATTRIBUTE_NAMES,
  ATTRIBUTES,
  sourceName,
  BeatTest,
  LocationHazard,
  MAX_HAZARDS,
  SKILLS,
  rowsFor,
  threatCite,
  type HazardRow,
  type HazardTable,
  type Intensity,
  type Threat,
  type ThreatSource,
} from "@wg/shared";

import { HazardChips } from "@/components/gm/prep/components/hazard-chips/hazard-chips";
import { FieldError } from "@/components/ui/field-error/field-error";
import { NumberInput } from "@/components/ui/number-input/number-input";
import { useFieldErrors } from "@/hooks/use-field-errors/use-field-errors";
import { TableRoll } from "@/components/ui/table-roll/table-roll";
import { hazardView, rollHazards } from "@/lib/hazards/hazards";

type HazardListProps = {
  id: string;
  value: LocationHazard[];
  tables: HazardTable[];
  bestiary: Threat[];
  tier: number;
  onChange: (list: LocationHazard[]) => void;
};

// YOUR OWN HAZARD's Test: none, a Skill or an Attribute, as "skill:Athletics" or "attribute:T".
const TEST_OPTIONS: [value: string, label: string][] = [
  ["", "No Test"],
  ...Object.entries(SKILLS).map(([s, a]): [string, string] => [`skill:${s}`, `${s} (${a})`]),
  ...ATTRIBUTES.map((a): [string, string] => [`attribute:${a}`, ATTRIBUTE_NAMES[a]]),
];
const range = (r: HazardRow) => (r.from === undefined ? "" : r.from === r.to ? `${r.from} · ` : `${r.from}–${r.to} · `);

// A place's hazards (issue #49): the list, ADD FROM A BOOK TABLE (tap a row, ROLL, I ROLLED, or ×TIER: one roll per Tier,
// TA p.9) and YOUR OWN HAZARD. A book hazard stores only its row id; nothing is sent until the editor's SAVE.
export function HazardList({ id, value, tables, bestiary, tier, onChange }: HazardListProps) {
  const sources = [...new Set(tables.map((t) => t.source))];
  const [source, setSource] = useState<ThreatSource | undefined>(sources[0]);
  const inBook = tables.filter((t) => t.source === source);
  const [tableId, setTableId] = useState(inBook[0]?.id);
  const table = inBook.find((t) => t.id === tableId) ?? inBook[0];
  const [rolled, setRolled] = useState<number | null>(null);
  const [picked, setPicked] = useState<string | null>(null); // a row id
  const [own, setOwn] = useState({ name: "", test: "", dn: null as number | null, effect: "" });
  const ownFields = useFieldErrors(`${id}-own-`); // YOUR OWN HAZARD: a custom hazard is named (LocationHazard)
  const full = value.length >= MAX_HAZARDS;
  const ranged =
    table?.rows.flatMap((r) =>
      r.from === undefined || r.to === undefined ? [] : [{ ...r, from: r.from, to: r.to }],
    ) ?? [];
  const hits = rolled === null ? [] : rowsFor(ranged, rolled);

  // A new book or table starts the choice again.
  const choose = ({ book, table: next }: { book?: ThreatSource; table?: string }) => {
    setSource(book);
    setTableId(next);
    setRolled(null);
    setPicked(null);
  };

  // Book chips: that book's first table.
  const handleBook = (book: ThreatSource) => choose({ book, table: tables.find((t) => t.source === book)?.id });

  // ROLL or I ROLLED: selects the row it lands on; none in a print gap (§11.93), none of two where ranges overlap.
  const land = (result: number) => {
    setRolled(result);
    const found = rowsFor(ranged, result);
    setPicked(found.length === 1 ? found[0]!.id : null);
  };

  // A book row onto the list, at no intensity yet: the GM picks one where the book prints them (§11.94).
  const entryFor = (row: HazardRow): LocationHazard => ({
    id: crypto.randomUUID(),
    kind: "book",
    hazardId: row.id,
    variant: null,
  });

  // + ADD: the selected row.
  const addPicked = () => {
    const row = table?.rows.find((r) => r.id === picked);
    if (row && !full) onChange([...value, entryFor(row)]);
  };

  // ×TIER: one roll per Tier of the game (TA p.9), each added, up to the list's limit.
  const addPerTier = () => {
    if (!table) return;
    const rows = rollHazards({ table, times: Math.min(tier, MAX_HAZARDS - value.length) });
    onChange([...value, ...rows.map(entryFor)]);
  };

  // An intensity chip: picks it, or clears it when tapped again.
  const setIntensity = (entryId: string, name: Intensity) =>
    onChange(
      value.map((h) =>
        h.id === entryId && h.kind === "book" ? { ...h, variant: h.variant === name ? null : name } : h,
      ),
    );

  // YOUR OWN HAZARD's + ADD: the name, the Test if one is picked, and what happens.
  const addOwn = () => {
    const [kind, what] = own.test.split(":");
    const test = kind ? BeatTest.parse({ kind, [kind]: what, dn: own.dn }) : null;
    const hazard = ownFields.check(LocationHazard, {
      id: crypto.randomUUID(),
      kind: "custom",
      name: own.name.trim(),
      tests: test ? [test] : [],
      effect: own.effect,
    });
    if (!hazard) return;
    onChange([...value, hazard]);
    setOwn({ name: "", test: "", dn: null, effect: "" });
  };

  return (
    <div className="stack" role="group" aria-labelledby={id} style={{ gap: 10 }}>
      <div className="dim">
        Roll once per Tier of the game; that is probably enough (Threat Assessment p.9). Tier {tier}: {tier} roll
        {tier === 1 ? "" : "s"}. Describe hidden dangers only when they are about to happen.
      </div>
      <div className="hazard-body">
        <div className="stack" style={{ gap: 8 }}>
          <span className="label">ON THIS PLACE · {value.length}</span>
          {!value.length && <div className="dim">None yet.</div>}
          {value.map((h) => {
            const view = hazardView({ entry: h, tables, tier });
            const name = view?.name ?? (h.kind === "book" ? h.hazardId : h.name);
            return (
              <div key={h.id} className="item stack" style={{ gap: 6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <b style={{ flex: 1 }}>
                    {name.toUpperCase()} <i className="dim">{view?.cite ?? "not in the loaded tables"}</i>
                  </b>
                  <button
                    className="btn sm danger"
                    aria-label={`Remove ${name}`}
                    onClick={() => onChange(value.filter((x) => x.id !== h.id))}
                  >
                    ×
                  </button>
                </div>
                {h.kind === "book" && view && view.intensities.length > 0 && (
                  <div className="keys" role="group" aria-label={`${name}: intensity`} style={{ paddingTop: 0 }}>
                    {view.intensities.map((v) => (
                      <button
                        key={v.name}
                        className={`btn sm ${h.variant === v.name ? "primary" : ""}`}
                        aria-pressed={h.variant === v.name}
                        onClick={() => setIntensity(h.id, v.name)}
                      >
                        {v.name.toUpperCase()}
                      </button>
                    ))}
                    {!h.variant && <span className="dim">Pick an intensity (Core p.202).</span>}
                  </div>
                )}
                {view && <HazardChips view={view} bestiary={bestiary} tier={tier} />}
              </div>
            );
          })}

          <span className="label">YOUR OWN HAZARD</span>
          <div className="keys" style={{ paddingTop: 0 }}>
            <input
              id={`${id}-own-name`}
              className="input"
              style={{ flex: "1 1 160px", width: "auto" }}
              aria-label="Your own hazard: name"
              placeholder="Name"
              value={own.name}
              onChange={(e) => {
                setOwn({ ...own, name: e.target.value });
                ownFields.clear("name");
              }}
              {...ownFields.marks("name")}
            />
            <select
              className="input"
              style={{ flex: "1 1 140px", width: "auto" }}
              aria-label="Your own hazard: Test"
              value={own.test}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setOwn({ ...own, test: e.target.value })}
            >
              {TEST_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            {own.test && (
              <NumberInput
                value={own.dn}
                label="Your own hazard: DN"
                max={20}
                onChange={(dn) => setOwn({ ...own, dn })}
              />
            )}
          </div>
          <div className="keys" style={{ paddingTop: 0 }}>
            <input
              className="input"
              style={{ flex: "1 1 200px", width: "auto" }}
              aria-label="Your own hazard: what happens"
              placeholder="What happens"
              value={own.effect}
              onChange={(e) => setOwn({ ...own, effect: e.target.value })}
            />
            <button className="btn sm" disabled={full} onClick={addOwn}>
              + ADD
            </button>
          </div>
          <FieldError {...ownFields.reason("name")} />
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <span className="label">ADD FROM A BOOK TABLE</span>
          {!table && <div className="dim">No hazard tables are loaded.</div>}
          {table && (
            <>
              <div className="keys" role="group" aria-label="Book" style={{ paddingTop: 0 }}>
                {sources.map((s) => (
                  <button
                    key={s}
                    className={`btn sm ${s === source ? "primary" : ""}`}
                    aria-pressed={s === source}
                    onClick={() => handleBook(s)}
                  >
                    {sourceName(s).toUpperCase()}
                  </button>
                ))}
              </div>
              <select
                className="input"
                aria-label="Hazard table"
                value={table.id}
                onChange={(e) => choose({ book: source, table: e.target.value })}
              >
                {inBook.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.dice ?? "pick one"} · {threatCite(t)}
                  </option>
                ))}
              </select>
              <div className="list">
                {table.rows.map((r) => (
                  <button
                    key={r.id}
                    className={`btn sm ${r.id === picked ? "primary" : ""}`}
                    style={{ justifyContent: "flex-start", textAlign: "left" }}
                    aria-pressed={r.id === picked}
                    onClick={() => setPicked(r.id)}
                  >
                    {hits.some((x) => x.id === r.id) && r.id !== picked ? "▸ " : ""}
                    {range(r)}
                    {r.name.toUpperCase()}
                  </button>
                ))}
              </div>
              {table.gaps.length > 0 && (
                <div className="dim">No printed row for {table.gaps.join(", ")}: ×TIER rolls again.</div>
              )}
              {table.dice && (
                <>
                  <TableRoll
                    key={table.id}
                    dice={table.dice}
                    rolled={rolled}
                    hits={hits.length}
                    noun="hazard"
                    onLand={land}
                  />
                  <button className="btn sm" disabled={full} onClick={addPerTier}>
                    ×TIER · {tier}
                  </button>
                </>
              )}
              <button className="btn sm primary" disabled={!picked || full} onClick={addPicked}>
                + ADD {table.rows.find((r) => r.id === picked)?.name.toUpperCase() ?? ""}
              </button>
              {full && <div className="dim">A place holds at most {MAX_HAZARDS} hazards.</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
