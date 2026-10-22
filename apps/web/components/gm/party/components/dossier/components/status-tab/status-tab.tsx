"use client";
import { useState } from "react";

import { CONDITIONS, deriveStats, type ActionResult, type Character } from "@wg/shared";

import { CorruptionTest } from "@/components/ui/corruption-test/corruption-test";
import type { Send } from "@/hooks/use-table/use-table";

import { ObjectivesEditor } from "../../../objectives-editor/objectives-editor";
import { TapValue } from "../tap-value/tap-value";

type StatusTabProps = {
  character: Character;
  tier: number;
  send: Send;
  onResult: (r: ActionResult, ok: string) => void;
};

// STATUS: what changes at the table. WOUNDS, SHOCK, WRATH and CORRUPTION are tapped values; Conditions are chips (tap
// removes) with a picker to add; then the Agent's objectives, a Corruption Test and RESPITE.
export function StatusTab({ character: c, tier, send, onResult }: StatusTabProps) {
  const d = deriveStats({ stats: c.stats, overrides: c.overrides, tier });
  const [picking, setPicking] = useState(false); // + CONDITION's chip picker
  const [testing, setTesting] = useState(false); // the Corruption Test's form

  // A Condition on the character, in or out of a fight (the tracker reaches only combatants).
  const setConditions = async (conditions: string[], ok: string) =>
    onResult(await send({ type: "character.update", id: c.id, conditions }), `${c.name.toUpperCase()} ${ok}`);

  // RESPITE: a 6h rest; Wounds and Shock → 0, Wrath → 2 (p.197).
  const respite = async () =>
    onResult(await send({ type: "character.respite", id: c.id }), `${c.name.toUpperCase()} RESPITE`);

  return (
    <div className="stack">
      <div className="party-values">
        {/* What's left, as on the card and the tracker; the pad's steps say HEAL / DEAL. */}
        <TapValue
          field="wounds"
          character={c}
          shown={`${Math.max(0, d.maxWounds - c.wounds)}/${d.maxWounds}`}
          send={send}
          onResult={onResult}
        />
        <TapValue
          field="shock"
          character={c}
          shown={`${Math.max(0, d.maxShock - c.shock)}/${d.maxShock}`}
          send={send}
          onResult={onResult}
        />
        <TapValue field="wrath" character={c} shown={String(c.wrath)} send={send} onResult={onResult} />
        <TapValue field="corruption" character={c} shown={String(c.stats.corruption)} send={send} onResult={onResult} />
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">CONDITIONS</span>
        <div className="keys" style={{ paddingTop: 0 }}>
          {c.conditions.map((k) => (
            <button
              key={k}
              className="chip warn party-chip-btn"
              aria-label={`Remove ${k}`}
              onClick={() =>
                setConditions(
                  c.conditions.filter((x) => x !== k),
                  `−${k.toUpperCase()}`,
                )
              }
            >
              {k.toUpperCase()} ×
            </button>
          ))}
          {!c.conditions.length && <span className="dim">None.</span>}
          <button className="btn sm" aria-expanded={picking} onClick={() => setPicking(!picking)}>
            + CONDITION
          </button>
        </div>
        {picking && (
          <div className="keys" role="group" aria-label="Add a Condition" style={{ paddingTop: 0 }}>
            {CONDITIONS.filter((k) => !c.conditions.includes(k)).map((k) => (
              <button
                key={k}
                className="chip party-chip-btn"
                onClick={() => setConditions([...c.conditions, k], `+${k.toUpperCase()}`)}
              >
                + {k.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>
      <ObjectivesEditor character={c} send={send} onResult={onResult} />
      <div className="keys">
        <button className="btn" aria-expanded={testing} onClick={() => setTesting(!testing)}>
          CORRUPTION TEST
        </button>
        <button className="btn" onClick={respite}>
          RESPITE
        </button>
      </div>
      {testing && <CorruptionTest characters={[c]} send={send} onReport={onResult} />}
    </div>
  );
}
