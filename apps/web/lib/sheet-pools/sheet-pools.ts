import { SKILLS, skillTotal, withMutations, type CharacterStats, type Skill, type Weapon } from "@wg/shared";

// All it reads: the reach, and `addStrength` on a character's melee profile (a catalogue entry has only the reach).
type Reach = Pick<Weapon, "range"> & { addStrength?: boolean };
export type WeaponSkill = Extract<Skill, "Weapon Skill" | "Ballistic Skill">;

// Which Skill a weapon rolls: Ballistic Skill (ranged) or Weapon Skill (melee), docs/rules-flow.md §4 step 1.
// ponytail: the data has no melee/ranged flag, so melee is "adds Strength" or one short range (catalogue: 1 to 4);
// every ranged profile and thrown one prints a Long range of 9 or more. Upgrade when the weapon carries its kind.
export const weaponSkill = (w: Reach): WeaponSkill =>
  w.addStrength || (w.range.length === 1 && w.range[0]! <= 4) ? "Weapon Skill" : "Ballistic Skill";

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
