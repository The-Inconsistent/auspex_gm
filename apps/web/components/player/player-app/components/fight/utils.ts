import { type ThreatCombatant } from "@wg/shared";

// Who runs an ally, in words, on its row (issue #350, §11.208): the phone's own Agent ("you run it"), another Agent's
// player, or the GM. `controllerId` is null when the GM runs it.
export function allyLine({
  c,
  characterId,
  names,
}: {
  c: ThreatCombatant;
  characterId: string;
  names: Map<string, string>;
}): string {
  if (!c.controllerId) return "ALLY · THE GM RUNS IT";
  if (c.controllerId === characterId) return "YOUR FOLLOWER · YOU RUN IT";
  return `FOLLOWS ${(names.get(c.controllerId) ?? "AN AGENT").toUpperCase()}`;
}
