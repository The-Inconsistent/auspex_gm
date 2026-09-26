import { blocks } from "@/lib/blocks/blocks";

import type { TrackTone } from "./constants";

type TrackProps = { value: number; max: number; tone?: TrackTone; label?: string };

// A framed bar filled to value/max, crimson (harm) or ink. Wounds and Shock pass what's left, so it drains as harm
// is taken. The fill snaps to blocks() steps, so a threat on FIGHT (players get the bar, not the count) stays coarse.
// Decorative by default, because the number is shown beside it (or in .sr-only text); a bar shown without its number
// takes a `label` and reads out the rounded share.
export function Track({ value, max, tone = "harm", label }: TrackProps) {
  const { filled, cells } = blocks({ value, max });
  const pct = cells ? Math.round((filled / cells) * 100) : 0;
  const a11y = label ? { role: "img", "aria-label": `${label}: about ${pct}% left` } : { "aria-hidden": true as const };
  return (
    <span className={`track ${tone}`} {...a11y}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}
