"use client";
import { useState, type FormEvent } from "react";

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

import type { Send } from "@/hooks/use-table/use-table";

type CorruptionFormProps = {
  character: Character;
  send: Send;
  onResult: (r: ActionResult, ok: string) => void;
};

// A failed Corruption Test (Core pp.285–286): the source DN is sent and the server adds the level modifier, the gain and +1 Ruin.
export function CorruptionForm({ character, send, onResult }: CorruptionFormProps) {
  const [dn, setDn] = useState<CorruptionDn>(CORRUPTION_DNS[1]);
  const [icons, setIcons] = useState(0);
  const [complication, setComplication] = useState(false);
  const { modifier } = corruptionLevel(character.stats.corruption);
  const testDn = corruptionTestDn({ source: dn, points: character.stats.corruption });
  const passed = icons >= testDn; // a passed Test gains nothing and gives the GM no Ruin
  const gain = corruptionGain({ dn: testDn, icons, complication });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    onResult(
      await send({ type: "character.corrupt", id: character.id, test: { source: dn, icons, complication } }),
      `${character.name.toUpperCase()} +${gain} CORRUPTION · GM +1 RUIN`,
    );
  };

  return (
    <form style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }} onSubmit={submit}>
      <select
        className="btn sm"
        aria-label="Corruption Test DN"
        value={dn}
        onChange={(e) => setDn(CORRUPTION_DNS.find((d) => d === Number(e.target.value)) ?? dn)}
      >
        {CORRUPTION_DNS.map((d) => (
          <option key={d} value={d}>
            DN {d}
          </option>
        ))}
      </select>
      <span className="dim">{modifier > 0 ? `DN ${dn} +${modifier} = ${testDn}` : `DN ${testDn}`}</span>
      <input
        className="input"
        type="number"
        min={0}
        max={MAX_ICONS}
        aria-label="Icons rolled"
        value={icons}
        onChange={(e) => setIcons(Math.max(0, Math.min(MAX_ICONS, Number(e.target.value) || 0)))}
        style={{ width: 80 }}
      />
      <label>
        <input type="checkbox" checked={complication} onChange={(e) => setComplication(e.target.checked)} />{" "}
        COMPLICATION
      </label>
      <button className="btn sm primary" disabled={passed}>
        FAILED · +{gain}
      </button>
    </form>
  );
}
