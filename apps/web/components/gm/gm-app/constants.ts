export const GM_TABS = ["TRACK", "PREP", "CODEX", "PARTY", "RULES"] as const;
export type GmTab = (typeof GM_TABS)[number];
// Chapter numerals drawn faintly behind the rail tabs, as on the Rulebook's page-edge tabs.
export const TAB_NUMERALS = ["I", "II", "III", "IV", "V"] as const;
