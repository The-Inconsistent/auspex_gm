// Corruption (Core pp.285–287, docs/rules-flow.md §9). Pure rules; the counter is `CharacterStats.corruption`.

// A level starts at `from` points (Core p.286). Contaminated starts at 11, house rule rules-flow.md §11.5 (the book
// prints 6–11 and 11–15). `modifier` is added to the DN of the next Corruption Test and of that level's Mutation Test.
const LEVELS = [
  { name: "Pure", from: 0, modifier: 0 },
  { name: "Tarnished", from: 6, modifier: 1 },
  { name: "Contaminated", from: 11, modifier: 2 },
  { name: "Tainted", from: 16, modifier: 3 },
  { name: "Defiled", from: 21, modifier: 4 },
  { name: "Chaos Spawn", from: 26, modifier: 0 },
] as const;

export type CorruptionLevel = { level: number; name: string; modifier: number; chaosSpawn: boolean };

export function corruptionLevel(points: number): CorruptionLevel {
  const level = LEVELS.findLastIndex((l) => points >= l.from);
  const l = LEVELS[Math.max(0, level)]!; // a clamped index, so it exists
  // Chaos Spawn has no printed modifier: the character is lost (Core p.286), so no Test follows.
  return { level: Math.max(0, level), name: l.name, modifier: l.modifier, chaosSpawn: l.name === "Chaos Spawn" };
}

// The Corruption Test's DN: the source's DN plus the level modifier of the Agent's current Corruption (Core p.286).
export const corruptionTestDn = ({ source, points }: { source: number; points: number }) =>
  source + corruptionLevel(points).modifier;

// A failed Corruption Test gains DN − Icons, doubled on a Complication (Core p.286). Never below 0. `dn` is the Test DN
// (source + level modifier). Open question: the book may mean the source DN alone for the gain; unverified.
export const corruptionGain = ({ dn, icons, complication }: { dn: number; icons: number; complication: boolean }) =>
  Math.max(0, dn - icons) * (complication ? 2 : 1);

// How many Mutation Tests a change from `before` to `after` triggers: one per level gained (Core p.286). Stepping into
// Chaos Spawn is not one: that character is lost, so no Test is rolled for it. A fall never triggers one.
export function levelsCrossed(before: number, after: number) {
  const top = LEVELS.findIndex((l) => l.name === "Chaos Spawn");
  const to = Math.min(corruptionLevel(after).level, top - 1);
  return Math.max(0, to - corruptionLevel(before).level);
}

// The Mutation Test for entering a level: Conviction against DN 3 + that level's modifier (Core p.286). The player may
// choose to fail it.
export const mutationDn = (level: number) => 3 + (LEVELS[level]?.modifier ?? 0);

// The DNs of the Mutation Tests a gain from `before` to `after` triggers, one per level entered, lowest first.
export const mutationDns = (before: number, after: number) =>
  Array.from({ length: levelsCrossed(before, after) }, (_, i) => mutationDn(corruptionLevel(before).level + 1 + i));
