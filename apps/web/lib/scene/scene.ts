import type { Codex, LiveState, Objective } from "@wg/shared";

type Adventure = Codex["adventures"][number];
type Beat = Adventure["beats"][number];

// The scene being played: the one active beat (beat.begin keeps it to one per campaign), its adventure and its place in
// that adventure's order.
export function currentScene(
  codex: Pick<Codex, "adventures">,
): { adventure: Adventure; beat: Beat; index: number } | null {
  for (const adventure of codex.adventures) {
    const index = adventure.beats.findIndex((b) => b.status === "active");
    if (index >= 0) return { adventure, beat: adventure.beats[index]!, index }; // found just above
  }
  return null;
}

// The Agents' missions the GM tied in PARTY to this adventure as a whole (no `beatId`) or to one of its scenes
// (rules-flow.md §11.163), with whose they are. Done ones stay, so the GM sees what is already met.
export function objectivesAt(
  characters: LiveState["characters"],
  { adventureId, beatId = null }: { adventureId: string; beatId?: string | null },
): { agent: string; objective: Objective }[] {
  return characters.flatMap((c) =>
    c.objectives
      .filter((o) => o.adventureId === adventureId && (o.beatId ?? null) === beatId)
      .map((objective) => ({ agent: c.name, objective })),
  );
}
