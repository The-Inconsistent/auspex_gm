import { z } from "zod";

// Requisitioning Wargear, Core pp.205–206 and Ammo p.229. The dice stay physical: the app works out the DN and the
// bonus dice, then records what the roll bought.

// Rarity penalties on the DN (p.206).
export const RARITY_DN = { Common: 0, Uncommon: 1, Rare: 2, "Very Rare": 3, Unique: 4 } as const;
export const Rarity = z.enum(Object.keys(RARITY_DN) as [keyof typeof RARITY_DN, ...(keyof typeof RARITY_DN)[]]);
export type Rarity = z.infer<typeof Rarity>;

// Each session allows one Wargear Test and one Ammo Test (p.205); Grenades and Missiles are got like Ammo (p.229).
export const RequisitionKind = z.enum(["wargear", "ammo", "grenade"]);
export type RequisitionKind = z.infer<typeof RequisitionKind>;
export const RequisitionSlot = z.enum(["wargear", "ammo"]);
export type RequisitionSlot = z.infer<typeof RequisitionSlot>;
export const requisitionSlot = (kind: RequisitionKind): RequisitionSlot => (kind === "wargear" ? "wargear" : "ammo");

const ANY = "[ANY]";
const norm = (k: string) => k.trim().toUpperCase();

// Can this character requisition the item, and at what DN? They need a Keyword in common; each one beyond the first
// is +1 bonus die (p.205). [ANY] stands for one of their Keywords that isn't already matched (§11.15).
export function requisitionTest({ keywords, itemKeywords, value, rarity }: {
  keywords: string[]; itemKeywords: string[]; value: number; rarity: Rarity;
}) {
  const mine = new Set(keywords.map(norm));
  const shared = [...new Set(itemKeywords.map(norm))].filter((k) => k !== ANY && mine.has(k));
  const any = itemKeywords.some((k) => norm(k) === ANY) && (shared.length === 0 || [...mine].some((k) => !shared.includes(k)));
  const matches = shared.length + (any ? 1 : 0);
  return { shared, any, eligible: matches > 0, bonusDice: Math.max(0, matches - 1), dn: value + RARITY_DN[rarity] };
}

// What a success yields: 3 Ammo of that type; Grenades or Missiles, 5 minus the Rarity penalty (p.229); one item.
export const requisitionYield = (kind: RequisitionKind, rarity: Rarity) =>
  kind === "ammo" ? 3 : kind === "grenade" ? 5 - RARITY_DN[rarity] : 1;

// Wealth only buys Icons on a failed Test, 1 each; a Complication costs 1 Wealth (p.205).
export function requisitionOutcome({ dn, icons, spend, complication, wealth }: {
  dn: number; icons: number; spend: number; complication: boolean; wealth: number;
}) {
  return { success: icons + spend >= dn, wealth: Math.max(0, wealth - spend - (complication ? 1 : 0)) };
}
