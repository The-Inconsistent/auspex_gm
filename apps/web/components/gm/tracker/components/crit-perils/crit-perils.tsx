"use client";
import { useEffect, useRef, useState } from "react";

import {
  applyActions,
  diceNeeded,
  isD66,
  lookup,
  perilsRow,
  type CritRow,
  type Lookups,
  type LookupApply,
  type LookupTarget,
  type PerilsRow,
} from "@wg/shared";

import type { Run } from "../../types";

// Another panel (a psychic power's Perils) asks for PERILS with its extra 1s; a new `key` is a new request.
export type PerilsRequest = { table: "perils"; extraOnes: number; key: number };

type CritPerilsProps = {
  lookups: Lookups | null;
  // The selected combatant as the lookup acts on it (character id for an Agent, combatant id for a Threat), or null.
  target: (LookupTarget & { name: string }) | null;
  run: Run;
  glory: number; // the campaign's Glory pool, the most a Glorious Critical can spend (p.197)
  request?: PerilsRequest;
};

type Table = "criticalHits" | "perils";
const TITLE: Record<Table, string> = { criticalHits: "CRITICAL HIT", perils: "PERILS" };

const KIND = { wounds: "Wounds", shock: "Shock", mortal: "Mortal Wounds", corruption: "Corruption" } as const;
const printed = (a: LookupApply) =>
  a.kind === "condition" ? a.condition : `${"amount" in a ? a.amount : a.dice} ${KIND[a.kind]}`;
const printedAll = (list: LookupApply[]) => list.map(printed).join(" · ");

// CRIT / PERILS: the GM types the d66 rolled at the table; the app shows the printed row and applies only its
// mechanical part to the selected combatant through the existing actions. It never rolls (§11.125). A Glorious
// Critical spends Glory from the pool first (p.197), one step per Glory with a pick when the row offers a choice (§11.156).
export function CritPerils({ lookups, target, run, glory, request }: CritPerilsProps) {
  const [table, setTable] = useState<Table>("criticalHits");
  const [d66, setD66] = useState("");
  const [ones, setOnes] = useState("0");
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [spent, setSpent] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const [seenKey, setSeenKey] = useState(request?.key);
  const d66Ref = useRef<HTMLInputElement>(null);

  // A new table, d66 or count of 1s can land on another row: its dice and Glory need a fresh entry, never the last one.
  const pick = <T,>(set: (v: T) => void, v: T) => {
    set(v);
    setTyped({});
    setSpent(0);
    setPicks([]);
  };

  // A request from elsewhere switches to PERILS with its extra 1s, adjusted during render rather than in an effect.
  if (request && request.key !== seenKey) {
    setSeenKey(request.key);
    setTable(request.table);
    setOnes(String(request.extraOnes));
    setD66("");
    setTyped({});
    setSpent(0);
    setPicks([]);
  }
  useEffect(() => {
    if (request) d66Ref.current?.focus();
  }, [request?.key]); // eslint-disable-line react-hooks/exhaustive-deps -- only a new request refocuses

  if (!lookups) return null;
  const data = lookups[table];
  const roll = Number(d66);
  const valid = isD66(roll);
  const extra = table === "perils" ? Math.trunc(Number(ones) || 0) : 0;
  const found = table === "perils" ? perilsRow(lookups.perils, roll, extra) : null;
  const result = found ? found.result : roll;
  const row: CritRow | PerilsRow | undefined = !valid
    ? undefined
    : found
      ? (found.row ?? undefined)
      : lookup(lookups.criticalHits, result)[0];
  const top = lookups.perils.rows.reduce((m, r) => Math.max(m, r.to ?? 0), 0);
  const capped = table === "perils" && valid && result > top && top > 0;
  const need = row ? diceNeeded(row) : [];
  const amounts = need.map((_, i) => Number(typed[i]));
  const ready = need.every((_, i) => Number.isInteger(amounts[i]) && amounts[i]! > 0);
  const crit = row && "glorious" in row ? (row as CritRow) : undefined;
  const g = crit?.glory;
  const maxSpend = Math.max(0, glory);

  const setSpend = (n: number) => {
    const next = Math.min(maxSpend, Math.max(0, n));
    setSpent(next);
    setPicks((p) => Array.from({ length: next }, (_, i) => p[i] ?? 0));
  };

  const handleApply = async () => {
    if (!row || !target) return;
    const steps = applyActions({
      row,
      target,
      typed: amounts,
      glory: g ? { spent, picks: Array.from({ length: spent }, (_, i) => picks[i] ?? 0) } : undefined,
    });
    for (const a of steps)
      if (!(await run(a, `${target.name.toUpperCase()} ${TITLE[table]} ${result}: ${row.name.toUpperCase()}`)).ok)
        return;
    setSpent(0);
    setPicks([]);
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
          ref={d66Ref}
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
          {capped && <div className="dim">above {top}: top row (§11.155)</div>}
          <div style={{ whiteSpace: "pre-wrap" }}>{row.text}</div>
          {crit?.glorious && (
            <div>
              <span className="label">GLORIOUS</span> {crit.glorious}
            </div>
          )}
          {g && (
            <div className="stack" style={{ gap: 6 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span className="label">GLORY SPENT</span>
                <button
                  className="btn sm"
                  aria-label="Spend less Glory"
                  disabled={spent <= 0}
                  onClick={() => setSpend(spent - 1)}
                >
                  −
                </button>
                <b>{spent}</b>
                <button
                  className="btn sm"
                  aria-label="Spend more Glory"
                  disabled={spent >= maxSpend}
                  onClick={() => setSpend(spent + 1)}
                >
                  +
                </button>
                <span className="dim">of {maxSpend} in the pool</span>
              </div>
              {(g.first?.length || g.each.length) > 0 && (
                <div className="dim">
                  PER GLORY:{" "}
                  {[g.first?.length ? `first: ${printedAll(g.first)}` : "", printedAll(g.each)]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
              {g.choose &&
                Array.from({ length: spent }, (_, i) => (
                  <select
                    key={i}
                    className="input"
                    aria-label={`Glory ${i + 1} effect`}
                    value={picks[i] ?? 0}
                    onChange={(e) => setPicks((p) => p.map((v, j) => (j === i ? Number(e.target.value) : v)))}
                  >
                    {g.choose!.map((o, k) => (
                      <option key={k} value={k}>
                        {`GLORY ${i + 1}: ${o.label}${o.apply.length ? ` (${printedAll(o.apply)})` : ""}`}
                      </option>
                    ))}
                  </select>
                ))}
            </div>
          )}
          {row.apply.length > 0 && <div className="dim">APPLIES: {printedAll(row.apply)}</div>}
          {target?.kind === "threat" && row.apply.some((a) => a.kind === "corruption") && (
            <div className="dim">Threats have no Corruption; APPLY skips it.</div>
          )}
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
              disabled={!target || !ready || (row.apply.length === 0 && spent === 0)}
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
