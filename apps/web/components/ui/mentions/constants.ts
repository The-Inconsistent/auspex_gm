import type { MentionKind } from "@wg/shared";

// What a peek shows per kind, as the CODEX row or STORY scene shows it. A phone's snapshot has the GM-only fields blanked
// (toPlayerCodex), so they drop out there.
export const PEEK_FIELDS: Record<MentionKind, readonly (readonly [key: string, label: string])[]> = {
  npc: [
    ["role", "ROLE"],
    ["description", "DESCRIPTION"],
    ["gmNotes", "GM NOTES"],
    ["secrets", "SECRETS"],
  ],
  location: [
    ["description", "DESCRIPTION"],
    ["hazards", "HAZARDS"],
    ["gmNotes", "GM NOTES"],
  ],
  handout: [["body", "TEXT"]],
  faction: [
    ["notes", "NOTES"],
    ["secrets", "SECRETS"],
  ],
  item: [
    ["description", "DESCRIPTION"],
    ["gmNotes", "GM NOTES"],
  ],
  scene: [
    ["goal", "GOAL"],
    ["readAloud", "READ ALOUD"],
    ["gmNotes", "GM NOTES"],
    ["outcome", "OUTCOME"],
  ],
};

// Drawn on a riveted plate, as in CODEX: players never see these.
export const PEEK_GM_ONLY: ReadonlySet<string> = new Set(["gmNotes", "secrets", "hazards"]);

export const KIND_LABEL: Record<MentionKind, string> = {
  npc: "NPC",
  location: "PLACE",
  handout: "HANDOUT",
  faction: "FACTION",
  item: "ITEM",
  scene: "SCENE",
};
