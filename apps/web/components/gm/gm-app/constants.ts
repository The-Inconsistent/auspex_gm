// SCENE is the play home, STORY the prep; the fight is a layer of SCENE. SETUP sits at the rail's foot: it's used before a
// campaign, not during it.
export const GM_TABS = ["SCENE", "STORY", "CODEX", "PARTY", "RULES", "BOOKS", "SETUP"] as const;
export type GmTab = (typeof GM_TABS)[number];
// `?tab=setup` opens on that tab: NEW CAMPAIGN's last step lands on SETUP, which lists what's left.
export const TAB_PARAM = "tab";
// The tabs before SCENE and STORY, so an old link or bookmark still opens their successor.
const RENAMED: Record<string, GmTab> = { TRACK: "SCENE", PREP: "STORY" };
export const asGmTab = (asked: unknown): GmTab | undefined => {
  if (typeof asked !== "string") return undefined;
  const t = asked.toUpperCase();
  return RENAMED[t] ?? GM_TABS.find((x) => x === t);
};
// Chapter numerals drawn faintly behind the rail tabs, as on the Rulebook's page-edge tabs. SETUP has none.
export const TAB_NUMERALS = ["I", "II", "III", "IV", "V", "VI", ""] as const;
