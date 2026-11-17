"use client";
import { useState } from "react";

import {
  POWER_LEVELS,
  powerLevelDice,
  rankOf,
  skillTotal,
  type Character,
  type PowerLevel,
  type SheetPower,
  type ThreatCombatant,
} from "@wg/shared";

import { Term } from "@/components/ui/term/term";

type PowerStepsProps = {
  me: Character;
  power: SheetPower;
  tier: number;
  wounded: boolean;
  target: ThreatCombatant | null; // the threat picked in 2 · PICK A TARGET; its stats are null while the GM shows bars
};

const LEVEL_WORDS = { bound: "BOUND", unbound: "UNBOUND", transcendent: "TRANSCENDENT" } as const;

// THEN, WITH YOUR DICE for a psychic power (Core pp.259–263): the Power Level picks the Wrath Dice, the phone counts the
// pool and the DN, and says what a 1 on any Wrath Die means. The scene's lock on lower Power Levels after Unbound or
// Transcendent is said, not tracked (rules-flow §11.176).
export function PowerSteps({ me, power: p, tier, wounded, target }: PowerStepsProps) {
  const [level, setLevel] = useState<PowerLevel>("bound");
  const rank = rankOf(me.xp);
  const dice = powerLevelDice({ level, rank, tier });
  const base = skillTotal(me.stats, "Psychic Mastery");
  // A DN of exactly "Target's Defence" reads as the picked threat's Defence once its stat block is shown; any other
  // DN in words (Willpower, Resolve, "+2") stays as printed.
  const byDefence = typeof p.dn === "string" && /^target.s defence$/i.test(p.dn.trim());
  const defence = byDefence ? (target?.stats?.defence ?? null) : null;
  const dn = typeof p.dn === "number" ? p.dn : defence;
  const shown = dn === null ? p.dn.toString().toUpperCase() : `${dn + (wounded ? 1 : 0)}+`;
  return (
    <ol className="pf-steps" aria-label={`Manifest ${p.name}`}>
      <li>
        <b>PICK A POWER LEVEL</b>
        <span>One power per Round (p.259).</span>
        <div className="pf-levels" role="group" aria-label="Power Level">
          {POWER_LEVELS.map((l) => {
            const d = powerLevelDice({ level: l, rank, tier });
            return (
              <button key={l} type="button" className="pf-level" aria-pressed={level === l} onClick={() => setLevel(l)}>
                <b>{LEVEL_WORDS[l]}</b>
                <span className="mono">
                  +{d.bonus} WRATH{d.shock ? ` · ${d.shock} SHOCK` : ""}
                </span>
              </button>
            );
          })}
        </div>
        <span>
          {level === "bound"
            ? "One Wrath Die (p.260)."
            : level === "unbound"
              ? "For the rest of the scene, only Unbound or Transcendent (p.260)."
              : `Take ${dice.shock} Shock. For the rest of the scene, only Transcendent (p.260).`}
        </span>
      </li>
      <li>
        <b>
          ROLL {base + dice.bonus} DICE · {dice.wrath} WRATH {dice.wrath === 1 ? "DIE" : "DICE"}
        </b>
        <span>
          Psychic Mastery (Wil) {base}
          {dice.bonus ? `, +${dice.bonus} for ${level === "unbound" ? "Unbound" : "Transcendent"}` : ""} (p.259).
        </span>
      </li>
      <li>
        <b>
          MANIFEST: {shown} ICONS{byDefence && dn === null && target ? ` · ${target.label.toUpperCase()}` : ""}
        </b>
        <span>
          {defence !== null && `${target?.label}'s Defence ${defence}. `}
          {wounded && (dn === null ? "Add 1 to that DN: you're Wounded (p.193). " : "+1: you're Wounded (p.193). ")}A 6
          on a Wrath Die is an Exalted Icon: no Critical Hit or Glory, but you may Shift it for Potency while the DN is
          still met (p.259).
          {p.potency.length > 0 && ` Potency: ${p.potency.join(" · ")}`}
        </span>
      </li>
      <li>
        <b>ANY WRATH DIE ON 1</b>
        <span>
          <Term k="perils">Perils of the Warp</Term>, success or not: roll d66 on the table (p.263), +10 for each extra
          1 (p.262).
        </span>
      </li>
    </ol>
  );
}
