// The player's bottom tabs, in order. SHEET is the default.
export const PLAYER_TABS = ["SHEET", "FIGHT", "INTEL", "RULES"] as const;
export type PlayerTab = (typeof PLAYER_TABS)[number];

// The open tab lives in the address (`?tab=fight`), so a refresh or an app switch lands back on it.
export const TAB_PARAM = "tab";

// Two short buzzes when it becomes your turn.
export const TURN_VIBRATION = [200, 100, 200];

// About the open header's height: the vitals strip folds once the body's marker (.pl-fold-mark) passes under it.
export const FOLD_UNDER_PX = 220;

// The rule each strip label opens (ids from packages/data/rules, as the long sheet's SHEET_LEGEND): Wounds and Shock
// (Core p.37), Wrath and Glory (p.164).
export const STRIP_RULES = {
  wounds: "stat-wounds",
  shock: "stat-shock",
  wrath: "character-wrath",
  glory: "character-glory",
} as const;
