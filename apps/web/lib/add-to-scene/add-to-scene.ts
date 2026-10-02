import type { Codex } from "@wg/shared";

type Beat = Codex["adventures"][number]["beats"][number];
type Npc = Codex["npcs"][number];

// ADD TO SCENE (issue #47): the beat's `codex.save` data with a bestiary NPC appended to its prepared encounter as one
// named combatant, and listed among the scene's NPCs. Null for an NPC with no bestiary threat, which can't be fielded
// (rules-flow §11.88).
export function addNpcToBeat({ id, order, ...beat }: Beat, npc: Npc) {
  if (npc.statSource.kind !== "bestiary") return null;
  const entry = { threatId: npc.statSource.threatId, count: 1, asMob: false, label: npc.name.slice(0, 100) };
  return {
    ...beat,
    encounter: [...beat.encounter, entry],
    npcIds: beat.npcIds.includes(npc.id) ? beat.npcIds : [...beat.npcIds, npc.id],
  };
}
