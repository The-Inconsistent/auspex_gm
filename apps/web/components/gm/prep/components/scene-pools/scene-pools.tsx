"use client";
import { canSpend, poolMax, type ActionResult, type Pool } from "@wg/shared";

import { RuleIdLink } from "@/components/ui/rule-link/rule-link";
import type { Send } from "@/hooks/use-table/use-table";

import { POOL_RULES } from "../../constants";
import type { Beat } from "../../types";

type ScenePoolsProps = {
  beat: Pick<Beat, "ruin" | "glory" | "spends">;
  pools: Record<Pool, number>;
  players: number;
  send: Send;
  onReport: (r: ActionResult, ok: string) => void;
};

// A scene's Ruin and Glory on its PREP card (issue #40): a tap moves the pool. An award at the maximum is lost (Core
// pp.164, 320), and a spend the pool can't pay stays disabled, since the server would floor it at 0 and undercharge.
export function ScenePools({ beat, pools, players, send, onReport }: ScenePoolsProps) {
  const tap = async ({ pool, delta, what }: { pool: Pool; delta: number; what: string }) => {
    const lost = Math.max(0, pools[pool] + delta - poolMax(pool, players));
    const r = await send({ type: "pool.adjust", pool, delta });
    const sign = delta > 0 ? "+" : "−";
    onReport(
      r,
      `${sign}${Math.abs(delta)} ${pool.toUpperCase()} · ${what.toUpperCase()}${lost ? ` · ${lost} LOST AT MAXIMUM` : ""}`,
    );
  };

  const earned = (pool: Pool) =>
    beat[pool].length > 0 && (
      <>
        <span className="label">{pool.toUpperCase()}</span>
        {beat[pool].map((l, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <b>+{l.amount}</b>
            <span style={{ flex: 1 }}>{l.text}</span>
            <button className="btn sm" onClick={() => tap({ pool, delta: l.amount, what: l.text })}>
              +{l.amount} {pool.toUpperCase()}
            </button>
          </div>
        ))}
      </>
    );

  return (
    <div className="field">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span className="label" style={{ flex: 1 }}>
          RUIN & GLORY
        </span>
        {POOL_RULES.map(([id, label]) => (
          <RuleIdLink key={id} id={id}>
            <span className="chip">{label}</span>
          </RuleIdLink>
        ))}
      </div>
      {earned("ruin")}
      {earned("glory")}
      {beat.spends.length > 0 && <span className="label">SPENDS</span>}
      {beat.spends.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className={`chip ${s.pool === "ruin" ? "warn" : ""}`}>
            {s.pool.toUpperCase()} {s.cost}
          </span>
          <span style={{ flex: 1 }}>
            <b>{s.name}</b>
            {s.text && <span className="dim">: {s.text}</span>}
          </span>
          <button
            className="btn sm"
            disabled={!canSpend(pools, s)}
            onClick={() => tap({ pool: s.pool, delta: -s.cost, what: s.name })}
          >
            SPEND {s.cost} {s.pool.toUpperCase()}
          </button>
        </div>
      ))}
    </div>
  );
}
