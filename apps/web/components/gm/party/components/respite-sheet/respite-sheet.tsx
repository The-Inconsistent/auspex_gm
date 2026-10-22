"use client";
import { useState } from "react";

import type { ActionResult, Character } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

import type { PartyMsg } from "../../constants";
import { PartyDialog } from "../party-dialog/party-dialog";

type RespiteSheetProps = {
  characters: Character[]; // the active Agents
  send: Send;
  msg: PartyMsg | null;
  onResult: (r: ActionResult, ok: string) => void;
  onClose: () => void;
};

// RESPITE… for the whole party (p.197): a 6 h rest, Wounds and Shock → 0 and Wrath → 2. Every active Agent starts
// ticked; APPLY sends one `character.respite` for each tick, and a refusal (a Dying Agent) names who it was.
export function RespiteSheet({ characters, send, msg, onResult, onClose }: RespiteSheetProps) {
  const [ticked, setTicked] = useState(() => new Set(characters.map((c) => c.id)));
  const [busy, setBusy] = useState(false); // APPLY in flight: a second tap would rest everyone twice
  const chosen = characters.filter((c) => ticked.has(c.id));

  // A tick: one Agent in or out of the rest.
  const toggle = (id: string) =>
    setTicked((t) => {
      const next = new Set(t);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // APPLY: one respite per ticked Agent, in order. The sheet closes only if every one was accepted.
  const apply = async () => {
    setBusy(true);
    const refused: string[] = [];
    for (const c of chosen) {
      const r = await send({ type: "character.respite", id: c.id });
      if (!r.ok) refused.push(`${c.name.toUpperCase()}: ${r.error}`);
    }
    setBusy(false);
    if (refused.length) return onResult({ ok: false, error: refused.join(" · ") }, "");
    onResult({ ok: true }, `RESPITE · ${chosen.map((c) => c.name.toUpperCase()).join(", ")}`);
    onClose();
  };

  return (
    <PartyDialog label="Respite" title="RESPITE" msg={msg} onClose={onClose}>
      <div className="dim">A 6 h rest (p.197): Wounds and Shock → 0, Wrath → 2. Not while Dying.</div>
      <div className="list">
        {characters.map((c) => (
          <label key={c.id} className="check item">
            <input type="checkbox" checked={ticked.has(c.id)} onChange={() => toggle(c.id)} />
            <span>{c.name.toUpperCase()}</span>
          </label>
        ))}
      </div>
      <div className="keys">
        <button className="btn primary" disabled={!chosen.length || busy} onClick={apply}>
          APPLY · {chosen.length} AGENT{chosen.length === 1 ? "" : "S"}
        </button>
      </div>
    </PartyDialog>
  );
}
