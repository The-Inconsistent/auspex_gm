"use client";
import { useState } from "react";

import type { LiveState } from "@wg/shared";

import { Refusal } from "@/components/ui/refusal/refusal";
import type { Send } from "@/hooks/use-table/use-table";

type AmbushedProps = { state: LiveState; characterId: string; send: Send };

// AMBUSHED (Core pp.176–177): no Turn in Round 1, unless the party pays 1 Glory. The ask goes to the GM like any spend
// (§11.122); ACCEPT is the tracker's own AWARE, so TURN BACK refunds it (§11.177). A pending ask is cancelled from the
// pending list every tab shows.
export function Ambushed({ state, characterId, send }: AmbushedProps) {
  const [error, setError] = useState<string | null>(null);
  const asked = state.spendRequests.some((r) => r.characterId === characterId && r.kind === "aware");
  const glory = state.campaign.glory;
  const ask = async () => {
    const r = await send({ type: "spend.request", characterId, kind: "aware" });
    setError(r.ok ? null : r.error);
  };
  return (
    <section className="pf-sec" aria-label="Ambushed">
      <div className="pf-h">
        <h2>AMBUSHED</h2>
        <i />
        <span className="mono">NO TURN IN ROUND 1</span>
      </div>
      <ul className="pf-steps pf-plain">
        <li>
          <b>BE AWARE · 1 GLORY</b>
          <span>The party pays 1 Glory and you take your Turn in Round 1 as normal (p.177).</span>
          <button type="button" className="btn pf-aware" disabled={asked || glory < 1} onClick={ask}>
            {asked
              ? "ASKED · WAITING FOR THE GM"
              : glory < 1
                ? "THE PARTY HOLDS NO GLORY"
                : "ASK THE GM: AWARE · 1 GLORY"}
          </button>
          <Refusal error={error} onDismiss={() => setError(null)} />
        </li>
        {state.encounter?.round === 0 && (
          <li>
            <b>SAY WHERE YOU STAND</b>
            <span>The GM sets the scene before Round 1: where you are, what you see (p.176).</span>
          </li>
        )}
        <li>
          <b>ROUND 1 WITHOUT YOU</b>
          <span>Everyone who isn&apos;t ambushed takes a Turn; you act from Round 2 (p.177).</span>
        </li>
      </ul>
    </section>
  );
}
