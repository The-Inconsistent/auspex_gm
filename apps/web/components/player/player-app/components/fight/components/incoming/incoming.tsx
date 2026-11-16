"use client";
import { deriveStats, isExhausted, type Character, type LiveState, type ThreatCombatant } from "@wg/shared";

import { Term } from "@/components/ui/term/term";

type IncomingProps = {
  me: Character;
  state: LiveState;
  attacker: ThreatCombatant | null; // null while an unseen threat acts (§11.56)
  held: boolean; // this Agent holds its action (p.187)
};

// INCOMING (rules-flow §11.175): on every Threat's Turn each Agent's phone says what a hit on them comes down to, from
// their own sheet. The GM selects nothing; the dice stay the GM's.
export function Incoming({ me, state, attacker, held }: IncomingProps) {
  const d = deriveStats({ stats: me.stats, overrides: me.overrides, tier: state.campaign.tier });
  const exhausted = isExhausted({ shock: me.shock, maxShock: d.maxShock, conditions: me.conditions });
  // Only when its stat block is shown: a bars-only threat's class is the GM's to keep (§11.56).
  const troop = !!attacker?.stats && attacker.threatClass === "T";
  return (
    <section className="pf-sec" aria-label="Incoming">
      <div className="pf-h">
        <h2>INCOMING</h2>
        <i />
        <span className="mono">{attacker ? attacker.label.toUpperCase() : "UNSEEN"}</span>
      </div>
      <div className="pf-tiles">
        <div className="pf-tile slate-card cut">
          <span className="label">YOUR DEFENCE</span>
          <b className="mono">{d.defence}</b>
          <span>The Icons it needs to hit you, before the cover the GM calls (p.182).</span>
        </div>
        <div className="pf-tile slate-card cut">
          <span className="label">RESILIENCE</span>
          <b className="mono">{d.resilience}</b>
          <span>Its damage over this, after its AP: Wounds. Equal: 1 Shock (p.192).</span>
        </div>
      </div>
      <ol className="pf-steps pf-plain" aria-label="If it hits you">
        <li>
          {exhausted ? (
            <>
              <b>NO DETERMINATION</b>
              <span>You&rsquo;re Exhausted: you can&rsquo;t roll it (p.199).</span>
            </>
          ) : (
            <>
              <b>DETERMINATION · {d.determination} DICE</b>
              <span>
                Your Toughness. Each Icon turns 1 Wound into Shock; the phone asks when you take Wounds (p.196).
              </span>
            </>
          )}
        </li>
        {troop && (
          <li>
            <b>NO CRITICAL FROM IT</b>
            <span>
              A Troop can&rsquo;t land a <Term k="critical">Critical Hit</Term> on you (p.323).
            </span>
          </li>
        )}
        {held && (
          <li>
            <b>YOU HOLD YOUR ACTION</b>
            <span>
              Use it any time this Round. To cut into this Turn, say so: an opposed Initiative Test (pp.177–178, 187).
            </span>
          </li>
        )}
      </ol>
    </section>
  );
}
