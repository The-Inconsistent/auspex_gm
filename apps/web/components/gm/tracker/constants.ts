import type { TurnMark, Visibility } from "@wg/shared";

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

// MORE's early NEW ROUND (the Round-complete key bar says BEGIN ROUND N+1 instead).
export const NEW_ROUND = "NEW ROUND";

// A row's turn mark (rules-flow §11.168). Before Round 1 the mark is the ambush toggle, so it says ACTS where it says READY.
export const TURN_MARK_LABEL: Record<TurnMark, string> = {
  out: "OUT",
  acting: "▶ ACTING",
  ambushed: "AMBUSHED",
  held: "HELD",
  done: "✓ DONE",
  ready: "READY",
};
export const SETUP_MARK_LABEL = { ready: "ACTS", ambushed: "AMBUSHED" } as const;

// What a row's turn dialog can ask for; the tracker maps each to its action.
export const TURN_DOS = [
  "start",
  "justGo",
  "seize",
  "end",
  "hold",
  "markDone",
  "notYet",
  "interrupt",
  "aware",
  "ambush",
] as const;

// The key bar's two fold-open panels.
export const KEY_PANELS = ["conditions", "more"] as const;
