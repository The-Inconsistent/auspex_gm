import type { TestKind } from "@wg/shared";

// The rules entries a scene's Tests point to (packages/data/rules/tests.json), with the label PREP shows.
export const TEST_RULES = [
  ["test-dn", "DN TABLE"],
  ["test-shifting", "SHIFTING"],
  ["test-fail-forward", "FAIL FORWARD"],
] as const;

// The rules entries a scene's Ruin and Glory point to (packages/data/rules/character.json; Ruin is the GM's, §11.76).
export const POOL_RULES = [
  ["character-ruin", "RUIN"],
  ["character-glory", "GLORY"],
  ["character-complications", "COMPLICATIONS"],
  ["character-combat-complications", "COMBAT COMPLICATIONS"],
] as const;

export const TEST_KIND_LABELS: Record<TestKind, string> = {
  skill: "SKILL",
  attribute: "ATTRIBUTE",
  opposed: "OPPOSED",
  influence: "INFLUENCE",
  resolve: "RESOLVE (FEAR, TERROR)",
  corruption: "CORRUPTION",
};
