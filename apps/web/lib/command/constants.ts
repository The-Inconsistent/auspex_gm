// The four counter actions, shared by the tracker buttons and the command line. Wounds count up in W&G, so healing is
// a negative Wounds delta.
export const COUNTER_ACTIONS = {
  wounds: { button: "DMG", field: "wounds", sign: 1, word: "WOUNDS" },
  heal: { button: "HEAL", field: "wounds", sign: -1, word: "HEALED" },
  shock: { button: "SHOCK", field: "shock", sign: 1, word: "SHOCK" },
  recover: { button: "RECOVER", field: "shock", sign: -1, word: "SHOCK RECOVERED" },
} as const;
export type CounterAction = keyof typeof COUNTER_ACTIONS;
export type CounterField = (typeof COUNTER_ACTIONS)[CounterAction]["field"];
export const COUNTER_ACTION_KEYS = Object.keys(COUNTER_ACTIONS) as CounterAction[];
