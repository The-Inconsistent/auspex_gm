import type { TestKind } from "@wg/shared";

// The rules entries a scene's Tests point to (packages/data/rules/tests.json), with the label PREP shows.
export const TEST_RULES = [
  ["test-dn", "DN TABLE"],
  ["test-shifting", "SHIFTING"],
  ["test-fail-forward", "FAIL FORWARD"],
] as const;

export const TEST_KIND_LABELS: Record<TestKind, string> = {
  skill: "SKILL",
  attribute: "ATTRIBUTE",
  opposed: "OPPOSED",
  influence: "INFLUENCE",
  resolve: "RESOLVE (FEAR, TERROR)",
  corruption: "CORRUPTION",
};
