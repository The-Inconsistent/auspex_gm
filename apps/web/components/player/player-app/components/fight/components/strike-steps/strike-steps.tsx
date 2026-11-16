"use client";
import { effectiveStrength, type Character } from "@wg/shared";

import { RuleIdLink, RuleLink } from "@/components/ui/rule-link/rule-link";
import { useRules } from "@/components/ui/rules-provider/rules-provider";
import { Term } from "@/components/ui/term/term";

import { weaponPool } from "@/lib/sheet-pools/sheet-pools";

type StrikeStepsProps = { me: Character; weapon: Character["stats"]["weapons"][number]; wounded: boolean };

// THEN, WITH YOUR DICE: what to roll and say for the chosen weapon, the Attack's steps (Core pp.182–184). The dice stay on
// the table; the phone only reads the weapon's own numbers back, so the player doesn't work them out.
export function StrikeSteps({ me, weapon: w, wounded }: StrikeStepsProps) {
  const { find } = useRules();
  const strength = effectiveStrength(me.stats);
  const damage = "addStrength" in w && w.addStrength ? strength + w.damage : w.damage; // melee S + X (p.183)
  // An ED-changing trait's own table, from the rules data the phone already holds (Brutal: weapon-traits).
  const brutal = w.traits.some((t) => t.toLowerCase() === "brutal")
    ? (find("Brutal")[0]
        ?.text.split("\n")
        .filter((l) => l.startsWith("•")) ?? [])
    : [];
  return (
    <ol className="pf-steps" aria-label={`Attack with ${w.name}`}>
      <li>
        <b>ROLL {weaponPool(me.stats, w)} DICE</b>
        <span>
          <RuleIdLink id="test-shifting">One is the Wrath Die. 4–5 = 1 Icon, 6 = 2 Icons.</RuleIdLink>
        </span>
      </li>
      <li>
        <b>HIT: ICONS ≥ THE TARGET&rsquo;S DEFENCE</b>
        <span>{wounded && "+1: you're Wounded (p.193). "}Spare 6s become +1 ED each (p.183).</span>
      </li>
      <li>
        <b>
          DAMAGE: {damage} + {w.ed} ED
        </b>
        <span>
          Roll the {w.ed} ED; each Icon adds 1 (p.183).
          {brutal.length > 0 && (
            <>
              {" "}
              <RuleLink name="Brutal">BRUTAL ED:</RuleLink> {brutal.map((l) => l.replace(/^•\s*/, "")).join(" · ")}
            </>
          )}
        </span>
      </li>
      <li>
        <b>SAY THE TOTAL{w.ap ? ` · AP ${w.ap}` : ""}</b>
        <span>
          The GM takes off Resilience. Wrath Die 6 on a hit: a <Term k="critical">Critical Hit</Term>, +1 Glory (pp.183,
          197).
        </span>
      </li>
    </ol>
  );
}
