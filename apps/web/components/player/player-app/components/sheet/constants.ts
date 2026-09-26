// The character's counters on the sheet (read-only: the GM changes them), keyed by their `character.adjust` field.
export const SHEET_COUNTERS = {
  wounds: { label: "WOUNDS" },
  shock: { label: "SHOCK" },
  wrath: { label: "WRATH" },
} as const;
