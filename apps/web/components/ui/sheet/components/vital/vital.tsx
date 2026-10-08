import type { ReactNode } from "react";

import { Track } from "@/components/ui/track/track";

type VitalProps = {
  label: string;
  value: number;
  max: number | null;
  danger?: boolean;
  // A harm track (Wounds, Shock): `value` is harm taken, but the card shows what's left and a draining bar.
  remaining?: boolean;
  children?: ReactNode; // under the bar: the player's SPEND button
};

// One big read-only counter card on the player sheet: value, optional max and bar. Only the GM changes them.
export function Vital({ label, value, max, danger = false, remaining = false, children }: VitalProps) {
  const left = remaining && max !== null;
  const shown = left ? Math.max(0, max - value) : value;
  return (
    <div className="vital">
      <span className={danger ? "label accent" : "label"}>{label}</span>
      <span className="num" style={danger ? { color: "var(--red)" } : undefined}>
        {shown}
        {max !== null && (
          <span style={{ fontSize: 22 }} className="dim">
            /{max}
          </span>
        )}
      </span>
      {max !== null && <Track value={shown} max={max} tone={danger ? "harm" : "ink"} />}
      {children}
    </div>
  );
}
