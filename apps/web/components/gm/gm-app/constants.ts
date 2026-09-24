export const GM_TABS = ["TRACK", "PREP", "CODEX", "PARTY", "RULES"] as const;
export type GmTab = (typeof GM_TABS)[number];
