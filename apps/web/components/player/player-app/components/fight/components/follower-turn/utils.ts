import {
  mobBonusDice,
  threatAttackPool,
  threatStatus,
  type Ability,
  type ThreatCombatant,
  type Weapon,
} from "@wg/shared";

// The weapons a follower can attack with: the ACTION abilities' weapons on its stat block, as the GM's attack guide reads them.
export const followerWeapons = (c: ThreatCombatant): Weapon[] =>
  (c.stats?.abilities ?? []).filter((a) => a.type === "ACTION").flatMap((a) => a.weapons ?? []);

// Its dice for a weapon: the Skill from the stat block, plus the Mob's bonus dice (p.324). null when the block prints no pool.
export function followerPool({ c, weapon }: { c: ThreatCombatant; weapon: Weapon }): number | null {
  if (!c.stats) return null;
  const { dice } = threatAttackPool(c.stats, weapon);
  return dice === null ? null : dice + (c.mobCount ? mobBonusDice(c.mobCount) : 0);
}

// The Complication lines its stat block prints. A Troop has none unless the block says so (p.323), which this honours by
// listing only what is printed.
export const followerComplications = (c: ThreatCombatant): Ability[] =>
  (c.stats?.abilities ?? []).filter((a) => a.type === "COMPLICATION");

// Wounded raises its Hit DN by 1 (p.193), as for an Agent.
export const followerWounded = (c: ThreatCombatant) => threatStatus(c).includes("Wounded");
