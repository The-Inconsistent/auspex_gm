"use client";
import { useState } from "react";

import {
  applyActions,
  diceNeeded,
  isD66,
  lookup,
  perilsResult,
  type CritRow,
  type Lookups,
  type LookupApply,
  type LookupTarget,
  type PerilsRow,
} from "@wg/shared";

import type { Run } from "../../types";

type CritPerilsProps = {
  lookups: Lookups | null;
  // The selected combatant as the lookup acts on it (character id for an Agent, combatant id for a Threat), or null.
  target: (LookupTarget & { name: string }) | null;
  run: Run;
};

type Table = "criticalHits" | "perils";
const TITLE: Record<Table, string> = { criticalHits: "CRITICAL HIT", perils: "PERILS" };

const printed = (a: LookupApply) =>
  a.kind === "condition" ? a.condition : `${"amount" in a ? a.amount : a.dice} ${a.kind}`;

// CRIT / PERILS: the GM types the d66 rolled at the table; the app shows the printed row and applies only its
// mechanical part to the selected combatant through the existing actions. It never rolls (§11.122). Glorious
// Criticals show their text and price only: spending the Glory stays the GM's tap on the pool.
// ponytail: no Glory auto-spend, add a GLORIOUS apply once the column is transcribed.
export function CritPerils({ lookups, target, run }: CritPerilsProps) {
  const [table, setTable] = useState<Table>("criticalHits");
  const [d66, setD66] = useState("");
  const [ones, setOnes] = useState("0");
  const [typed, setTyped] = useState<Record<number, string>>({});

  // A new table, d66 or count of 1s can land on another row: its dice need a fresh roll, never the last one typed.
  const pick = <T,>(set: (v: T) => void, v: T) => {
    set(v);
    setTyped({});
  };

  if (!lookups) return null;
  const data = lookups[table];
  const roll = Number(d66);
  const valid = isD66(roll);
  const extra = table === "perils" ? Math.trunc(Number(ones) || 0) : 0;
  const result = table === "perils" ? perilsResult(roll, extra) : roll;
  const rows: (CritRow | PerilsRow)[] = valid ? lookup(data, result) : [];
  const row = rows[0];
  const need = row ? diceNeeded(row) : [];
  const amounts = need.map((_, i) => Number(typed[i]));
  const ready = need.every((_, i) => Number.isInteger(amounts[i]) && amounts[i]! > 0);

  const handleApply = async () => {
    if (!row || !target) return;
    for (const a of applyActions({ row, target, typed: amounts }))
      if (!(await run(a, `${target.name.toUpperCase()} ${TITLE[table]} ${result}: ${row.name.toUpperCase()}`)).ok)
        return;
  };

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="rule">CRIT / PERILS</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(Object.keys(TITLE) as Table[]).map((t) => (
          <button key={t} className="btn sm" aria-pressed={t === table} onClick={() => pick(setTable, t)}>
            {TITLE[t]}
          </button>
        ))}
        <input
          className="input"
          style={{ width: 80 }}
          inputMode="numeric"
          aria-label="d66 result"
          aria-invalid={d66 !== "" && !valid}
          placeholder="D66"
          maxLength={2}
          value={d66}
          onChange={(e) => pick(setD66, e.target.value.replace(/\D/g, ""))}
        />
        {table === "perils" && (
          <input
            className="input"
            style={{ width: 110 }}
            inputMode="numeric"
            aria-label="Extra Wrath Dice showing 1"
            placeholder="EXTRA 1s"
            maxLength={1}
            value={ones}
            onChange={(e) => pick(setOnes, e.target.value.replace(/\D/g, ""))}
          />
        )}
      </div>
      {d66 !== "" && !valid && <div className="red">A d66 reads two dice: both digits 1–6.</div>}
      {!data.rows.length && <div className="dim">Table not transcribed yet.</div>}
      {valid && data.rows.length > 0 && !row && <div className="dim">No row for {result}.</div>}
      {row && (
        <div className="stack" style={{ gap: 6 }}>
          <div>
            <b>{row.name}</b> <span className="dim">· {result}</span>
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{row.text}</div>
          {"glorious" in row && row.glorious && (
            <div>
              <span className="label">GLORIOUS</span> {row.glorious}
            </div>
          )}
          {row.apply.length > 0 && <div className="dim">APPLIES: {row.apply.map(printed).join(" · ")}</div>}
          {need.map((dice, i) => (
            <input
              key={i}
              className="input"
              style={{ width: 140 }}
              inputMode="numeric"
              aria-label={`Rolled ${dice}`}
              placeholder={`ROLLED ${dice.toUpperCase()}`}
              value={typed[i] ?? ""}
              onChange={(e) => setTyped({ ...typed, [i]: e.target.value.replace(/\D/g, "") })}
            />
          ))}
          <div>
            <button
              className="btn primary"
              disabled={!target || !ready || row.apply.length === 0}
              onClick={handleApply}
            >
              APPLY{target ? ` → ${target.name.toUpperCase()}` : " (SELECT A COMBATANT)"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
