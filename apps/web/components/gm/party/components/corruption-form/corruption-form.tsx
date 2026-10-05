"use client";
import { useState, type FormEvent } from "react";

import {
  CORRUPTION_DNS,
  corruptionGain,
  corruptionLevel,
  corruptionTestDn,
  type ActionResult,
  type Character,
} from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

type CorruptionFormProps = {
  character: Character;
  send: Send;
  onResult: (r: ActionResult, ok: string) => void;
};

// FAILED CORRUPTION TEST (Core pp.285–286): the source's DN, the Icons rolled and whether a Complication came up. One
// tap sends `character.corrupt` with the Test; the server adds the Corruption gained and the GM's +1 Ruin together, and
// answers with any Mutation Test the new level asks for (shown on the report line).
// ponytail: the DN is picked from CORRUPTION_DNS here; a scene's prepared Test (PREP only today) isn't wired to it.
export function CorruptionForm({ character, send, onResult }: CorruptionFormProps) {
  const [dn, setDn] = useState<number>(CORRUPTION_DNS[1]);
  const [icons, setIcons] = useState(0);
  const [complication, setComplication] = useState(false);
  // The Test is against the source DN plus the level modifier (Core p.286); the server gets that full DN.
  const { modifier } = corruptionLevel(character.stats.corruption);
  const testDn = corruptionTestDn({ source: dn, points: character.stats.corruption });
  const passed = icons >= testDn; // a passed Test gains nothing and gives the GM no Ruin
  const gain = corruptionGain({ dn: testDn, icons, complication });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    onResult(
      await send({ type: "character.corrupt", id: character.id, test: { dn: testDn, icons, complication } }),
      `${character.name.toUpperCase()} +${gain} CORRUPTION · GM +1 RUIN`,
    );
  };

  return (
    <form style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }} onSubmit={submit}>
      <select
        className="btn sm"
        aria-label="Corruption Test DN"
        value={dn}
        onChange={(e) => setDn(Number(e.target.value))}
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
        max={60}
        aria-label="Icons rolled"
        value={icons}
        onChange={(e) => setIcons(Math.max(0, Math.min(60, Number(e.target.value) || 0)))}
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
