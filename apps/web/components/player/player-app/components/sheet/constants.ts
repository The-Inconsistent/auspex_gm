// The character's counters on the sheet (read-only: the GM changes them), keyed by their `character.adjust` field.
export const SHEET_COUNTERS = {
  wounds: { label: "WOUNDS" },
  shock: { label: "SHOCK" },
  wrath: { label: "WRATH" },
} as const;

// What the sheet's (?) explains, under the label the sheet prints: the counters and Glory, the Traits row in order,
// Wealth, then the Skill dice. Rule ids from packages/data/rules (stat-block.json for the Traits Core pp.36–37 shares with threats).
export const SHEET_LEGEND = [
  ["WOUNDS", "stat-wounds"],
  ["SHOCK", "stat-shock"],
  ["WRATH", "character-wrath"],
  ["PARTY GLORY", "character-glory"],
  ["DEF", "stat-defence"],
  ["RES", "stat-resilience"],
  ["RSLV", "trait-resolve"],
  ["CONV", "stat-conviction"],
  ["SPD", "stat-speed"],
  ["INF", "trait-influence"],
  ["PAS", "trait-passive-awareness"],
  ["WEALTH", "trait-wealth"],
  ["SKILLS (dice)", "character-skills"],
] as const;
