"use client";
import { useRef, useState, type ReactNode } from "react";

import {
  MAX_SPEND_AMOUNT,
  SPEND_KINDS,
  spendCost,
  spendLabel,
  spendTakesAmount,
  spendWord,
  type LiveState,
  type SpendKind,
} from "@wg/shared";

import { Refusal } from "@/components/ui/refusal/refusal";
import type { Send } from "@/hooks/use-table/use-table";

type SpendProps = { state: LiveState; characterId: string; send: Send };
// "wrath" or "glory": the two pools a spend costs (spendCost).
type RequestSpendProps = SpendProps & {
  pool: keyof ReturnType<typeof spendCost>;
  // The button that opens the modal: a whole vitals cell on the strip, a big FIGHT button. Default: "SPEND WRATH".
  label?: ReactNode;
  className?: string;
};

// Ask the GM to spend a Wrath or Glory for you (rules-flow.md §11.122). Nothing is spent until the GM accepts. The
// button (a pool's cell on the player's vitals strip, FIGHT's SPEND, the GM's long sheet) opens a modal <dialog>
// (Escape, focus trap, backdrop, as Legend does).
// An empty pool can't be asked for, and Glory never more than the party holds; the api checks both again.
export function RequestSpend({ pool, state, characterId, send, label, className = "btn sm" }: RequestSpendProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [amount, setAmount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const me = state.characters.find((c) => c.id === characterId);
  const have = pool === "glory" ? state.campaign.glory : (me?.wrath ?? 0);
  const max = Math.min(MAX_SPEND_AMOUNT, have);
  const shown = Math.max(1, Math.min(amount, max)); // the pool may drop while the modal is open
  const mine = state.spendRequests.filter((r) => r.characterId === characterId);
  const kinds = SPEND_KINDS.filter((k) => spendCost(k)[pool] > 0 && (k !== "seize" || !!state.encounter));
  const word = pool.toUpperCase();

  const ask = async (kind: SpendKind) => {
    const r = await send({ type: "spend.request", characterId, kind, amount: shown });
    setError(r.ok ? null : r.error);
    if (r.ok) ref.current?.close();
  };

  return (
    <>
      <button
        className={className}
        disabled={have < 1}
        aria-label={label ? `Spend ${word}: ask the GM, ${have} held` : undefined}
        onClick={() => ref.current?.showModal()}
      >
        {label ?? `SPEND ${word}`}
      </button>
      <dialog
        ref={ref}
        className="spend"
        aria-label={`Ask the GM to spend ${word}`}
        onClose={() => setError(null)}
        // A click on the dialog element itself, not its content, is a click on the backdrop.
        onClick={(e) => e.target === ref.current && ref.current.close()}
      >
        <div className="sb-title">
          <span>SPEND {word} · THE GM ANSWERS</span>
          <button className="btn sm" onClick={() => ref.current?.close()}>
            CLOSE
          </button>
        </div>
        <div className="stack" style={{ gap: 10, padding: 10 }}>
          <div className="label">
            {pool === "glory" ? "PARTY GLORY" : "YOUR WRATH"}: {have}
          </div>
          {kinds.some(spendTakesAmount) && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="label">GLORY +N</span>
              <button
                className="btn sm sq"
                aria-label="Fewer Glory"
                onClick={() => setAmount((n) => Math.max(1, Math.min(n, max) - 1))}
              >
                −
              </button>
              <span className="display">{shown}</span>
              <button
                className="btn sm sq"
                aria-label="More Glory"
                onClick={() => setAmount((n) => Math.min(max, n + 1))}
              >
                +
              </button>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {kinds.map((kind) => (
              <button
                key={kind}
                className="btn sm"
                disabled={have < 1 || mine.some((r) => r.kind === kind)}
                onClick={() => ask(kind)}
              >
                {spendWord(kind)}
                {spendTakesAmount(kind) ? ` +${shown}` : ""}
              </button>
            ))}
          </div>
          <Refusal error={error} onDismiss={() => setError(null)} />
        </div>
      </dialog>
    </>
  );
}

// Every pending request, on every tab of the player's phone (and under the long sheet's pools). Everyone at the table sees them: Glory is the party's pool, and p.165
// has the group agree on it (§11.123). Only the asker may cancel.
export function PendingSpends({ state, characterId, send }: SpendProps) {
  const [error, setError] = useState<string | null>(null);
  if (state.spendRequests.length === 0 && !error) return null; // a failed CANCEL still shows why
  const names = new Map(state.characters.map((c) => [c.id, c.name]));

  const cancel = async (id: string) => {
    const r = await send({ type: "spend.cancel", id });
    setError(r.ok ? null : r.error);
  };

  return (
    <section className="stack" style={{ gap: 6 }} aria-label="Pending spend requests">
      {state.spendRequests.map((r) =>
        r.characterId === characterId ? (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1 }}>{spendLabel(r.kind, r.amount)} · WAITING</span>
            <button className="btn sm" onClick={() => cancel(r.id)}>
              CANCEL
            </button>
          </div>
        ) : (
          <div key={r.id} className="label">
            {(names.get(r.characterId) ?? "AGENT").toUpperCase()} ASKS · {spendLabel(r.kind, r.amount)}
          </div>
        ),
      )}
      <Refusal error={error} onDismiss={() => setError(null)} />
    </section>
  );
}
