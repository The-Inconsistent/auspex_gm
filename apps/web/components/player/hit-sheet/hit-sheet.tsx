"use client";
import { useEffect, useState } from "react";

import { deriveStats, isExhausted, type Character, type LiveState } from "@wg/shared";

import { TURN_VIBRATION } from "@/components/player/player-app/constants";
import { Refusal } from "@/components/ui/refusal/refusal";
import { RuleLink } from "@/components/ui/rule-link/rule-link";
import type { Send } from "@/hooks/use-table/use-table";

type HitSheetProps = { me: Character; state: LiveState; send: Send };
type Hit = { from: number; to: number };

const MAX_CHIPS = 10;

// YOU'RE HIT: when this Agent's Wounds go up during a fight, a bottom sheet (the called Test's pattern) says what to roll.
// Determination (Core p.196): roll Toughness dice, each Icon turns 1 Wound into 1 Shock, never against Mortal Wounds
// (p.193). The phone only reports the Icons; the GM accepts it from SPEND ASKED (§11.172). The previous Wounds are kept
// in state and compared during render, so the first render and any decrease (healing, GM edits) open nothing. A second
// hit while it's open adds to it; TURN BACK below the first hit, or the fight ending, closes it.
export function HitSheet({ me, state, send }: HitSheetProps) {
  const [prev, setPrev] = useState(me.wounds);
  const [hit, setHit] = useState<Hit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fighting = !!state.encounter;
  if (me.wounds !== prev) {
    setPrev(me.wounds);
    if (me.wounds > prev && fighting) {
      setHit({ from: hit?.from ?? prev, to: me.wounds });
      setError(null);
    } else if (hit) setHit(me.wounds <= hit.from ? null : { ...hit, to: me.wounds });
  }
  if (hit && !fighting) setHit(null);

  // External system: the device vibration motor. Buzz once for each hit as it opens.
  const opened = hit ? `${hit.from}-${hit.to}` : null;
  useEffect(() => {
    if (opened) navigator.vibrate?.(TURN_VIBRATION);
  }, [opened]);

  if (!hit || !fighting) return null;
  const d = deriveStats({ stats: me.stats, overrides: me.overrides, tier: state.campaign.tier });
  const exhausted = isExhausted({ shock: me.shock, maxShock: d.maxShock, conditions: me.conditions });
  const n = hit.to - hit.from;
  // No more Icons than the Wounds to turn, or than the Toughness dice can show (a 6 is 2 Icons).
  const chips = Array.from({ length: Math.min(n, MAX_CHIPS, 2 * d.determination) + 1 }, (_, i) => i);

  const roll = async (icons: number) => {
    if (icons === 0) return setHit(null);
    const r = await send({ type: "spend.request", characterId: me.id, kind: "determination", amount: icons });
    if (r.ok) setHit(null);
    else setError(r.error);
  };

  return (
    <section className="pt-sheet" aria-label="You're hit">
      <div className="pt-head slate-card">
        <div className="pt-head-row">
          <span className="xmit">+++ YOU&rsquo;RE HIT +++</span>
          <button className="pt-hide mono" onClick={() => setHit(null)}>
            CLOSE
          </button>
        </div>
        <h2 className="pt-title">YOU&rsquo;RE HIT</h2>
        <span className="mono">
          +{n} WOUND{n === 1 ? "" : "S"} · W {hit.from} → {hit.to} / {d.maxWounds}
        </span>
      </div>
      <div className="pt-body">
        {exhausted ? (
          <p className="ph-note">You&rsquo;re Exhausted, so you can&rsquo;t roll Determination (p.199).</p>
        ) : (
          <section className="ph-det" aria-label="Determination">
            <h3 className="pt-pool-roll">DETERMINATION (p.196)</h3>
            <div className="pt-pool">
              <span className="pt-pool-n mono cut">{d.determination}</span>
              <span className="pt-pool-text">
                <span className="pt-pool-roll">ROLL {d.determination} DICE</span>
                <span>YOUR TOUGHNESS</span>
              </span>
            </div>
            <ul className="pt-rules">
              <li>EACH ICON: 1 WOUND BECOMES 1 SHOCK</li>
              <li>Not against Mortal Wounds.</li>
            </ul>
            <span className="label">I ROLLED · ICONS</span>
            <div className="ph-chips" role="group" aria-label="Icons rolled">
              {chips.map((i) => (
                <button key={i} className="ph-chip cut" onClick={() => void roll(i)}>
                  {i}
                </button>
              ))}
            </div>
            <Refusal error={error} onDismiss={() => setError(null)} />
          </section>
        )}
        <section className="ph-means" aria-label="What it means">
          <h3 className="pt-pool-roll">WHAT IT MEANS</h3>
          <ul className="pt-rules">
            <li>Wounded: +1 DN to all your Tests (p.193).</li>
            <li>
              <RuleLink name="Exhausted" /> (Shock over your max, p.196): Restore Shock costs 1 Wrath and your Combat
              Action.
            </li>
          </ul>
        </section>
      </div>
    </section>
  );
}
