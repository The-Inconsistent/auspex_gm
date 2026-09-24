import type { ThreatClass } from "@wg/shared";

// The four counter buttons. Wounds count up in W&G, so healing is a negative Wounds delta.
export const COUNTER_ACTIONS = {
  wounds: { button: "DMG", field: "wounds", sign: 1, word: "WOUNDS" },
  heal: { button: "HEAL", field: "wounds", sign: -1, word: "HEALED" },
  shock: { button: "SHOCK", field: "shock", sign: 1, word: "SHOCK" },
  recover: { button: "RECOVER", field: "shock", sign: -1, word: "SHOCK RECOVERED" },
} as const;
export type CounterAction = keyof typeof COUNTER_ACTIONS;
export type CounterField = (typeof COUNTER_ACTIONS)[CounterAction]["field"];
export const COUNTER_ACTION_KEYS = Object.keys(COUNTER_ACTIONS) as CounterAction[];

// Quick-pick amounts after DMG / HEAL / SHOCK / RECOVER.
export const AMOUNTS = [1, 2, 3, 4, 5, 6, 8, 10] as const;

// Vox log keeps the most recent entries only.
export const LOG_LIMIT = 40;

export const THREAT_CLASS_LABEL: Record<ThreatClass, string> = { T: "TROOP", E: "ELITE", A: "ADVERSARY", M: "MONSTROUS" };
