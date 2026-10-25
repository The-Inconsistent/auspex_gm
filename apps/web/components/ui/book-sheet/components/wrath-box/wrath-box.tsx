"use client";
import { rankOf, restoreShockAmount, type Character, type LiveState } from "@wg/shared";

import { RequestSpend } from "@/components/ui/request-spend/request-spend";
import { Term } from "@/components/ui/term/term";
import type { Send } from "@/hooks/use-table/use-table";

import { BookBox } from "../book-box/book-box";

type WrathBoxProps = { me: Character; state: LiveState; send: Send; asks: boolean };

// WRATH as the book's sheet has it (Core p.40): the points, then USES FOR WRATH in our own words (Core p.164). On the
// player's own phone (`asks`) SPEND WRATH asks the GM, as the vitals strip does (§11.122); the GM spends from PARTY.
export function WrathBox({ me, state, send, asks }: WrathBoxProps) {
  const shock = restoreShockAmount({ rank: rankOf(me.xp), tier: state.campaign.tier });
  return (
    <BookBox title="WRATH" id="ps-wrath" label="Wrath">
      <div className="bs-wrath">
        <span className="bs-wrath-v mono">{me.wrath}</span>
        <span className="bs-cap">
          <Term k="wrath">Yours alone.</Term> Back to 2 when a session starts.
        </span>
        {asks && <RequestSpend pool="wrath" state={state} characterId={me.id} send={send} className="btn primary" />}
      </div>
      <div className="bs-uses">
        <b>USES FOR WRATH</b>
        <ul>
          <li>Re-roll every failed die on one Test.</li>
          <li>Declare a small truth about the scene.</li>
          <li>
            As an action, recover <span className="mono">{shock}</span> Shock (Rank + Tier).
          </li>
        </ul>
      </div>
      <span className="bs-cap bs-cap-end">Core p.164</span>
    </BookBox>
  );
}
