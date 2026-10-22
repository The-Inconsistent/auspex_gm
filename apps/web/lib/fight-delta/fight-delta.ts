import { COUNTER_ACTION_KEYS, COUNTER_ACTIONS, type CounterAction, type CounterField } from "../command/constants.ts";

// The delta pad's two directions. Wounds and Shock both count up in W&G, so DEAL is +, HEAL / RECOVER is −.
export const DIRECTIONS = ["deal", "heal"] as const;
export type Direction = (typeof DIRECTIONS)[number];
export const DIRECTION_SIGN: Record<Direction, 1 | -1> = { deal: 1, heal: -1 };

// What the pad's text box means: `-3` heals / recovers 3, `+2` deals 2, a bare `2` follows the DEAL | HEAL segment
// (DEAL until the GM flips it). Whole numbers 1-99 only; anything else is null so the pad can say so.
export function parseDelta({ text, direction }: { text: string; direction: Direction }): number | null {
  const m = /^([+\-−–]?)\s*(\d{1,2})$/.exec(text.trim());
  if (!m) return null;
  const n = Number(m[2]);
  if (n === 0) return null;
  if (m[1] === "") return DIRECTION_SIGN[direction] * n;
  return m[1] === "+" ? n : -n;
}

// Which of the four counter actions a signed delta on a field is, for its log wording (COUNTER_ACTIONS.word).
export function counterKey({ field, delta }: { field: CounterField; delta: number }): CounterAction {
  const found = COUNTER_ACTION_KEYS.find(
    (k) => COUNTER_ACTIONS[k].field === field && COUNTER_ACTIONS[k].sign === Math.sign(delta),
  );
  if (!found) throw new Error(`no counter action for ${field} ${delta}`);
  return found;
}
