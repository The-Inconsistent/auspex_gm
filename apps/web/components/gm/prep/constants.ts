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

// An adventure's status as PREP labels it; `running` reads ACTIVE (issue #196). A phone says OFFERED for `planned`.
export const ADVENTURE_STATUS = { planned: "PLANNED", running: "ACTIVE", done: "DONE", failed: "FAILED" } as const;
