"use client";
import { startingXp } from "@wg/shared";

import { useBuilder } from "../../builder-context";

// Phones: the budget, what's spent and what's left, always in view at the bottom. Tablets see the side ledger instead.
export function XpBar() {
  const { resolved, tier, go } = useBuilder();
  const budget = resolved?.budget ?? startingXp(tier);
  const spent = resolved?.spent ?? 0;
  const over = spent > budget;
  const blocking = (resolved?.pending.length ?? 0) + (resolved?.problems.length ?? 0);
  return (
    <div className="band bld-xpbar">
      <div className="bld-fig">
        <span className="label">BUDGET</span>
        <b>{budget}</b>
      </div>
      <div className="bld-fig">
        <span className="label">SPENT</span>
        <b>{spent}</b>
      </div>
      <div className={`bld-fig ${over ? "over" : ""}`}>
        <span className="label">{over ? "OVER" : "LEFT"}</span>
        <b>{Math.abs(budget - spent)}</b>
      </div>
      <span style={{ flex: 1 }} />
      <button className="btn sm" onClick={() => go("review")}>
        {blocking ? `REVIEW · ${blocking} LEFT` : "REVIEW"}
      </button>
    </div>
  );
}
