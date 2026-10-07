"use client";
import { useState } from "react";

import {
  mutationRow,
  severityFor,
  type ActionResult,
  type Character,
  type MutationTable,
  type Severity,
} from "@wg/shared";

import { TableRoll } from "@/components/ui/table-roll/table-roll";
import type { Send } from "@/hooks/use-table/use-table";

type MutationRollProps = {
  character: Character;
  tables: MutationTable[];
  send: Send;
  onResult: (r: ActionResult, ok: string) => void;
};

// After a failed Mutation Test (Core p.287): the severity d6, the d66 on that table with +10 per mutation held, on to the
// next table where the top row says so (§11.136), the mutation's own d6 table if it has one, then ADD. ROLL or I ROLLED
// at every step; the Mutation Test itself stays physical dice. CUT OFF removes one: Corruption stays (p.287).
export function MutationRoll({ character: c, tables, send, onResult }: MutationRollProps) {
  const [severity, setSeverity] = useState<number | null>(null);
  const [on, setOn] = useState<Severity | null>(null); // the table rolled on now
  const [d66, setD66] = useState<number | null>(null);
  const [subRoll, setSubRoll] = useState<number | null>(null);
  const held = c.stats.mutations;
  const table = tables.find((t) => t.severity === on);
  const row = table && d66 !== null ? mutationRow(table, d66, held.length) : null;
  const mutation = row && !("forward" in row) ? row : null;
  const duplicate = mutation && held.some((m) => m.id === mutation.id);
  const sub = mutation?.sub?.rows.find((r) => subRoll !== null && r.from <= subRoll && subRoll <= r.to);
  const ready = mutation && !duplicate && (!mutation.sub || sub);

  const handleSeverity = (n: number) => {
    setSeverity(n);
    setOn(severityFor(n));
    setD66(null);
    setSubRoll(null);
  };
  const handleD66 = (n: number) => {
    setD66(n);
    setSubRoll(null);
  };
  // The top row sends the roll on: a new d66 on that table.
  const handleForward = (to: Severity) => {
    setOn(to);
    setD66(null);
  };

  const handleAdd = async () => {
    if (!mutation) return;
    const r = await send({ type: "character.mutate", id: c.id, mutationId: mutation.id, subId: sub?.id });
    onResult(r, `${c.name.toUpperCase()} · ${mutation.name.toUpperCase()}${sub ? `: ${sub.name.toUpperCase()}` : ""}`);
    if (!r.ok) return;
    // A fresh roll from the severity, for the next one (The Warp Made Manifest's "roll 2 additional mutations").
    setSeverity(null);
    setOn(null);
    setD66(null);
  };

  const handleCut = async (id: string, name: string) =>
    onResult(await send({ type: "character.unmutate", id: c.id, mutationId: id }), `${name.toUpperCase()} CUT OFF`);

  if (!tables.length) return <div className="dim">The Mutation tables didn&apos;t load.</div>;
  return (
    <div className="stack" style={{ gap: 6 }}>
      {held.map((m) => (
        <div key={m.id} className="keys" style={{ alignItems: "center" }}>
          <span>
            {m.name} <span className="dim">(Core p.{m.page})</span>
          </span>
          <button className="btn sm" onClick={() => handleCut(m.id, m.name)}>
            CUT OFF
          </button>
        </div>
      ))}
      <span className="label">SEVERITY (1–2 SUBTLE · 3–4 MINOR · 5–6 SEVERE, p.287)</span>
      {/* Keyed on the count held, so an ADD clears the typed roll for the next one. */}
      <TableRoll key={held.length} dice="d6" rolled={severity} hits={1} noun="severity" onLand={handleSeverity} />
      {table && (
        <>
          <span className="label">
            {table.name.toUpperCase()}
            {held.length > 0 && ` · +${10 * held.length} FOR ${held.length} HELD`}
          </span>
          <TableRoll
            key={`${severity}-${table.severity}`}
            dice="d66"
            rolled={d66}
            hits={1}
            noun="mutation"
            onLand={handleD66}
          />
        </>
      )}
      {row && "forward" in row && (
        <button className="btn sm primary" onClick={() => handleForward(row.forward)}>
          {row.text.toUpperCase()}
        </button>
      )}
      {duplicate && <span className="red">{mutation.name.toUpperCase()} IS HELD · REROLL ON THIS TABLE (p.287)</span>}
      {mutation?.sub && !duplicate && (
        <>
          <span className="label">{mutation.sub.name.toUpperCase()}</span>
          <TableRoll key={mutation.id} dice="d6" rolled={subRoll} hits={sub ? 1 : 0} noun="row" onLand={setSubRoll} />
        </>
      )}
      {ready && (
        <div className="stack" style={{ gap: 2 }}>
          <b>
            {mutation.name.toUpperCase()}
            {sub && `: ${sub.name.toUpperCase()}`} <span className="dim">(Core p.{mutation.page})</span>
          </b>
          <div style={{ whiteSpace: "pre-line" }}>
            {[mutation.effect || mutation.text, sub && (sub.effect || sub.text)].filter(Boolean).join("\n\n")}
          </div>
          {mutation.gm && <div className="dim">{mutation.gm}</div>}
          <button className="btn sm primary" style={{ alignSelf: "flex-start" }} onClick={handleAdd}>
            ADD {mutation.name.toUpperCase()}
          </button>
        </div>
      )}
    </div>
  );
}
