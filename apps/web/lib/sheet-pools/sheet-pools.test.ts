import assert from "node:assert/strict";
import { test } from "node:test";

import { CharacterStats, type Weapon } from "@wg/shared";

import { skillRows, topSkills, weaponPool, weaponSkill } from "./sheet-pools.ts";

const stats = CharacterStats.parse({
  attributes: { S: 5, T: 5, A: 6, I: 5, Wil: 5, Int: 4, Fel: 1 },
  skills: { "Ballistic Skill": 6, Stealth: 5, "Weapon Skill": 4 },
});
const base: Weapon = { name: "x", damage: 7, ed: 1, range: [18, 36, 54], traits: [] };

test("a ranged weapon rolls Ballistic Skill + Agility, a melee one Weapon Skill + Initiative", () => {
  assert.equal(weaponSkill(base), "Ballistic Skill");
  assert.equal(weaponPool(stats, base), 12);
  assert.equal(weaponSkill({ ...base, range: [1] }), "Weapon Skill");
  assert.equal(weaponPool(stats, { ...base, range: [2], addStrength: true } as never), 9);
  assert.equal(weaponSkill({ ...base, range: [14] }), "Ballistic Skill"); // a thrown grenade
  assert.equal(weaponSkill({ range: [2] }), "Weapon Skill"); // a reach-2 blade (Eviscerator), even from the catalogue
});

test("topSkills ranks by total and an untrained Skill shows hollow", () => {
  assert.deepEqual(
    topSkills(stats, 3).map((r) => r.skill),
    ["Ballistic Skill", "Stealth", "Weapon Skill"],
  );
  assert.equal(skillRows(stats).find((r) => r.skill === "Pilot")?.trained, false);
  assert.equal(skillRows(stats).length, 18);
});
