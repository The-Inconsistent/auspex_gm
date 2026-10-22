import type { Codex } from "@wg/shared";

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
