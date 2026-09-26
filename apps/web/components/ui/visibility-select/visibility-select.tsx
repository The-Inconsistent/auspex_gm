import type { ChangeEvent } from "react";

import { Visibility } from "@wg/shared";

import { VISIBILITY_LABEL } from "./constants";

type VisibilitySelectProps = { value: Visibility; onChange: (v: Visibility) => void; className?: string };

// What the players' phones show of a threat: hidden until its mini goes on the table (rules-flow §11.56). Used when a
// threat is added, prepared in a beat, or already in the fight.
export function VisibilitySelect({ value, onChange, className = "btn" }: VisibilitySelectProps) {
  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => onChange(Visibility.parse(e.target.value));
  return (
    <select className={className} aria-label="What players see" value={value} onChange={handleChange}>
      {Visibility.options.map((v) => (
        <option key={v} value={v}>
          PLAYERS: {VISIBILITY_LABEL[v]}
        </option>
      ))}
    </select>
  );
}
