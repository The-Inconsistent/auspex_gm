export const GM_TABS = ["TRACK", "PREP", "CODEX", "PARTY"] as const;
export type GmTab = (typeof GM_TABS)[number];
