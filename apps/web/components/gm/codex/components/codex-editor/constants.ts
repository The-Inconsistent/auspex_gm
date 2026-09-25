// Editor input per field type, and the value a new entry starts from (a select starts at its first option instead).
export const FIELD_TYPES = {
  text: { empty: "" },
  area: { empty: "" },
  bool: { empty: false },
  list: { empty: [] },
  select: { empty: "" },
} as const;
export type FieldType = keyof typeof FIELD_TYPES;

// Fields players never see (toPlayerCodex drops them): drawn on a riveted plate.
export const GM_ONLY_FIELDS: ReadonlySet<string> = new Set(["gmNotes", "secrets", "hazards"]);
