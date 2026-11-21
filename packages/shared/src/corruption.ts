// Corruption (Core pp.285–287, docs/rules-flow.md §9). Pure rules; the counter is `CharacterStats.corruption`.

// A level starts at `from` points (Core p.285). Contaminated starts at 11, house rule rules-flow.md §11.5 (the book
// prints 6–11 and 11–15). `modifier` is added to the DN of the next Corruption Test and of that level's Mutation Test.
const LEVELS = [
  { name: "Pure", from: 0, modifier: 0 },
  { name: "Tarnished", from: 6, modifier: 1 },
  { name: "Contaminated", from: 11, modifier: 2 },
  { name: "Tainted", from: 16, modifier: 3 },
  { name: "Defiled", from: 21, modifier: 4 },
  { name: "Chaos Spawn", from: 26, modifier: 0 },
] as const;

export const CHAOS_SPAWN_AT = LEVELS.at(-1)!.from;

export type CorruptionLevel = { level: number; name: string; modifier: number; chaosSpawn: boolean };

export function corruptionLevel(points: number): CorruptionLevel {
  const level = LEVELS.findLastIndex((l) => points >= l.from);
  const l = LEVELS[Math.max(0, level)]!; // a clamped index, so it exists
  // Chaos Spawn has no printed modifier: the GM takes the character over (Core p.286), so no Test follows.
  return { level: Math.max(0, level), name: l.name, modifier: l.modifier, chaosSpawn: l.name === "Chaos Spawn" };
}

// Mutations whose printed effect changes a rule the app runs (Core pp.289, 294), found by the id of their book row.
export const BLIGHTED_SOUL = "blighted-soul";
export const ENDURING_LIFE = "enduring-life";

// Whether the Agent holds the mutation `id` (a sheet's `mutations` snapshot the book row, so the id is the row's).
export const hasMutation = (s: { mutations: readonly { id: string }[] }, id: string) =>
  s.mutations.some((m) => m.id === id);

// The Corruption Test's DN: the source's DN plus the level modifier of the Agent's current Corruption (Core p.286). A
// Wrath Critical takes 2 off, with no floor printed, so a DN it drops to 0 is a pass; a spent Wrath takes 1 off but
// "can't reduce the DN below 1" (p.286). Blighted Soul adds 1: "Corruption and Malignancy Tests you ... make suffer a
// +1 DN penalty" (p.289, §11.184); it is part of the Test's DN, so it counts in the gain (§11.134).
export function corruptionTestDn({
  source,
  points,
  wrathCritical = false,
  spentWrath = false,
  blighted = false,
}: {
  source: number;
  points: number;
  wrathCritical?: boolean;
  spentWrath?: boolean;
  blighted?: boolean;
}) {
  const dn = source + corruptionLevel(points).modifier + (blighted ? 1 : 0) - (wrathCritical ? 2 : 0);
  return spentWrath && dn > 1 ? dn - 1 : dn;
}

// A failed Corruption Test gains DN − Icons, doubled on a Complication (Core p.286). `dn` is the Test DN, level
// modifier included (rules-flow.md §11.134).
export const corruptionGain = ({ dn, icons, complication }: { dn: number; icons: number; complication: boolean }) =>
  Math.max(0, dn - icons) * (complication ? 2 : 1);

// How many Mutation Tests a change from `before` to `after` triggers: one per level gained (Core p.287, §11.135).
// Stepping into Chaos Spawn is not one: the GM takes the character over. A fall never triggers one.
function levelsCrossed(before: number, after: number) {
  const top = LEVELS.findIndex((l) => l.name === "Chaos Spawn");
  const to = Math.min(corruptionLevel(after).level, top - 1);
  return Math.max(0, to - corruptionLevel(before).level);
}

// The Mutation Test for entering a level: Conviction against DN 3 + that level's modifier (Core p.287, §11.135). The
// player may choose to fail it.
const mutationDn = (level: number) => 3 + (LEVELS[level]?.modifier ?? 0);

// The DNs of the Mutation Tests a gain from `before` to `after` triggers, one per level entered, lowest first.
export const mutationDns = (before: number, after: number) =>
  Array.from({ length: levelsCrossed(before, after) }, (_, i) => mutationDn(corruptionLevel(before).level + 1 + i));
