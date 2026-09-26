import type { ThreatClass, Visibility } from "@wg/shared";

// Quick-pick amounts after DMG / HEAL / SHOCK / RECOVER.
export const AMOUNTS = [1, 2, 3, 4, 5, 6, 8, 10] as const;

// Vox log keeps the most recent entries only.
export const LOG_LIMIT = 40;

export const THREAT_CLASS_LABEL: Record<ThreatClass, string> = {
  T: "TROOP",
  E: "ELITE",
  A: "ADVERSARY",
  M: "MONSTROUS",
};

// What the players' phones show of a threat (rules-flow §11.53).
export const VISIBILITY_LABEL: Record<Visibility, string> = {
  hidden: "HIDDEN",
  bars: "BAR ONLY",
  stats: "FULL",
};
