"use client";
import { useMemo, useState } from "react";

import {
  BOOKS,
  rowsFor,
  sourceCite,
  threatCite,
  wargearMatches,
  type LootItem,
  type LootRow,
  type LootTable,
  type Wargear,
} from "@wg/shared";

import { TableRoll } from "@/components/ui/table-roll/table-roll";
import type { Send } from "@/hooks/use-table/use-table";

type LootPickerProps = {
  tables: LootTable[]; // GM-only, from /scene-presets
  wargear: Wargear[];
  tier: number;
  send: Send;
  onError: (error: string | null) => void;
};

const ORDER = Object.keys(BOOKS); // the Core Rulebook leads
const range = (r: LootRow) => (r.from === undefined ? "" : r.from === r.to ? `${r.from}` : `${r.from}–${r.to}`);
const ranged = (t: LootTable) =>
  t.rows.flatMap((r) => (r.from === undefined || r.to === undefined ? [] : [{ ...r, from: r.from, to: r.to }]));
// What a row hands over, for its chip: "PICK", "3 ITEMS", "d3 ITEMS", or "AWARD" when it makes no item: only Ammo,
// grenades (counted by type on the sheet, so GIVE refuses them, rules-flow.md §11.113), Wealth or a boon.
const counted = (catalogue: ReadonlyMap<string, Wargear>, id?: string) =>
  ["ammo", "grenade"].includes((id && catalogue.get(id)?.kind) || "");
const makes = (r: LootRow, catalogue: ReadonlyMap<string, Wargear>) => {
  if (r.items.some((i) => i.pick)) return "PICK";
  const items = r.items.filter((i) => !counted(catalogue, i.wargearId));
  if (!items.length) return "AWARD";
  const fixed = items.reduce((n, i) => n + (typeof i.count === "number" ? i.count : 0), 0);
  const dice = items.filter((i) => typeof i.count !== "number").map((i) => i.count);
  return `${[fixed || null, ...dice].filter(Boolean).join(" + ")} ITEM${fixed === 1 && !dice.length ? "" : "S"}`;
};

// One `pick` of a row: the catalogue entries it offers, with a search (issue #51).
export function Pick({
  item,
  matches,
  value,
  onChange,
}: {
  item: LootItem;
  matches: Wargear[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const shown = matches.filter((w) => w.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40);
  return (
    <div className="field stack" style={{ gap: 4 }}>
      <span className="label">
        PICK {item.count === 1 ? "ONE" : String(item.count).toUpperCase()} FROM THE CATALOGUE · {matches.length} MATCH
      </span>
      <input className="input" placeholder="Search the matches" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="list" style={{ maxHeight: 240, overflowY: "auto" }}>
        {shown.map((w) => (
          <button
            key={w.id}
            className={`btn sm ${value === w.id ? "primary" : ""}`}
            style={{ justifyContent: "space-between" }}
            aria-pressed={value === w.id}
            onClick={() => onChange(w.id)}
          >
            <span>{w.name}</span>
            <span className="dim">
              {sourceCite(w)}
              {w.value === null ? "" : ` · V${w.value}`}
            </span>
          </button>
        ))}
        {matches.length > shown.length && (
          <span className="dim">+ {matches.length - shown.length} more · search to narrow</span>
        )}
      </div>
    </div>
  );
}

// FROM LOOT TABLE (issue #51): pick a book's table, ROLL, I ROLLED or tap a row, choose any catalogue picks, and MAKE the
// items. The app rolls on book tables in prep only (rules-flow.md §7). The server writes the items with the printed
// result in GM NOTES; Ammo, Wealth and boons stay a reminder to award in PARTY.
export function LootPicker({ tables, wargear, tier, send, onError }: LootPickerProps) {
  const lootTables = useMemo(
    () => tables.filter((t) => !t.fault).sort((a, b) => ORDER.indexOf(a.source) - ORDER.indexOf(b.source)),
    [tables],
  );
  const [tableId, setTableId] = useState(lootTables[0]?.id ?? "");
  const [rolled, setRolled] = useState<number | null>(null);
  const [rowId, setRowId] = useState<string | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [faultId, setFaultId] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const table = lootTables.find((t) => t.id === tableId);
  const faults = tables.find((t) => t.id === table?.faults);
  const row = table?.rows.find((r) => r.id === rowId);
  const pickItems = row?.items.filter((i) => i.pick) ?? [];
  const catalogue = useMemo(() => new Map(wargear.map((w) => [w.id, w])), [wargear]);

  // A new table, or a new row, starts its choices over.
  const pickTable = (id: string) => {
    setTableId(id);
    setRolled(null);
    pickRow(null);
  };
  const pickRow = (id: string | null) => {
    setRowId(id);
    setPicks([]);
    setFaultId(null);
    setDone(null);
  };
  // ROLL or I ROLLED: one row lands; a print gap or two rows leave the pick to the GM.
  const land = (n: number) => {
    setRolled(n);
    const [hit, other] = table ? rowsFor(ranged(table), n) : [];
    pickRow(hit && !other ? hit.id : null);
  };
  // MAKE: the server makes the items and writes the notes.
  const make = async () => {
    if (!row) return;
    const r = await send({
      type: "codex.addLoot",
      rowId: row.id,
      picks,
      roll: rolled ?? undefined,
      faultId: faultId ?? undefined,
    });
    onError(r.ok ? null : r.error);
    if (r.ok) setDone(`MADE ${row.name.toUpperCase()}: see the list below`);
  };

  if (!lootTables.length) return null;
  const award = row && [
    ...row.ammo.map((a) => `${a.count} ${a.kind} Ammo`),
    ...(row.wealth ? [`${row.wealth} Wealth`] : []),
    ...row.items
      .filter((i) => counted(catalogue, i.wargearId))
      .map((i) => `${i.count} × ${i.name ?? (i.wargearId && catalogue.get(i.wargearId)?.name)}`),
  ];
  return (
    <details className="panel pad">
      <summary className="label" style={{ cursor: "pointer" }}>
        FROM LOOT TABLE
      </summary>
      <div className="stack" style={{ gap: 8, paddingTop: 8 }}>
        <span className="dim">
          <i>
            Prep only. ROLL picks a row at random, I ROLLED takes the number from your own dice, or tap a row. Tests at
            the table stay on physical dice.
          </i>
        </span>
        <select className="input" aria-label="Loot table" value={tableId} onChange={(e) => pickTable(e.target.value)}>
          {lootTables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {threatCite({ source: t.source, page: t.page })}
            </option>
          ))}
        </select>
        {table?.gm && <pre className="text dim">{table.gm}</pre>}
        {table?.dice && (
          <TableRoll
            key={table.id}
            dice={table.dice}
            rolled={rolled}
            hits={rolled === null ? 0 : rowsFor(ranged(table), rolled).length}
            noun="row"
            onLand={land}
          />
        )}
        <div className="list" style={{ maxHeight: 360, overflowY: "auto" }}>
          {table?.rows.map((r) => (
            <button
              key={r.id}
              className={`btn sm ${r.id === rowId ? "primary" : ""}`}
              style={{ justifyContent: "flex-start", textAlign: "left", gap: 10 }}
              aria-pressed={r.id === rowId}
              onClick={() => pickRow(r.id)}
            >
              {range(r) && <b style={{ minWidth: 40 }}>{range(r)}</b>}
              <span style={{ flex: 1 }}>{r.name}</span>
              <span className="chip">{makes(r, catalogue)}</span>
            </button>
          ))}
        </div>
        {row && table && (
          <div className="panel pad stack" style={{ gap: 8 }}>
            <span className="label">
              {range(row) && `ROW ${range(row)} · `}
              {row.name.toUpperCase()} · {threatCite({ source: table.source, page: row.page })}
            </span>
            <pre className="text">{row.text}</pre>
            {row.gm && <div className="dim">GM: {row.gm}</div>}
            {pickItems.map((it, i) => (
              <Pick
                key={`${row.id}-${i}`}
                item={it}
                matches={wargear.filter((w) => wargearMatches(w, it.pick!, { tier, newTier: tier }))}
                value={picks[i] ?? ""}
                onChange={(id) => setPicks(Object.assign([...picks], { [i]: id }))}
              />
            ))}
            {faults && (
              <details>
                <summary className="dim" style={{ cursor: "pointer" }}>
                  {faults.name.toUpperCase()} (optional)
                </summary>
                <div className="keys">
                  {faults.rows.map((f) => (
                    <button
                      key={f.id}
                      className={`btn sm ${faultId === f.id ? "primary" : ""}`}
                      aria-pressed={faultId === f.id}
                      onClick={() => setFaultId(faultId === f.id ? null : f.id)}
                    >
                      {range(f)} {f.name}
                    </button>
                  ))}
                </div>
              </details>
            )}
            {award && award.length > 0 && <div className="accent">AWARD IN PARTY: {award.join(" · ")}</div>}
            {makes(row, catalogue) !== "AWARD" && (
              <button className="btn primary" disabled={picks.filter(Boolean).length < pickItems.length} onClick={make}>
                MAKE {makes(row, catalogue) === "PICK" ? "THE ITEMS" : makes(row, catalogue)}
              </button>
            )}
            {done && <div className="accent">{done}</div>}
          </div>
        )}
      </div>
    </details>
  );
}
