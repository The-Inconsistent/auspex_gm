"use client";
import { useState } from "react";

import { spendLabel, type LiveState } from "@wg/shared";

import { Refusal } from "@/components/ui/refusal/refusal";
import type { Send } from "@/hooks/use-table/use-table";

type SpendRequestsProps = { state: LiveState; send: Send };

// Spends the players asked for from their phones (rules-flow.md §11.120), on every tab so none waits behind one. ACCEPT
// is the spend itself, run by the server's own handlers; if it refuses (no Wrath, can't Seize now), the request stays
// and the reason shows here, so the GM can DENY it.
export function SpendRequests({ state, send }: SpendRequestsProps) {
  const [error, setError] = useState<string | null>(null);
  const names = new Map(state.characters.map((c) => [c.id, c.name]));

  const answer = async (id: string, accept: boolean) => {
    const r = await send({ type: "spend.resolve", id, accept });
    setError(r.ok ? null : r.error);
  };

  return (
    <>
      {state.spendRequests.length > 0 && (
        <section className="band" style={{ display: "grid", gap: 6, padding: "8px 12px" }} aria-label="Spend requests">
          {state.spendRequests.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="display" style={{ flex: 1, minWidth: 220 }}>
                {(names.get(r.characterId) ?? "AGENT").toUpperCase()} · {spendLabel(r.kind, r.amount)}
              </span>
              <button className="btn sm primary" onClick={() => answer(r.id, true)}>
                ACCEPT
              </button>
              <button className="btn sm danger" onClick={() => answer(r.id, false)}>
                DENY
              </button>
            </div>
          ))}
        </section>
      )}
      <Refusal error={error} onDismiss={() => setError(null)} />
    </>
  );
}
