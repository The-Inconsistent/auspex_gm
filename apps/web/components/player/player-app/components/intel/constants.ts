// The mission log's order and labels: what the party is on first, then what's offered, then how the rest went.
export const MISSION_GROUPS = [
  ["running", "ACTIVE"],
  ["planned", "OFFERED"],
  ["done", "DONE"],
  ["failed", "FAILED"],
] as const;

export const INTEL_VIEWS = ["INBOX", "MISSION", "ARCHIVE"] as const;
export type IntelView = (typeof INTEL_VIEWS)[number];

// ARCHIVE's kind chips, in the mock's order. Missions and recaps are lists, not entries: they open no sheet.
export const ARCHIVE_KINDS = [
  ["npc", "PERSONS"],
  ["location", "PLACES"],
  ["handout", "HANDOUTS"],
  ["mission", "MISSIONS"],
  ["recap", "RECAPS"],
] as const;
export type ArchiveKind = (typeof ARCHIVE_KINDS)[number][0];

// The stamp on a transmission card and on the entry sheet's head ("+++ PERSON IDENTIFIED +++").
export const STAMP = { npc: "PERSON IDENTIFIED", location: "PLACE LOGGED", item: "ITEM RECEIVED" } as const;
// A handout's stamp names its style ("HANDOUT · DATA-SLATE"); plain is the cogitator text.
export const HANDOUT_STAMP = {
  plain: "COGITATOR",
  slate: "DATA-SLATE",
  form: "FORM",
  vox: "VOX",
  decree: "DECREE",
} as const;
