import { canBeEnemy, playerMayRun, type Codex, type Combatant, type FightsAs, type Threat } from "@wg/shared";

export type Npc = Codex["npcs"][number];

// A Codex NPC's category, as the GM reads it (issue #350, rules-flow §11.208). Players never see these words.
export const FIGHTS_AS_LABEL: Record<FightsAs, string> = { follower: "FOLLOWER", ally: "ALLY", threat: "THREAT" };
export const FIGHTS_AS_HINT: Record<FightsAs, string> = {
  follower: "Joins the Agents once convinced. You can GIVE it to an Agent, and that player runs it. Never an enemy.",
  ally: "Fights beside the Agents as the story needs. Never given: only you run it.",
  threat: "An enemy by default, but you can add it as an ally or give it when the story turns.",
};

// The stat block an NPC joins a fight with: its bestiary or custom threat in the merged bestiary, else null (a Quick NPC
// or an NPC with no stats can be listed and given, but not fielded until it has a block, issue #350 step 4).
export const npcStats = ({ npc, bestiary }: { npc: Npc; bestiary: Threat[] }): Threat | null =>
  npc.statSource.kind === "bestiary"
    ? (bestiary.find((t) => t.id === (npc.statSource as { threatId: string }).threatId) ?? null)
    : null;

// What the picker offers for an NPC: an enemy only for a Threat, a player's hand only when its category allows it, and
// the Agent it follows as the default runner (null: the GM).
export const joinRules = (npc: Pick<Npc, "fightsAs" | "followsId">) => ({
  enemy: canBeEnemy(npc.fightsAs),
  playerMayRun: playerMayRun(npc.fightsAs),
  controllerId: playerMayRun(npc.fightsAs) ? npc.followsId : null,
});

// Who may run an ally row: the GM always, an Agent in the fight unless its NPC is an Ally. A row with no NPC behind it
// (a bestiary block added by hand) is free.
export const runByOptions = ({
  agents,
  fightsAs,
}: {
  agents: { id: string; name: string }[];
  fightsAs: FightsAs | null;
}): { id: string | null; name: string }[] => [
  { id: null, name: "THE GM" },
  ...(fightsAs === null || playerMayRun(fightsAs) ? agents : []),
];

// The Building Encounters tally's input (Threat Assessment p.8): the Threats against the Agents. Allies stay out (§11.208).
export const budgetEntries = (combatants: Combatant[]) =>
  combatants.flatMap((c) =>
    c.kind === "threat" && !c.ally ? [{ cls: c.threatClass, count: c.mobCount ?? 1, asMob: c.mobCount !== null }] : [],
  );

// + FOLLOWERS: the given NPCs of these Agents that can join now (a stat block, not already in the fight), and the names
// of those that can't yet.
export function followersToAdd({
  codex,
  bestiary,
  agentIds,
  combatants,
}: {
  codex: Codex;
  bestiary: Threat[];
  agentIds: string[];
  combatants: Combatant[];
}) {
  const fielded = new Set(combatants.flatMap((c) => (c.kind === "threat" && c.npcId ? [c.npcId] : [])));
  const add: { npc: Npc; threat: Threat }[] = [];
  const noStats: string[] = [];
  for (const npc of codex.npcs) {
    if (!npc.followsId || !agentIds.includes(npc.followsId) || fielded.has(npc.id)) continue;
    const threat = npcStats({ npc, bestiary });
    if (threat) add.push({ npc, threat });
    else noStats.push(npc.name);
  }
  return { add, noStats };
}
