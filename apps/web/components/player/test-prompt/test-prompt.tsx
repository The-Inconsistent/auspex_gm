"use client";
import { useState } from "react";

import {
  MAX_ICONS,
  callDn,
  dnLabel,
  testPool,
  testTitle,
  type ActionResult,
  type Character,
  type LiveState,
  type TestCall,
} from "@wg/shared";

import { NumberInput } from "@/components/ui/number-input/number-input";
import { Refusal } from "@/components/ui/refusal/refusal";
import { RuleIdLink } from "@/components/ui/rule-link/rule-link";
import type { Send } from "@/hooks/use-table/use-table";

type Toggle = { on: boolean; set: (v: boolean) => void; label: string; disabled?: boolean };
type TestPromptProps = { call: TestCall; me: Character; tier: LiveState["campaign"]["tier"]; send: Send };

// The Test the GM called (issue #191), over every tab: this Agent's own pool and what the dice mean, then PASSED or
// FAILED. The dice stay on the table (rules-flow.md §7); a second tap changes the answer (§11.144). A failed Corruption
// Test also sends its roll, for the gain the GM may apply (Core p.286).
export function TestPrompt({ call, me, tier, send }: TestPromptProps) {
  const [error, setError] = useState<string | null>(null);
  const [failing, setFailing] = useState(false); // the Corruption roll form is open
  const [icons, setIcons] = useState<number | null>(null);
  const [complication, setComplication] = useState(false);
  const [wrathCritical, setWrathCritical] = useState(false);
  const [spentWrath, setSpentWrath] = useState(false);
  const mine = call.reports[me.id];
  const [hidden, setHidden] = useState(mine !== undefined); // answered already: start as the slim bar
  const dn = callDn(call.test, me);
  const corruption = call.test.kind === "corruption";
  const noWrath = me.wrath < 1; // the spent Wrath comes off this Agent (p.286)
  const toggle = ({ on, set, label, disabled = false }: Toggle) => (
    <button className={`btn ${on ? "primary" : ""}`} aria-pressed={on} disabled={disabled} onClick={() => set(!on)}>
      {label}
    </button>
  );

  const report = async (passed: boolean, roll = {}) => {
    const r: ActionResult = await send({ type: "test.report", callId: call.id, characterId: me.id, passed, ...roll });
    setError(r.ok ? null : r.error);
    if (r.ok) setFailing(false);
  };

  // FAILED: a Corruption Test asks for its roll first; any other Test is sent at once.
  const handleFailed = () => (corruption ? setFailing(true) : void report(false));

  // SEND: the failed Corruption Test with its roll.
  const handleSendRoll = () =>
    void report(false, { icons: icons ?? 0, complication, wrathCritical, spentWrath: spentWrath && !noWrath });

  const title = `${testTitle(call.test)}${call.hideDn ? "" : ` · ${dn !== null ? `DN ${dn}` : dnLabel(call.test)}`}${call.fear ? " · FEAR" : ""}`;
  const pool = testPool({ character: me, test: call.test, tier });

  // HIDE: a slim bar over the tab strip, so the player can read the sheet while rolling. The form's state stays here.
  if (hidden) {
    return (
      <button className="pt-bar cut" aria-expanded={false} onClick={() => setHidden(false)}>
        <span className="mono">TEST CALLED · {title} · OPEN</span>
      </button>
    );
  }

  return (
    <section className="pt-sheet" aria-label="The GM calls a Test">
      <div className="pt-head slate-card">
        <div className="pt-head-row">
          <span className="xmit">+++ THE GM CALLS A TEST +++</span>
          <button className="pt-hide mono" aria-expanded onClick={() => setHidden(true)}>
            HIDE
          </button>
        </div>
        <h2 className="pt-title">{title}</h2>
      </div>
      <div className="pt-body">
        <div className="pt-pool">
          <span className="pt-pool-n mono cut">{pool}</span>
          <span className="pt-pool-text">
            <span className="pt-pool-roll">ROLL {pool} DICE</span>
            <span>One of them is the Wrath die.</span>
          </span>
        </div>
        <ul className="pt-rules">
          <li>
            <RuleIdLink id="test-shifting">4 or 5 is an Icon; 6 is an Exalted Icon, worth two (p.159).</RuleIdLink>
          </li>
          <li>
            <RuleIdLink id="character-complications">
              Wrath Die 6: +1 Glory to the group. Wrath Die 1: a Complication (p.163).
            </RuleIdLink>
          </li>
          <li>
            <RuleIdLink id="character-wrath">Spend 1 Wrath to reroll the failures (p.164).</RuleIdLink>
          </li>
          {call.fear && (
            <li>
              <RuleIdLink id="fear">Fail: +2 DN to every Test until the scene ends (p.199).</RuleIdLink>
            </li>
          )}
          {corruption && <li>Fail: you gain Corruption, the DN minus your Icons, double on a Complication (p.286).</li>}
        </ul>
        <div className="pt-answers">
          <button className="pt-answer pass cut" aria-pressed={mine?.passed === true} onClick={() => void report(true)}>
            PASSED
          </button>
          <button className="pt-answer fail cut" aria-pressed={mine?.passed === false} onClick={handleFailed}>
            FAILED
          </button>
        </div>
        <span className="pt-hint mono">ROLL ON THE TABLE · A SECOND TAP CHANGES YOUR ANSWER</span>
        {failing && (
          <div className="keys" style={{ alignItems: "flex-end" }}>
            <div className="field">
              <span className="label">ICONS ROLLED</span>
              <NumberInput value={icons} label="Icons rolled" max={MAX_ICONS} onChange={setIcons} />
            </div>
            {toggle({ on: complication, set: setComplication, label: "COMPLICATION" })}
            {toggle({ on: wrathCritical, set: setWrathCritical, label: "WRATH CRITICAL" })}
            {toggle({ on: spentWrath && !noWrath, set: setSpentWrath, label: "SPENT 1 WRATH", disabled: noWrath })}
            <button className="btn danger" onClick={handleSendRoll}>
              SEND FAILED
            </button>
          </div>
        )}
        <Refusal error={error} onDismiss={() => setError(null)} />
      </div>
    </section>
  );
}
