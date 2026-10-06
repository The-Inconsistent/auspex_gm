"use client";
import { useState } from "react";

import {
  MAX_SPEND_AMOUNT,
  SPEND_KINDS,
  spendLabel,
  spendTakesAmount,
  spendWord,
  type LiveState,
  type SpendKind,
} from "@wg/shared";

import { Refusal } from "@/components/ui/refusal/refusal";
import type { Send } from "@/hooks/use-table/use-table";

type RequestSpendProps = { state: LiveState; characterId: string; send: Send };

// Ask the GM to spend a Wrath or Glory for you (rules-flow.md §11.122). Nothing is spent until the GM accepts. Everyone
// at the table sees what is pending: Glory is the party's pool, and p.165 has the group agree on it.
export function RequestSpend({ state, characterId, send }: RequestSpendProps) {
  const [amount, setAmount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const names = new Map(state.characters.map((c) => [c.id, c.name]));
  const mine = state.spendRequests.filter((r) => r.characterId === characterId);
  const others = state.spendRequests.filter((r) => r.characterId !== characterId);
  const fighting = !!state.encounter;

  const run = async (a: Parameters<Send>[0]) => {
    const r = await send(a);
    setError(r.ok ? null : r.error);
  };

  return (
    <section className="panel" style={{ display: "grid", gap: 8, padding: 10 }} aria-label="Request a spend">
      <div className="label">REQUEST A SPEND · THE GM ANSWERS</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span className="label">GLORY +N</span>
        <button className="btn sm sq" aria-label="Fewer" onClick={() => setAmount((n) => Math.max(1, n - 1))}>
          −
        </button>
        <span className="display">{amount}</span>
        <button
          className="btn sm sq"
          aria-label="More"
          onClick={() => setAmount((n) => Math.min(MAX_SPEND_AMOUNT, n + 1))}
        >
          +
        </button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {SPEND_KINDS.filter((k) => k !== "seize" || fighting).map((kind: SpendKind) => (
          <button
            key={kind}
            className="btn sm"
            disabled={mine.some((r) => r.kind === kind)}
            onClick={() => run({ type: "spend.request", characterId, kind, amount })}
          >
            {spendWord(kind)}
            {spendTakesAmount(kind) ? ` +${amount}` : ""}
          </button>
        ))}
      </div>
      {mine.map((r) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1 }}>{spendLabel(r.kind, r.amount)} · WAITING</span>
          <button className="btn sm" onClick={() => run({ type: "spend.cancel", id: r.id })}>
            CANCEL
          </button>
        </div>
      ))}
      {others.map((r) => (
        <div key={r.id} className="label">
          {(names.get(r.characterId) ?? "AGENT").toUpperCase()} ASKS · {spendLabel(r.kind, r.amount)}
        </div>
      ))}
      <Refusal error={error} onDismiss={() => setError(null)} />
    </section>
  );
}
