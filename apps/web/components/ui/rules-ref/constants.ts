import type { RuleKind } from "@wg/shared";

// Kind filter tabs; null shows every kind.
export const RULE_FILTERS = {
  ALL: null,
  COND: "condition",
  WEAPON: "weapon-trait",
  ARMOUR: "armour-trait",
  ACTIONS: "action",
} as const satisfies Record<string, RuleKind | null>;
export type RuleFilter = keyof typeof RULE_FILTERS;

export const RULE_KIND_LABELS: Record<RuleKind, string> = {
  condition: "CONDITION",
  "weapon-trait": "WEAPON TRAIT",
  "armour-trait": "ARMOUR TRAIT",
  action: "ACTION",
};
