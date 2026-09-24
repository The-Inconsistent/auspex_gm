// The character's own counters on the sheet, keyed by their `character.adjust` field.
export const SHEET_COUNTERS = {
  wounds: { label: "WOUNDS" },
  shock: { label: "SHOCK" },
  wrath: { label: "WRATH" },
} as const;
export type SheetCounter = keyof typeof SHEET_COUNTERS;
