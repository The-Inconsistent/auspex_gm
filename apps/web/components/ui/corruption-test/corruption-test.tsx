"use client";
import { useState, type ChangeEvent } from "react";

import {
  CORRUPTION_DNS,
  MAX_ICONS,
  corruptionGain,
  corruptionLevel,
  corruptionTestDn,
  type ActionResult,
  type Character,
  type CorruptionDn,
} from "@wg/shared";

import { NumberInput } from "@/components/ui/number-input/number-input";
import type { Send } from "@/hooks/use-table/use-table";

type CorruptionTestProps = {
  source?: CorruptionDn; // a scene's prepared Test fixes the source DN (Core p.285); without it the GM picks one
  characters: Character[]; // one Agent: no picker
  send: Send;
  onReport: (r: ActionResult, ok: string) => void;
};

// A failed Corruption Test (Core pp.285–286), from a scene's card or an Agent's PARTY row. The dice stay on the table,
// so the Icons are typed in; the server adds the level modifier, the gain, +1 Ruin and takes the spent Wrath.
export function CorruptionTest({ source: fixed, characters, send, onReport }: CorruptionTestProps) {
  const [who, setWho] = useState(characters[0]?.id ?? "");
  const [picked, setPicked] = useState<CorruptionDn>(CORRUPTION_DNS[1]);
  const [icons, setIcons] = useState<number | null>(null); // empty: no Icons
  const [complication, setComplication] = useState(false);
  const [wrathCritical, setWrathCritical] = useState(false);
  const [spent, setSpent] = useState(false);
  const [busy, setBusy] = useState(false); // a FAILED in flight: a second tap would charge Ruin and Wrath twice
  const agent = characters.find((c) => c.id === who);
  const source = fixed ?? picked;
  const points = agent?.stats.corruption ?? 0;
  const { modifier } = corruptionLevel(points);
  const spentWrath = spent && (agent?.wrath ?? 0) > 0; // the Agent pays it, so none to spend is no spend
  const testDn = corruptionTestDn({ source, points, wrathCritical, spentWrath });
  const gain = corruptionGain({ dn: testDn, icons: icons ?? 0, complication });
  const toggle = (on: boolean, set: (v: boolean) => void, label: string, disabled = false) => (
    <button className={`btn sm ${on ? "primary" : ""}`} aria-pressed={on} disabled={disabled} onClick={() => set(!on)}>
      {label}
    </button>
  );

  // A new Agent or a sent Test starts from a clean roll, so no toggle carries over to spend someone's Wrath.
  const clear = () => {
    setIcons(null);
    setComplication(false);
    setWrathCritical(false);
    setSpent(false);
  };

  // AGENT: another Agent's Test.
  const handleWho = (e: ChangeEvent<HTMLSelectElement>) => {
    setWho(e.target.value);
    clear();
  };

  // DN: one of the printed source DNs (p.285).
  const handleDn = (e: ChangeEvent<HTMLSelectElement>) =>
    setPicked(CORRUPTION_DNS.find((d) => d === Number(e.target.value)) ?? picked);

  // FAILED: sends the failed Test for the chosen Agent; the server refuses one the Icons would have passed.
  const handleFailed = async () => {
    if (!agent || busy) return;
    setBusy(true);
    const r = await send({
      type: "character.corrupt",
      id: agent.id,
      test: { source, icons: icons ?? 0, complication, wrathCritical, spentWrath },
    });
    setBusy(false);
    onReport(r, `${agent.name.toUpperCase()} +${gain} CORRUPTION · GM +1 RUIN${spentWrath ? " · −1 WRATH" : ""}`);
    if (r.ok) clear();
  };

  return (
    <div className="keys" style={{ alignItems: "flex-end" }}>
      {characters.length > 1 && (
        <div className="field">
          <label className="label">AGENT</label>
          <select className="input" aria-label="Agent who failed" value={who} onChange={handleWho}>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {fixed === undefined && (
        <select className="btn sm" aria-label="Corruption Test DN" value={picked} onChange={handleDn}>
          {CORRUPTION_DNS.map((d) => (
            <option key={d} value={d}>
              DN {d}
            </option>
          ))}
        </select>
      )}
      <span className="dim">
        DN {source}
        {modifier > 0 && ` +${modifier}`}
        {wrathCritical && " −2"}
        {spentWrath && " −1"}
        {testDn !== source && ` = ${testDn}`}
      </span>
      <div className="field">
        <span className="label">ICONS ROLLED</span>
        <NumberInput value={icons} label="Icons rolled" max={MAX_ICONS} onChange={setIcons} />
      </div>
      {toggle(complication, setComplication, "COMPLICATION ×2")}
      {toggle(wrathCritical, setWrathCritical, "WRATH CRITICAL −2")}
      {toggle(spentWrath, setSpent, "SPENT 1 WRATH −1", (agent?.wrath ?? 0) < 1)}
      <button className="btn sm danger" disabled={!agent || busy || (icons ?? 0) >= testDn} onClick={handleFailed}>
        FAILED · +{gain} CORRUPTION
      </button>
    </div>
  );
}
