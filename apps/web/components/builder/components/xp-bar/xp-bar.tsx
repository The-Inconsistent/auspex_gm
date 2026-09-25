"use client";
import { startingXp } from "@wg/shared";

import { useBuilder } from "../../builder-context";

// Phones: the budget, what's spent and what's left, always in view at the bottom; once the character is made, of the XP
// earned in play. Tablets see the side ledger instead.
export function XpBar() {
  const { resolved, tier, go, made } = useBuilder();
  const adv = made ? resolved?.advancement : null;
  const budget = adv?.budget ?? resolved?.budget ?? startingXp(tier);
  const spent = adv?.spent ?? resolved?.spent ?? 0;
  const over = spent > budget;
  const blocking = (resolved?.pending.length ?? 0) + (resolved?.problems.length ?? 0);
  return (
    <div className="band bld-xpbar">
      <div className="bld-fig">
        <span className="label">{adv ? `EARNED · R${adv.rank}` : "BUDGET"}</span>
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
