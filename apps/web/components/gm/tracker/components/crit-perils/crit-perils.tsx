"use client";
import { useEffect, useRef, useState } from "react";

import {
  diceNeeded,
  diceRange,
  isD66,
  lookup,
  perilsRow,
  planApply,
  type Character,
  type CritRow,
  type Lookups,
  type LookupApply,
  type LookupTarget,
  type MutationTable,
  type PerilsRow,
  type Severity,
} from "@wg/shared";

import { MutationRoll } from "@/components/gm/party/components/mutation-roll/mutation-roll";
import type { Send } from "@/hooks/use-table/use-table";

import type { Run } from "../../types";

// Another panel (a psychic power's Perils) asks for PERILS with its extra 1s; a new `key` is a new request.
export type PerilsRequest = { table: "perils"; extraOnes: number; key: number };

type CritPerilsProps = {
  lookups: Lookups | null;
  // The selected combatant as the lookup acts on it (character id for an Agent, combatant id for a Threat), or null.
  target: (LookupTarget & { name: string }) | null;
  run: Run;
  send: Send; // for the Mutation roll a Perils row asks for (p.288)
  mutations: MutationTable[];
  character?: Character; // the selected Agent, whom that roll is for
  glory: number; // the campaign's Glory pool, the most a Glorious Critical can spend (p.197)
  request?: PerilsRequest;
};

type Table = keyof Lookups;
const TITLE: Record<Table, string> = { criticalHits: "CRITICAL HIT", perils: "PERILS" };

const KIND = { wounds: "Wounds", shock: "Shock", mortal: "Mortal Wounds", corruption: "Corruption" } as const;
const printed = (a: LookupApply) =>
  a.kind === "condition"
    ? a.condition
    : a.kind === "mutation"
      ? `roll on the ${a.severity} Mutations table`
      : `${"amount" in a ? a.amount : a.dice} ${KIND[a.kind]}`;
const printedAll = (list: LookupApply[]) => list.map(printed).join(" · ");

// CRIT / PERILS: the GM types the d66 rolled at the table; the app shows the printed row and applies only its
// mechanical part to the selected combatant through the existing actions. It never rolls (§11.125). A Glorious
// Critical spends Glory from the pool last (p.197), one step per Glory on a single-effect row (§11.156).
export function CritPerils({ lookups, target, run, send, mutations, character, glory, request }: CritPerilsProps) {
  const [table, setTable] = useState<Table>("criticalHits");
  const [d66, setD66] = useState("");
  const [ones, setOnes] = useState("0");
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [spent, setSpent] = useState(0);
  const [beat, setBeat] = useState(true); // a Critical Hit beats the target's Resilience (p.197)
  const [notices, setNotices] = useState<string[]>([]);
  const [refused, setRefused] = useState<string | null>(null);
  const [mutate, setMutate] = useState<{ id: string; severity: Severity } | null>(null);
  const [seenKey, setSeenKey] = useState(request?.key);
  const d66Ref = useRef<HTMLInputElement>(null);

  // A new table, d66 or count of 1s can land on another row: its dice and Glory need a fresh entry, never the last one.
  const pick = <T,>(set: (v: T) => void, v: T) => {
    set(v);
    setTyped({});
    setSpent(0);
    setNotices([]);
    setRefused(null);
    setMutate(null);
  };

  // After a step lands the whole entry goes, so the next APPLY can't send that step again.
  const clearEntry = () => {
    setD66("");
    setTyped({});
    setSpent(0);
    setBeat(true);
  };

  // A request from elsewhere switches to PERILS with its extra 1s, adjusted during render rather than in an effect.
  if (request && request.key !== seenKey) {
    setSeenKey(request.key);
    setTable(request.table);
    setOnes(String(request.extraOnes));
    setD66("");
    setTyped({});
    setSpent(0);
    setNotices([]);
    setRefused(null);
    setMutate(null);
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
  const inRange = (i: number) => {
    const { min, max } = diceRange(need[i]!);
    return Number.isInteger(amounts[i]) && amounts[i]! >= min && amounts[i]! <= max;
  };
  const crit = row && "glorious" in row ? (row as CritRow) : undefined;
  const resilience = table === "criticalHits"; // only a Critical Hit has a Resilience to beat
  const hitOnly = resilience && !beat;
  const g = crit?.glory;
  const maxSpend = Math.max(0, glory);
  const filled = hitOnly || need.every((_, i) => inRange(i));
  const plan =
    row && target
      ? planApply({ row, target, typed: amounts, glory: g ? { spent } : undefined, beatResilience: !hitOnly })
      : null;
  const mutation = !hitOnly ? row?.apply.find((a) => a.kind === "mutation") : undefined;

  const setSpend = (n: number) => setSpent(Math.min(maxSpend, Math.max(0, n)));

  // Stops at the first refusal and says why; steps that landed stay, and the entry is already cleared by then.
  const handleApply = async () => {
    if (!row || !target || !plan) return;
    const text = `${target.name.toUpperCase()} ${TITLE[table]} ${result}: ${row.name.toUpperCase()}`;
    const got: string[] = [];
    let landed = false;
    setRefused(null);
    for (const a of plan.actions) {
      const r = await run(a, text);
      if (!r.ok) {
        setRefused(r.error);
        setNotices(got);
        return;
      }
      got.push(...(r.notices ?? []));
      if (!landed) {
        landed = true;
        clearEntry();
      }
    }
    setNotices(got);
    if (mutation?.kind === "mutation" && target.kind === "pc")
      setMutate({ id: target.id, severity: mutation.severity });
    if (!landed) clearEntry();
  };

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="rule">CRIT / PERILS</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <div role="group" aria-label="Lookup table" style={{ display: "flex", gap: 6 }}>
          {(Object.keys(TITLE) as Table[]).map((t) => (
            <button
              key={t}
              className={`btn sm${t === table ? " primary" : ""}`}
              aria-pressed={t === table}
              onClick={() => pick(setTable, t)}
            >
              {TITLE[t]}
            </button>
          ))}
        </div>
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
        {resilience && (
          <button className="btn sm" aria-pressed={beat} onClick={() => setBeat(!beat)}>
            BEAT RESILIENCE: {beat ? "YES" : "NO"}
          </button>
        )}
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
          {hitOnly && <div className="dim">Didn&apos;t beat Resilience: 1 Wound, no other effects (p.197).</div>}
          {g && !hitOnly && (
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
            </div>
          )}
          {row.apply.length > 0 && !hitOnly && <div className="dim">APPLIES: {printedAll(row.apply)}</div>}
          {target?.kind === "threat" && !hitOnly && row.apply.some((a) => a.kind === "corruption") && (
            <div className="dim">Threats have no Corruption; APPLY skips it.</div>
          )}
          {!hitOnly &&
            plan?.notes.map((n) => (
              <div key={n} className="dim">
                {n}
              </div>
            ))}
          {!hitOnly &&
            need.map((dice, i) => {
              const { min, max } = diceRange(dice);
              const bad = typed[i] !== undefined && typed[i] !== "" && !inRange(i);
              return (
                <div key={i} className="stack" style={{ gap: 2 }}>
                  <input
                    className="input"
                    style={{ width: 140 }}
                    inputMode="numeric"
                    aria-label={`Rolled ${dice}`}
                    aria-invalid={bad}
                    placeholder={`ROLLED ${dice.toUpperCase()}`}
                    value={typed[i] ?? ""}
                    onChange={(e) => setTyped({ ...typed, [i]: e.target.value.replace(/\D/g, "") })}
                  />
                  {bad && (
                    <div className="red">
                      {dice} rolls {min}–{max}.
                    </div>
                  )}
                </div>
              );
            })}
          <div>
            <button
              className="btn primary"
              disabled={!target || !filled || (!hitOnly && row.apply.length === 0 && spent === 0)}
              onClick={handleApply}
            >
              APPLY{target ? ` → ${target.name.toUpperCase()}` : " (SELECT A COMBATANT)"}
            </button>
          </div>
        </div>
      )}
      {refused && <div className="red">! {refused}</div>}
      {notices.length > 0 && <div className="dim">{notices.join(" · ")}</div>}
      {mutate && character?.id === mutate.id && (
        <MutationRoll
          key={`${mutate.id}-${mutate.severity}`}
          character={character}
          tables={mutations}
          send={send}
          startAt={mutate.severity}
          onResult={(r, ok) => (r.ok ? setNotices([ok, ...(r.notices ?? [])]) : setRefused(r.error))}
        />
      )}
    </div>
  );
}
