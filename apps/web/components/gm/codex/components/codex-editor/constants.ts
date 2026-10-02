// Editor input per field type, and the value a new entry starts from (a select starts at its first option instead).
export const FIELD_TYPES = {
  text: { empty: "" },
  area: { empty: "" },
  bool: { empty: false },
  keywords: { empty: [] }, // a faction's Keywords: chips plus a search over the books' (issue #46)
  select: { empty: "" },
  picks: { empty: [] }, // toggle chips over `options`, stored as the chosen values
  statSource: { empty: { kind: "none" } }, // an NPC's stats: a bestiary threat, a Quick NPC Tier, or none (issue #47)
} as const;
export type FieldType = keyof typeof FIELD_TYPES;

// Fields players never see (toPlayerCodex drops them): drawn on a riveted plate.
export const GM_ONLY_FIELDS: ReadonlySet<string> = new Set(["gmNotes", "secrets", "hazards"]);
