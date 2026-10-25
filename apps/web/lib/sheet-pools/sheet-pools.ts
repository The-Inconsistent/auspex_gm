import {
  SKILLS,
  isMeleeProfile,
  skillTotal,
  withMutations,
  type CharacterStats,
  type Skill,
  type Weapon,
} from "@wg/shared";

// All it reads: `melee`, set when the weapon joined the sheet, else the reach and `addStrength`.
type Reach = Pick<Weapon, "range" | "melee"> & { addStrength?: boolean };
export type WeaponSkill = Extract<Skill, "Weapon Skill" | "Ballistic Skill">;

// Which Skill a weapon rolls: Ballistic Skill (ranged) or Weapon Skill (melee), docs/rules-flow.md §4 step 1. `melee`
// comes from the printed profile (sheetWeapon in @wg/shared).
// ponytail: a sheet built before `melee` existed falls back to the same test on the sheet's profile, which can't tell a
// thrown weapon's short throw from a reach; a rebuild sets the field.
export const weaponSkill = (w: Reach): WeaponSkill =>
  (w.melee ?? isMeleeProfile(w)) ? "Weapon Skill" : "Ballistic Skill";

// The Skill a weapon's pool is rolled on, as the card's tag (rules-flow.md §4: Ballistic Skill + Agility ranged, Weapon
// Skill + Initiative melee).
export const WEAPON_SKILL_TAGS = { "Ballistic Skill": "BS", "Weapon Skill": "WS" } as const;

// The pool an attack with this weapon rolls: its Skill's total (Skill + linked Attribute, Core p.21), mutations counted.
export const weaponPool = (s: CharacterStats, w: Reach) => skillTotal(s, weaponSkill(w));

// Every Skill with its total (Skill + linked Attribute) and whether it is trained, in the sheet's printed order. An
// untrained Skill still rolls its Attribute (Core p.21), shown hollow.
export const skillRows = (s: CharacterStats) => {
  const shown = withMutations(s);
  return (Object.keys(SKILLS) as Skill[]).map((skill) => ({
    skill,
    attribute: SKILLS[skill],
    total: skillTotal(s, skill),
    trained: (shown.skills[skill] ?? 0) > 0,
  }));
};

// The highest `n` totals; Array.sort is stable, so ties keep the printed order.
export const topSkills = (s: CharacterStats, n: number) =>
  skillRows(s)
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
