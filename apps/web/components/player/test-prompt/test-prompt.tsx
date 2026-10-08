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

  return (
    <section className="panel" style={{ display: "grid", gap: 8, padding: 10 }} aria-label="The GM calls a Test">
      <div className="label">THE GM CALLS A TEST</div>
      <div className="display" style={{ fontSize: 20 }}>
        {testTitle(call.test)}
        {!call.hideDn && ` · ${dn !== null ? `DN ${dn}` : dnLabel(call.test)}`}
        {call.fear && " · FEAR"}
      </div>
      <div>
        ROLL <b>{testPool({ character: me, test: call.test, tier })}</b> DICE, ONE OF THEM THE WRATH DIE.
      </div>
      <ul className="dim" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
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
      <div className="keys">
        <button
          className={`btn ${mine?.passed ? "primary" : ""}`}
          aria-pressed={mine?.passed === true}
          onClick={() => void report(true)}
        >
          PASSED
        </button>
        <button
          className={`btn ${mine && !mine.passed ? "danger" : ""}`}
          aria-pressed={mine?.passed === false}
          onClick={handleFailed}
        >
          FAILED
        </button>
      </div>
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
    </section>
  );
}
