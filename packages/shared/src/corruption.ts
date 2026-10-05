// Corruption (Core pp.285–287, rules-flow.md §9). The Mutation tables (p.287) are not transcribed: the app only prompts.

// The levels, by their lowest total. House decision §11.5: 11 is Contaminated (the book prints 6–11 and 11–15).
// Chaos Spawn (26+) loses the character (p.286) and prints no modifier, so its 5 only continues the step.
export const CORRUPTION_LEVELS = [
  { name: "Pure", modifier: 0, min: 0 },
  { name: "Tarnished", modifier: 1, min: 6 },
  { name: "Contaminated", modifier: 2, min: 11 },
  { name: "Tainted", modifier: 3, min: 16 },
  { name: "Defiled", modifier: 4, min: 21 },
  { name: "Chaos Spawn", modifier: 5, min: 26 },
] as const;

// The index into CORRUPTION_LEVELS for a total (Core pp.285–286).
export const corruptionLevelIndex = (n: number) => CORRUPTION_LEVELS.findLastIndex((l) => Math.max(0, n) >= l.min);

export const corruptionLevel = (n: number) => CORRUPTION_LEVELS[corruptionLevelIndex(n)]!;

// A failed Corruption Test gains DN − Icons, doubled on a Complication (p.285; rules-flow §9). Never below 0.
export const corruptionGained = ({ dn, icons, complication }: { dn: number; icons: number; complication: boolean }) =>
  Math.max(0, dn - Math.max(0, icons)) * (complication ? 2 : 1);

// Each level an increase crosses is a Mutation Test: Conviction vs DN 3 + the new level's modifier, which the player may
// choose to fail (pp.286–287). Reaching Chaos Spawn loses the character, so it is flagged instead of owing a Test.
export function mutationTests(from: number, to: number): { dns: number[]; chaosSpawn: boolean } {
  const a = corruptionLevelIndex(from);
  const b = corruptionLevelIndex(to);
  const spawn = CORRUPTION_LEVELS.length - 1;
  const dns: number[] = [];
  for (let i = a + 1; i <= Math.min(b, spawn - 1); i++) dns.push(3 + CORRUPTION_LEVELS[i]!.modifier);
  return { dns, chaosSpawn: b === spawn && a < spawn };
}

// "TARNISHED +1", as the chip reads; Chaos Spawn has no modifier to print.
export const corruptionLabel = (n: number) => {
  const l = corruptionLevel(n);
  return l.min === 26 ? l.name.toUpperCase() : `${l.name.toUpperCase()} +${l.modifier}`;
};
