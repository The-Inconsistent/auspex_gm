// Codex entry kinds the CODEX tab edits, and the Codex snapshot list each one lives in.
export const CODEX_KINDS = {
  npc: { collection: "npcs" },
  location: { collection: "locations" },
  handout: { collection: "handouts" },
  faction: { collection: "factions" },
} as const;
export type CodexKind = keyof typeof CODEX_KINDS;
export const CODEX_KIND_KEYS = Object.keys(CODEX_KINDS) as CodexKind[];
