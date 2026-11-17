import { test } from "node:test";
import assert from "node:assert/strict";
import { hitDn, mobBonusDice, powerLevelDice, threatAttackPool, woundsFromDamage } from "./attack.ts";

test("damage over Resilience is Wounds, equal is 1 Shock, less is nothing (p.192)", () => {
  assert.deepEqual(woundsFromDamage({ damage: 10, resilience: 5 }), { wounds: 5, shock: 0 });
  assert.deepEqual(woundsFromDamage({ damage: 5, resilience: 5 }), { wounds: 0, shock: 1 });
  assert.deepEqual(woundsFromDamage({ damage: 4, resilience: 5 }), { wounds: 0, shock: 0 });
});

test('a Shock of "–" takes nothing on a tie (p.324); a Mob of 10 adds 5 dice, 7 rounds up to 4 (p.324)', () => {
  assert.deepEqual(woundsFromDamage({ damage: 5, resilience: 5, takesShock: false }), { wounds: 0, shock: 0 });
  assert.equal(mobBonusDice(10), 5, "the book's ten Ork Boyz");
  assert.equal(mobBonusDice(7), 4);
});

test("negative AP lowers Resilience", () => {
  assert.deepEqual(woundsFromDamage({ damage: 8, resilience: 7, ap: -3 }), { wounds: 4, shock: 0 });
  assert.deepEqual(woundsFromDamage({ damage: 4, resilience: 7, ap: -3 }), { wounds: 0, shock: 1 });
});

test("Wounded attacker adds 1 to the DN (p.193)", () => {
  assert.equal(hitDn({ defence: 2, attackerWounded: true }), 3);
  assert.equal(hitDn({ defence: 2, attackerWounded: false }), 2);
});

test("a Threat's pool is its Weapon or Ballistic Skill, else the default", () => {
  const t = { skills: { default: 5, list: [{ name: "Weapon Skill", dice: 9 }] } };
  assert.deepEqual(threatAttackPool(t, { range: [1] }), { skill: "Weapon Skill", dice: 9 });
  assert.deepEqual(threatAttackPool(t, { range: [6, 12, 18] }), { skill: "Ballistic Skill", dice: 5 });
});

test("Power Levels: Unbound +1 Wrath Die, Transcendent Rank or Tier + 1 and that much Shock (p.260)", () => {
  assert.deepEqual(powerLevelDice({ level: "bound", rank: 1, tier: 1 }), { bonus: 0, wrath: 1, shock: 0 });
  assert.deepEqual(powerLevelDice({ level: "unbound", rank: 1, tier: 1 }), { bonus: 1, wrath: 2, shock: 0 });
  // The book's Zaire: Tier 1, Rank 1, +2 Wrath Dice, a pool of 7 becomes 9 (p.261).
  assert.deepEqual(powerLevelDice({ level: "transcendent", rank: 1, tier: 1 }), { bonus: 2, wrath: 3, shock: 3 });
  assert.equal(powerLevelDice({ level: "transcendent", rank: 3, tier: 2 }).bonus, 4, "the higher of Rank and Tier");
});
