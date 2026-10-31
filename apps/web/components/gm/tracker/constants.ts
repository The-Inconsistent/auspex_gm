import type { Visibility } from "@wg/shared";

import type { CounterField } from "@/lib/command/constants";
import type { Direction } from "@/lib/fight-delta/fight-delta";

// Quick-pick amounts on the delta pad.
export const AMOUNTS = [1, 2, 3, 4, 5, 6, 8, 10] as const;

// Vox log keeps the most recent entries only.
export const LOG_LIMIT = 40;

// A threat row's visibility chip: the word on the row, and what a player sees (the chip's aria-label).
export const VISIBILITY_WORD: Record<Visibility, string> = { hidden: "HIDDEN", bars: "BARS", stats: "FULL" };
export const VISIBILITY_SEEN: Record<Visibility, string> = {
  hidden: "nothing, hidden",
  bars: "bars only",
  stats: "the full stat block",
};

// The delta pad's WOUNDS | SHOCK segments and each field's DEAL | HEAL words (Shock is recovered, not healed).
export const PAD_FIELDS = [
  { field: "wounds", label: "WOUNDS" },
  { field: "shock", label: "SHOCK" },
] as const satisfies readonly { field: CounterField; label: string }[];
export const DIRECTION_LABEL: Record<CounterField, Record<Direction, string>> = {
  wounds: { deal: "DEAL +", heal: "HEAL −" },
  shock: { deal: "DEAL +", heal: "RECOVER −" },
};

// The turn button's label when nobody is left to act; MORE offers the same early otherwise.
export const NEW_ROUND = "NEW ROUND";

// The key bar's two fold-open panels.
export const KEY_PANELS = ["conditions", "more"] as const;
