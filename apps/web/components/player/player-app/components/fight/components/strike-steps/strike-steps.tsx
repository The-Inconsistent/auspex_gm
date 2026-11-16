"use client";
import { useState } from "react";

import { effectiveStrength, hitDn, woundsFromDamage, type Character, type ThreatCombatant } from "@wg/shared";

import { RuleIdLink, RuleLink } from "@/components/ui/rule-link/rule-link";
import { useRules } from "@/components/ui/rules-provider/rules-provider";
import { Term } from "@/components/ui/term/term";

import { weaponPool } from "@/lib/sheet-pools/sheet-pools";

type StrikeStepsProps = {
  me: Character;
  weapon: Character["stats"]["weapons"][number];
  wounded: boolean;
  target: ThreatCombatant | null; // the threat opened in THE FIELD; its stats are null while the GM shows bars (§11.56)
};

// THEN, WITH YOUR DICE: what to roll and say for the chosen weapon, the Attack's steps (Core pp.182–184). The dice stay on
// the table; the phone only reads the numbers back, so the player doesn't work them out. With a target whose stat block
// is shown, the DN and Resilience are its own, and the damage total typed here reads as Wounds (§11.173); the GM applies.
export function StrikeSteps({ me, weapon: w, wounded, target }: StrikeStepsProps) {
  const { find } = useRules();
  const [total, setTotal] = useState("");
  const strength = effectiveStrength(me.stats);
  const damage = "addStrength" in w && w.addStrength ? strength + w.damage : w.damage; // melee S + X (p.183)
  // An ED-changing trait's own table, from the rules data the phone already holds (Brutal: weapon-traits).
  const brutal = w.traits.some((t) => t.toLowerCase() === "brutal")
    ? (find("Brutal")[0]
        ?.text.split("\n")
        .filter((l) => l.startsWith("•")) ?? [])
    : [];
  const t = target?.stats ?? null;
  const name = target?.label.toUpperCase() ?? "";
  const mob = target?.mobCount != null;
  const takesShock = target?.maxShock !== null;
  const resilience = t ? Math.max(0, t.resilience.value + (w.ap ?? 0)) : 0; // AP is negative in the data
  const out =
    t && total
      ? woundsFromDamage({ damage: Number(total), resilience: t.resilience.value, ap: w.ap ?? 0, takesShock })
      : null;
  return (
    <ol className="pf-steps" aria-label={`Attack with ${w.name}`}>
      <li>
        <b>ROLL {weaponPool(me.stats, w)} DICE</b>
        <span>
          <RuleIdLink id="test-shifting">One is the Wrath Die. 4–5 = 1 Icon, 6 = 2 Icons.</RuleIdLink>
        </span>
      </li>
      <li>
        {t ? (
          <b>
            HIT: {hitDn({ defence: t.defence, attackerWounded: wounded })}+ ICONS ON {name}
          </b>
        ) : (
          <b>HIT: ICONS ≥ {target ? `${name}'S` : "THE TARGET'S"} DEFENCE</b>
        )}
        <span>
          {t && `Defence ${t.defence}. `}
          {wounded && "+1: you're Wounded (p.193). "}Spare 6s become +1 ED each (p.183).
          {!target && " Tap a threat in THE FIELD to aim at it."}
          {target && !t && " Its stat block isn't shown to you."}
        </span>
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
          {!t
            ? "Over the threat's Resilience, after AP: Wounds. Equal: 1 Shock (p.192). "
            : mob
              ? `Over ${resilience} (Resilience ${t.resilience.value}${w.ap ? `, AP ${w.ap}` : ""}): one of the Mob falls, one more per Icon over its Defence (p.325). `
              : `Over ${resilience} (Resilience ${t.resilience.value}${w.ap ? `, AP ${w.ap}` : ""}): Wounds. Equal: ${takesShock ? "1 Shock (p.192)" : "nothing, it takes no Shock (p.324)"}. `}
          Wrath Die 6 on a hit: a <Term k="critical">Critical Hit</Term>, +1 Glory (pp.183, 197).
        </span>
        {t && !mob && (
          <label className="pf-total">
            <span className="label">DAMAGE TOTAL</span>
            <input
              className="pf-total-in mono"
              inputMode="numeric"
              value={total}
              onChange={(e) => setTotal(e.target.value.replace(/\D/g, "").slice(0, 3))}
            />
            {out && (
              <b className="mono" role="status">
                = {out.wounds ? `${out.wounds} WOUND${out.wounds === 1 ? "" : "S"}` : out.shock ? "1 SHOCK" : "NOTHING"}
              </b>
            )}
          </label>
        )}
      </li>
    </ol>
  );
}
