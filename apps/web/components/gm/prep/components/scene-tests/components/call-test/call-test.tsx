"use client";
import { useState, type ChangeEvent } from "react";

import type { ActionResult, BeatTest, Character } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

import { ALL } from "./constants";

type CallTestProps = {
  test: BeatTest;
  agents: Character[]; // the Agents holding a seat, whose phones can answer
  send: Send;
  onReport: (r: ActionResult, ok: string) => void;
};

// CALL a planned Test to the phones (issue #191): every Agent for an ALL Test, one for the rest. FEAR is the GM's tick:
// a Resolve Test may be Terror, which p.320 gives no Ruin for (Core p.199). Only what it rolls is sent: the purpose, Shifts and outcomes stay the GM's (rules-flow.md §11.143).
export function CallTest({ test, agents, send, onReport }: CallTestProps) {
  const [who, setWho] = useState(test.who === "each" ? ALL : (agents[0]?.id ?? ALL));
  const [fear, setFear] = useState(false);

  // CALL: replaces any open call.
  const handleCall = async () => {
    // One Agent picked before they left their seat is everyone again.
    const one = agents.find((c) => c.id === who);
    const ids = one ? [one.id] : agents.map((c) => c.id);
    onReport(await send({ type: "test.call", test, who: ids, fear }), "CALLED");
  };

  // WHO: everyone, or one Agent.
  const handleWho = (e: ChangeEvent<HTMLSelectElement>) => setWho(e.target.value);

  if (!agents.length) return null;
  return (
    <div className="keys" style={{ alignItems: "center" }}>
      <select
        className="btn sm"
        aria-label="Who rolls"
        value={agents.some((c) => c.id === who) ? who : ALL}
        onChange={handleWho}
      >
        <option value={ALL}>ALL AGENTS</option>
        {agents.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {test.kind === "resolve" && (
        <label>
          <input type="checkbox" checked={fear} onChange={(e) => setFear(e.target.checked)} /> FEAR
        </label>
      )}
      <button className="btn sm primary" onClick={handleCall}>
        CALL TO THE PHONES
      </button>
    </div>
  );
}
