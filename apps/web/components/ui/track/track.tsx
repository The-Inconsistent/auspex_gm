import { blocks } from "@/lib/blocks/blocks";

import type { TrackTone } from "./constants";

type TrackProps = { value: number; max: number; tone?: TrackTone; label?: string };

// A wound or shock track: framed cells that fill crimson (harm) or ink. Decorative by default, because the number is
// shown beside it (or in .sr-only text). A track shown without its number (a threat on FIGHT: players get the scaled
// bar, not the count) takes a `label` and reads out the cells it draws.
export function Track({ value, max, tone = "harm", label }: TrackProps) {
  const { filled, cells } = blocks({ value, max });
  const a11y = label
    ? { role: "img", "aria-label": `${label}: ${filled} of ${cells} marked` }
    : { "aria-hidden": true as const };
  return (
    <span className={`track ${tone}`} {...a11y}>
      {Array.from({ length: cells }, (_, i) => (
        <span key={i} className={i < filled ? "on" : undefined} />
      ))}
    </span>
  );
}
