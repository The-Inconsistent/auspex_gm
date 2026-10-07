"use client";
import { useState } from "react";

import {
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

type CorruptionFailedProps = {
  source: CorruptionDn; // the prepared Test's DN, which is the source DN (Core p.285)
  characters: Character[];
  send: Send;
  onReport: (r: ActionResult, ok: string) => void;
};

// A failed Corruption Test from the scene's card (Core pp.285–286): the same `character.corrupt` as PARTY's form, with
// the DN already set. The dice stay on the table, so the Icons are typed in.
export function CorruptionFailed({ source, characters, send, onReport }: CorruptionFailedProps) {
  const [who, setWho] = useState(characters[0]?.id ?? "");
  const [icons, setIcons] = useState<number | null>(null); // empty: no Icons
  const [complication, setComplication] = useState(false);
  const agent = characters.find((c) => c.id === who);
  const points = agent?.stats.corruption ?? 0;
  const { modifier } = corruptionLevel(points);
  const testDn = corruptionTestDn({ source, points });
  const gain = corruptionGain({ dn: testDn, icons: icons ?? 0, complication });

  // FAILED: sends the failed Test for the chosen Agent; the server refuses one the Icons would have passed.
  const handleFailed = async () => {
    if (!agent) return;
    onReport(
      await send({
        type: "character.corrupt",
        id: agent.id,
        test: { source, icons: icons ?? 0, complication },
      }),
      `${agent.name.toUpperCase()} +${gain} CORRUPTION · GM +1 RUIN`,
    );
  };

  return (
    <div className="keys" style={{ alignItems: "flex-end" }}>
      <div className="field">
        <label className="label">AGENT</label>
        <select className="input" aria-label="Agent who failed" value={who} onChange={(e) => setWho(e.target.value)}>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <span className="dim">{modifier > 0 ? `DN ${source} +${modifier} = ${testDn}` : `DN ${testDn}`}</span>
      <div className="field">
        <span className="label">ICONS ROLLED</span>
        <NumberInput value={icons} label="Icons rolled" max={MAX_ICONS} onChange={setIcons} />
      </div>
      <button
        className={`btn sm ${complication ? "primary" : ""}`}
        aria-pressed={complication}
        onClick={() => setComplication(!complication)}
      >
        COMPLICATION ×2
      </button>
      <button className="btn sm danger" disabled={!agent || (icons ?? 0) >= testDn} onClick={handleFailed}>
        FAILED · +{gain} CORRUPTION
      </button>
    </div>
  );
}
