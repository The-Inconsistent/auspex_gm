import type { Visibility } from "@wg/shared";

// What the players' phones show of a threat (rules-flow §11.53).
export const VISIBILITY_LABEL: Record<Visibility, string> = {
  hidden: "HIDDEN",
  bars: "BAR ONLY",
  stats: "FULL",
};
