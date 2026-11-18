import { isMeleeProfile } from "./wargear.ts";
import type { Threat, Weapon } from "./threat.ts";

// What one attack does to a target, from the damage total the table rolled (Core pp.182–183, 192). AP is negative in
// the data (ap: -3) and lowers Resilience. Damage over the effective Resilience is Wounds by the difference, equal is
// 1 Shock, less is nothing (Critical Hits and Mortal Wounds, p.193, are the GM's call). A target whose Shock is "–"
// never suffers Shock (p.324), so a tie does nothing to it.
// ponytail: Invulnerable armour ignores AP (p.232), not modelled; the caller passes ap 0 for it.
export function woundsFromDamage({
  damage,
  resilience,
  ap = 0,
  takesShock = true,
}: {
  damage: number;
  resilience: number;
  ap?: number;
  takesShock?: boolean;
}) {
  const effective = Math.max(0, resilience + ap);
  return { wounds: Math.max(0, damage - effective), shock: takesShock && damage === effective ? 1 : 0 };
}

// A Mob attacks as one Threat with +1 bonus die per Troop in it, at most half the Troops (p.324). An odd count rounds
// up, as the book's split attacks do; the whole-Mob text gives no rounding (rules-flow §11.173).
export const mobBonusDice = (mobCount: number) => Math.ceil(mobCount / 2);

// The DN to hit: the target's Defence, +1 while the attacker is Wounded (p.193), +2 per power it sustains (`sustain`,
// sustainPenalty, Core p.265). Cover, range and vision stay the GM's.
export const hitDn = ({
  defence,
  attackerWounded,
  sustain = 0,
}: {
  defence: number;
  attackerWounded: boolean;
  sustain?: number;
}) => defence + (attackerWounded ? 1 : 0) + sustain;

// A Threat's attack pool: its Weapon Skill (melee) or Ballistic Skill (ranged) dice from the stat block, else its
// default Skill dice (Core p.323); null when the block prints neither. Melee is the same test as an Agent's weapon.
export function threatAttackPool(threat: Pick<Threat, "skills">, weapon: Pick<Weapon, "range" | "melee">) {
  const skill = (weapon.melee ?? isMeleeProfile(weapon)) ? "Weapon Skill" : "Ballistic Skill";
  const dice = threat.skills.list.find((s) => s.name === skill)?.dice ?? threat.skills.default;
  return { skill, dice } as const;
}

// Power Levels (Core p.260): the Wrath Dice a Psychic Mastery (Wil) Test adds over its one. Transcendent adds Rank or
// Tier, whichever is higher, plus one, and costs Shock equal to the Wrath Dice in the pool.
export const POWER_LEVELS = ["bound", "unbound", "transcendent"] as const;
export type PowerLevel = (typeof POWER_LEVELS)[number];
export function powerLevelDice({ level, rank, tier }: { level: PowerLevel; rank: number; tier: number }) {
  const bonus = level === "bound" ? 0 : level === "unbound" ? 1 : Math.max(rank, tier) + 1;
  return { bonus, wrath: 1 + bonus, shock: level === "transcendent" ? 1 + bonus : 0 };
}
