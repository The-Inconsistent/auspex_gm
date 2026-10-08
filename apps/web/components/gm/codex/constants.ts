// Codex entry kinds the CODEX tab edits, the Codex snapshot list each one lives in, and the text fields an opened
// row shows (so the GM reads notes at the table without opening the editor).
export const CODEX_KINDS = {
  npc: {
    collection: "npcs",
    read: [
      ["role", "ROLE"],
      ["description", "DESCRIPTION"],
      ["gmNotes", "GM NOTES"],
      ["secrets", "SECRETS"],
    ],
  },
  location: {
    collection: "locations",
    read: [
      ["description", "DESCRIPTION"],
      ["hazards", "HAZARDS"],
      ["gmNotes", "GM NOTES"],
    ],
  },
  handout: { collection: "handouts", read: [] }, // its TEXT shows as the prop (HandoutDoc, issue #204)
  faction: {
    collection: "factions",
    read: [
      ["notes", "NOTES"],
      ["secrets", "SECRETS"],
    ],
  },
  item: {
    collection: "items",
    read: [
      ["description", "DESCRIPTION"],
      ["gmNotes", "GM NOTES"],
    ],
  },
} as const;
export type CodexKind = keyof typeof CODEX_KINDS;
export const CODEX_KIND_KEYS = Object.keys(CODEX_KINDS) as CodexKind[];
