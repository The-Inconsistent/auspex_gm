// Determining Difficulty (Core p.161): each DN, the modifier it is from Standard, and its name. The printed examples
// are book text, so they stay out of the client bundle; the seat-gated rules entry carries them.
export const DN_TABLE = [
  { dn: 1, modifier: -2, name: "Easy" },
  { dn: 3, modifier: 0, name: "Standard" },
  { dn: 5, modifier: 2, name: "Challenging" },
  { dn: 7, modifier: 4, name: "Difficult" },
  { dn: 9, modifier: 6, name: "Extreme" },
  { dn: 12, modifier: 9, name: "Near Impossible" },
] as const;

// Corruption Roll Difficulty (Core p.285).
export const CORRUPTION_DNS = [1, 3, 5, 7, 9] as const;
export type CorruptionDn = (typeof CORRUPTION_DNS)[number];
export const isCorruptionDn = (dn: number | null): dn is CorruptionDn => CORRUPTION_DNS.some((d) => d === dn);
