import type { Codex } from "@wg/shared";

// The gear lines the DOSSIER draws: a given item lives in INTEL › MISSION (rules-flow.md §11.166), so the line its GIVE
// wrote leaves, one line per item. GIVE wrote the name as typed or the catalogue's "Name (cite)" (grantWargear); a given
// weapon is in the armament, not here, so it stays.
// shortcut: matched by name, as TAKE BACK does without the catalogue, so an item named apart from its catalogue entry
// keeps its line here too; send the line with the item if a table hits it.
export function ungivenGear(gear: string[], items: Codex["items"]): string[] {
  const left = [...gear];
  for (const { name } of items) {
    const at = left.findIndex((g) => g === name || g.startsWith(`${name} (`));
    if (at >= 0) left.splice(at, 1);
  }
  return left;
}

// The Codex NPCs given to this Agent as followers (npc.give, issue #350): the server sends a given NPC to every phone,
// with its stat block when it has one.
export const myFollowers = (codex: Codex, characterId: string): Codex["npcs"] =>
  codex.npcs.filter((n) => n.followsId === characterId);
