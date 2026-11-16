import { test } from "node:test";
import assert from "node:assert/strict";
import { hitDn, threatAttackPool, woundsFromDamage } from "./attack.ts";

test("damage over Resilience is Wounds, equal is 1 Shock, less is nothing (p.192)", () => {
  assert.deepEqual(woundsFromDamage({ damage: 10, resilience: 5 }), { wounds: 5, shock: 0 });
  assert.deepEqual(woundsFromDamage({ damage: 5, resilience: 5 }), { wounds: 0, shock: 1 });
  assert.deepEqual(woundsFromDamage({ damage: 4, resilience: 5 }), { wounds: 0, shock: 0 });
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
