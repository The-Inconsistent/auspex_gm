"use client";
import { FightsAs } from "@wg/shared";

import { FIGHTS_AS_HINT, FIGHTS_AS_LABEL } from "@/lib/ally/ally";

type FightsAsFieldProps = { id: string; value: FightsAs; onChange: (v: FightsAs) => void };

// An NPC's category (issue #350, rules-flow §11.208): three radios, each with what it means for GIVE and for a fight.
// Players never see it. Native radios give the arrow keys and the group's accessible name for free.
export function FightsAsField({ id, value, onChange }: FightsAsFieldProps) {
  return (
    <div className="stack" style={{ gap: 6 }} role="radiogroup" aria-labelledby={id}>
      {FightsAs.options.map((o) => (
        <label key={o} className="keys" style={{ padding: 0, flexWrap: "nowrap", alignItems: "flex-start" }}>
          <input type="radio" name={id} checked={value === o} onChange={() => onChange(o)} />
          <span>
            <b>{FIGHTS_AS_LABEL[o]}</b> <span className="dim">{FIGHTS_AS_HINT[o]}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
