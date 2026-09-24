// Free-text beat fields, in the order the editor shows them; `area` = multi-line.
export const BEAT_TEXT_FIELDS = {
  title: { label: "TITLE", area: false },
  readAloud: { label: "READ ALOUD (what you say at the table)", area: true },
  gmNotes: { label: "GM NOTES / SECRETS", area: true },
  outcome: { label: "OUTCOME (fill in after play)", area: true },
} as const;
export type BeatTextField = keyof typeof BEAT_TEXT_FIELDS;
