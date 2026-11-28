"use client";
import { useState, type ReactNode } from "react";

import { THREAT_CLASS_LABEL, threatCite, type LiveState, type ThreatCombatant } from "@wg/shared";

import { RequestSpend } from "@/components/ui/request-spend/request-spend";
import { WeaponLine } from "@/components/ui/weapon-line/weapon-line";
import type { Send } from "@/hooks/use-table/use-table";

import { StrikeSteps } from "../strike-steps/strike-steps";

import { followerComplications, followerPool, followerWeapons, followerWounded } from "./utils";

type FollowerTurnProps = {
  c: ThreatCombatant; // the ally this phone runs, whose Turn it is
  state: LiveState;
  characterId: string;
  send: Send;
  target: ThreatCombatant | null; // the enemy opened in 2 · A TARGET
  targets: ReactNode; // the Threats' rows, built by Fight so a tap there opens the same stat block
};

// YOUR FOLLOWER'S TURN (issue #350, §11.208): the phone reads the follower's own stat block the way YOUR TURN reads the
// Agent's sheet: a weapon, a target, the dice, its Complication line, and Glory asked for it. The player says what it does
// and the GM taps; no fight action is sent from here, only a spend request that names the ally.
export function FollowerTurn({ c, state, characterId, send, target, targets }: FollowerTurnProps) {
  const [picked, setPicked] = useState(0);
  const s = c.stats;
  const weapons = followerWeapons(c);
  const at = Math.min(picked, weapons.length - 1); // the list can shrink under a held pick
  const weapon = weapons[at];
  const pool = weapon ? followerPool({ c, weapon }) : null;
  const complications = followerComplications(c);
  return (
    <>
      {s && (
        <section className="pf-sec" aria-label="Your follower">
          <span className="mono pf-cap">
            WOUNDS {c.maxWounds - c.wounds}/{c.maxWounds} · SHOCK{" "}
            {c.maxShock === null ? "–" : `${c.maxShock - c.shock}/${c.maxShock}`} · DEF {s.defence} · RES{" "}
            {s.resilience.value} · {THREAT_CLASS_LABEL[c.threatClass]}
          </span>
        </section>
      )}

      <section className="pf-sec">
        <div className="pf-h">
          <h2>1 · A WEAPON</h2>
          <i />
          <span className="mono">{weapons.length ? "PICK ONE" : "NONE PRINTED"}</span>
        </div>
        {weapons.length === 0 && <span className="pf-cap">No weapon on its stat block.</span>}
        {weapons.map((w, i) => {
          const on = i === at;
          const dice = followerPool({ c, weapon: w });
          return (
            // The WeaponLine holds rule-link buttons, so the pick is its own button and not the whole card.
            <div key={`${w.name}-${i}`} className={`pf-weapon slate-card cut ${on ? "on" : ""}`}>
              <button type="button" className="pf-pick" aria-pressed={on} onClick={() => setPicked(i)}>
                <span className="pool-badge" aria-label="Dice pool">
                  {dice ?? "–"}
                </span>
                <b>{w.name}</b>
              </button>
              <span className="pf-wl">
                <WeaponLine weapon={w} />
              </span>
            </div>
          );
        })}
      </section>

      <section className="pf-sec">
        <div className="pf-h">
          <h2>2 · A TARGET</h2>
          <i />
          <span className="mono">{target ? `› ${target.label.toUpperCase()}` : "TAP A THREAT"}</span>
        </div>
        {targets}
      </section>

      {weapon && pool !== null && (
        <section className="pf-sec">
          <div className="pf-h">
            <h2>3 · THE DICE</h2>
            <i />
          </div>
          <StrikeSteps
            key={`${c.id}-${at}-${target?.id ?? ""}`}
            pool={pool}
            strength={0}
            weapon={weapon}
            wounded={followerWounded(c)}
            sustain={0}
            target={target}
          />
          {s && (
            <span className="pf-cap">
              Its Skill dice, from its stat block, against the target&rsquo;s Defence. {s.name}, {threatCite(s)}.
            </span>
          )}
        </section>
      )}

      {s && complications.length > 0 && (
        <section className="pf-sec" aria-label="On a Complication">
          <div className="pf-h">
            <h2>ON A COMPLICATION</h2>
            <i />
          </div>
          <ul className="pf-steps pf-plain">
            {complications.map((a, i) => (
              <li key={i}>
                <b>{(a.name ?? "COMPLICATION").toUpperCase()}</b>
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="pf-sec" aria-label="Ask for Glory">
        <div className="pf-h">
          <h2>ASK FOR GLORY</h2>
          <i />
          <span className="mono">PARTY HOLDS {state.campaign.glory}</span>
        </div>
        <RequestSpend
          pool="glory"
          state={state}
          characterId={characterId}
          send={send}
          combatantId={c.id}
          className="pf-spend-open btn"
          label="DAMAGE (p.165) · SEIZE (p.177)"
        />
        <span className="pf-cap">The GM answers. Nothing is spent until it accepts.</span>
      </section>

      <div className="mono pf-after">
        <span>THE GM ENDS ITS TURN · THEN {(state.encounter?.upNext ?? "—").toUpperCase()} PICK</span>
      </div>
    </>
  );
}
