export const GM_TABS = ["TRACK", "PREP", "CODEX", "PARTY", "RULES", "BOOKS"] as const;
export type GmTab = (typeof GM_TABS)[number];
// `?tab=party` opens on that tab: NEW CAMPAIGN's last step lands on PARTY, where SETUP lists what's left.
export const TAB_PARAM = "tab";
export const asGmTab = (asked: unknown): GmTab | undefined =>
  GM_TABS.find((t) => typeof asked === "string" && t === asked.toUpperCase());
// Chapter numerals drawn faintly behind the rail tabs, as on the Rulebook's page-edge tabs.
export const TAB_NUMERALS = ["I", "II", "III", "IV", "V", "VI"] as const;
