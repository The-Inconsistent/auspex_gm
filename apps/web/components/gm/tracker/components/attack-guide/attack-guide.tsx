"use client";
import { useState } from "react";

import {
  deriveStats,
  effectiveStrength,
  hitDn,
  mobBonusDice,
  pcStatus,
  sustainPenalty,
  threatAttackPool,
  threatStatus,
  woundsFromDamage,
  type ActionInput,
  type Combatant,
  type LiveState,
  type ThreatCombatant,
  type Weapon,
} from "@wg/shared";

import { CombatOptions } from "@/components/ui/combat-options/combat-options";
import { RuleIdLink } from "@/components/ui/rule-link/rule-link";
import { useRules } from "@/components/ui/rules-provider/rules-provider";
import { Term } from "@/components/ui/term/term";
import { WeaponLine } from "@/components/ui/weapon-line/weapon-line";
import { weaponPool, weaponSkill } from "@/lib/sheet-pools/sheet-pools";

type AttackWeapon = Weapon & { addStrength?: boolean };
type AttackGuideProps = {
  state: LiveState;
  attacker: Combatant | null;
  target: Combatant | null; // the selected row, when it is on the other side
  run: (a: ActionInput, text: string) => Promise<unknown>;
};

// What a combatant brings to an attack or takes from one, whichever side it is on.
function look(c: Combatant, state: LiveState) {
  if (c.kind === "pc") {
    const ch = state.characters.find((x) => x.id === c.characterId);
    if (!ch) return null;
    const d = deriveStats({ stats: ch.stats, overrides: ch.overrides, tier: state.campaign.tier });
    return {
      name: ch.name,
      wounded: pcStatus(ch, d).includes("Wounded"),
      sustain: sustainPenalty(ch.conditions),
      defence: d.defence,
      resilience: d.resilience,
      maxWounds: d.maxWounds,
      ch,
      weapons: ch.stats.weapons as AttackWeapon[],
      psyker: (ch.stats.skills["Psychic Mastery"] ?? 0) > 0,
    };
  }
  const weapons = (c.stats?.abilities ?? []).filter((a) => a.type === "ACTION").flatMap((a) => a.weapons ?? []);
  return {
    name: c.label,
    wounded: threatStatus(c).includes("Wounded"),
    sustain: sustainPenalty(c.conditions),
    defence: c.stats?.defence,
    resilience: c.stats?.resilience.value,
    maxWounds: c.maxWounds,
    ch: null,
    weapons: weapons as AttackWeapon[],
    psyker: !!c.stats?.keywords.includes("PSYKER"),
  };
}

export function AttackGuide({ state, attacker, target, run }: AttackGuideProps) {
  const rules = useRules();
  const [picked, setPicked] = useState<{ by: string; at: number } | null>(null);
  if (!attacker) return null;
  const a = look(attacker, state);
  if (!a) return null;
  const t = target ? look(target, state) : null;
  const at = picked?.by === attacker.id ? Math.min(picked.at, a.weapons.length - 1) : 0;
  const weapon = a.weapons[at];

  const strength = a.ch ? effectiveStrength(a.ch.stats) : 0;
  const pool = !weapon
    ? null
    : a.ch
      ? { skill: weaponSkill(weapon), dice: weaponPool(a.ch.stats, weapon) as number | null }
      : attacker.kind === "threat" && attacker.stats
        ? threatAttackPool(attacker.stats, weapon)
        : null;
  const base = weapon ? weapon.damage + (weapon.addStrength ? strength : 0) : 0;
  const brutal = weapon?.traits.some((x) => x === "Brutal") ? rules.find("Brutal")[0]?.gist : undefined;
  const mob = target?.kind === "threat" && target.mobCount !== null;
  // Troops can't inflict Critical Hits or suffer Complications unless the stat block says so (p.323).
  const troop = attacker.kind === "threat" && attacker.threatClass === "T";
  const mobBonus = attacker.kind === "threat" && attacker.mobCount ? mobBonusDice(attacker.mobCount) : 0;
  // An ally is always full on the phones (§11.208).
  const visibility = target?.kind === "threat" && !target.ally ? target.visibility : "stats";
  const actions = rules.all.filter((r) => r.kind === "action");

  return (
    <section className="atk" aria-label="Attack guide">
      <div className="rule">
        THE ATTACK · {a.name.toUpperCase()}
        {t && ` › ${t.name.toUpperCase()}`}
      </div>
      <ol className="atk-steps">
        <li>
          <b>DECLARE</b>
          {a.weapons.length ? (
            <div className="atk-chips">
              {a.weapons.map((w, i) => (
                <button
                  key={i}
                  type="button"
                  className={`btn sm${i === at ? " primary" : ""}`}
                  aria-pressed={i === at}
                  onClick={() => setPicked({ by: attacker.id, at: i })}
                >
                  {w.name.toUpperCase()}
                </button>
              ))}
            </div>
          ) : (
            <p className="dim">No weapon on the stat block.</p>
          )}
          <p className="dim">
            Often: <RuleIdLink id="aim">Aim</RuleIdLink> (p.189), <RuleIdLink id="called-shot">Called Shot</RuleIdLink>{" "}
            (p.186), <RuleIdLink id="multi-attack">Multi-Attack</RuleIdLink> (p.187).
          </p>
          {/* Every combat option, grouped, as the Agent's phone shows it on their Turn (Core pp.177–190). */}
          {actions.length > 0 && <CombatOptions actions={actions} weapons={a.weapons} />}
        </li>
        <li>
          <b>DICE POOL</b>
          <p>
            {pool?.dice != null
              ? `${pool.dice + mobBonus} dice · ${pool.skill}${mobBonus ? `, +${mobBonus} for the Mob (p.324)` : ""}, one of them the Wrath Die`
              : "Pool not printed"}
          </p>
          {pool?.dice != null && (
            <p className="dim">
              <RuleIdLink id="test-shifting">4–5 = 1 Icon, 6 = 2 Icons.</RuleIdLink> Hit: Icons ≥ the DN; spare 6s
              become +1 ED each (p.183).
            </p>
          )}
        </li>
        {!t ? (
          <li className="dim">Tap the target&apos;s row.</li>
        ) : (
          <>
            <li>
              <b>TO HIT</b>
              {t.defence === undefined ? (
                <p className="dim">No Defence on this stat block.</p>
              ) : (
                <p>
                  DN {hitDn({ defence: t.defence, attackerWounded: a.wounded, sustain: a.sustain })} · Defence{" "}
                  {t.defence}
                  {a.wounded && ", +1 Wounded"}
                  {a.sustain > 0 && `, +${a.sustain} sustaining (p.265)`}. Add the cover, range or vision you call
                  (pp.190–191).
                </p>
              )}
              {visibility !== "stats" && <p className="dim">Players see BARS: say the DN aloud.</p>}
            </li>
            <li>
              <b>DAMAGE</b>
              {weapon && (
                <p>
                  {base} + {weapon.ed} ED
                  {weapon.addStrength && ` (S ${strength} + ${weapon.damage})`} ·{" "}
                  <WeaponLine weapon={weapon} strength={strength} />
                  {brutal && <span className="dim"> · Brutal: {brutal}</span>}
                </p>
              )}
            </li>
            <li>
              <b>WOUNDS</b>
              {mob ? (
                <p>
                  Mob: damage over its Resilience kills a member; each Icon over Defence hits one more (p.325). Use the
                  Wounds pad.
                </p>
              ) : t.resilience === undefined || !target ? (
                <p className="dim">No Resilience on this stat block.</p>
              ) : (
                <Wounds
                  key={`${attacker.id}-${target.id}-${at}`}
                  target={target}
                  name={t.name}
                  resilience={t.resilience}
                  ap={weapon?.ap ?? 0}
                  takesShock={target.kind === "pc" || target.maxShock !== null}
                  run={run}
                />
              )}
            </li>
          </>
        )}
      </ol>
      {t && target && !mob && (
        <div className="atk-then">
          <b>THEN</b>
          <p>
            {troop ? (
              "A Troop: no Critical Hits or Complications unless its stat block gives it a Wrath or Complication ability (p.323)."
            ) : (
              <>
                Wrath Die 6 on a hit: <Term k="critical">Critical Hit</Term>
                {attacker.kind === "pc" ? ", +1 Glory" : ""} (pp.183, 197): the CRIT panel below reads the d66; one that
                doesn&apos;t beat Resilience still does 1 Wound (p.197). A 1: Complication (p.191).
              </>
            )}
          </p>
          {a.psyker && (
            <p>
              A psychic power: a 1 on a Wrath Die is <Term k="perils">Perils of the Warp</Term>, the PERILS tab below.
            </p>
          )}
          <p>{determination(target)}</p>
          <p>{death(target, t.maxWounds)}</p>
        </div>
      )}
    </section>
  );
}

// Determination is the target's own, after a Wound (p.196, p.323).
function determination(target: Combatant) {
  if (target.kind === "pc") return "Determination: the Agent rolls Toughness dice on their phone (p.196).";
  const printed = target.stats?.determination ? ` Stat block: ${target.stats.determination}.` : "";
  // What an ally pays for Determination is not ruled yet (§11.208): show the stat block as printed and no price.
  if (target.ally) return `Determination: what an ally pays is not ruled yet (§11.208).${printed}`;
  return target.threatClass === "T" || target.threatClass === "E"
    ? `Determination: needs 1 Ruin (p.323).${printed}`
    : `Determination: rolls as normal (p.323).${printed}`;
}

// What going over the track does to the target (pp.193–196, 324).
function death(target: Combatant, maxWounds: number) {
  if (target.kind === "pc")
    return `Wounds over max: Dying (p.193). One attack over ${2 * maxWounds} Wounds: Annihilated (p.194). Shock over max: Exhausted (p.196).`;
  const c = target as ThreatCombatant;
  if (c.threatClass === "T") return "Wounds or Shock over max: slain (p.324).";
  if (c.threatClass === "A") return "Wounds over max: Dying or dead, your call. Shock over max: Exhausted (p.324).";
  return "Wounds over max: slain. Shock over max: Exhausted (p.324).";
}

type WoundsProps = {
  target: Combatant;
  name: string;
  resilience: number;
  ap: number;
  takesShock: boolean; // false for a Threat whose Shock is "–" (p.324)
  run: AttackGuideProps["run"];
};

// The damage total the table rolled, and what it does. Keyed by attacker, target and weapon so it clears itself.
function Wounds({ target, name, resilience, ap, takesShock, run }: WoundsProps) {
  const [text, setText] = useState("");
  const damage = /^\d{1,3}$/.test(text) ? Number(text) : null;
  const out = damage === null ? null : woundsFromDamage({ damage, resilience, ap, takesShock });
  const result = !out ? "" : out.wounds ? `${out.wounds} WOUNDS` : out.shock ? "1 SHOCK" : "NO WOUNDS";

  const apply = async () => {
    if (!out || (!out.wounds && !out.shock)) return;
    const delta = { ...(out.wounds && { wounds: out.wounds }), ...(out.shock && { shock: out.shock }) };
    const r = await run(
      target.kind === "pc"
        ? { type: "character.adjust", id: target.characterId, ...delta }
        : { type: "combatant.adjust", id: target.id, ...delta },
      `${name.toUpperCase()} +${result}`,
    );
    if ((r as { ok?: boolean } | undefined)?.ok !== false) setText("");
  };

  return (
    <>
      <p>
        RESILIENCE {resilience}, AP {ap}
      </p>
      <div className="atk-dmg">
        <label>
          DAMAGE TOTAL
          <input
            className="atk-input"
            inputMode="numeric"
            value={text}
            onChange={(e) => setText(e.target.value.trim())}
            onKeyDown={(e) => e.key === "Enter" && void apply()}
          />
        </label>
        {out && (
          <b className="atk-result">
            = {result}
            {out.wounds || out.shock ? ` ON ${name.toUpperCase()}` : ""}
          </b>
        )}
        <button
          type="button"
          className="btn sm primary"
          disabled={!out || (!out.wounds && !out.shock)}
          onClick={() => void apply()}
        >
          APPLY
        </button>
      </div>
    </>
  );
}
