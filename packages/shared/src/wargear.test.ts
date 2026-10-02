import { test } from "node:test";
import assert from "node:assert/strict";
import { WargearWeapon, threatWeapon } from "./index.ts";

// Placeholder profiles in the catalogue's shape, not printed entries.
const entry = (name: string, weapon: unknown) => ({ name, weapon: WargearWeapon.parse(weapon) });

test("threatWeapon resolves a melee (S) + X against the threat's Strength (Core pp.211-213)", () => {
  const w = threatWeapon(entry("Blade", { addStrength: true, damage: 2, ed: 1, range: [1], traits: ["Brutal"] }), 6);
  assert.equal(w.damage, 8);
  assert.deepEqual(w.range, [1]);
  assert.deepEqual(w.traits, ["Brutal"]);
  // A Threat's weapon has no addStrength: zod would drop the flag and leave a 2-damage blade behind.
  assert.ok(!("addStrength" in w));
});

test("threatWeapon leaves a ranged weapon's numbers alone", () => {
  const w = threatWeapon(entry("Rifle", { damage: 9, ed: "1d3", ap: -1, salvo: 2, range: [12, 30, 60] }), 6);
  assert.deepEqual(
    { damage: w.damage, ed: w.ed, ap: w.ap, salvo: w.salvo, range: w.range },
    {
      damage: 9,
      ed: "1d3",
      ap: -1,
      salvo: 2,
      range: [12, 30, 60],
    },
  );
});

test("threatWeapon turns a thrown S × N into metres (Core p.208)", () => {
  const grenade = threatWeapon(entry("Grenade", { damage: 10, ed: 2, thrown: 3 }), 5);
  assert.deepEqual(grenade.range, [15]);
  // A knife thrown as well as swung keeps its reach and notes the throw, as the sheet does.
  const knife = threatWeapon(entry("Knife", { addStrength: true, damage: 1, ed: 1, range: [1], thrown: 2 }), 4);
  assert.deepEqual(knife.range, [1]);
  assert.equal(knife.damage, 5);
  assert.deepEqual(knife.traits, ["Thrown (8 m)"]);
});

test("threatWeapon keeps a count and a null Salvo as printed", () => {
  const w = threatWeapon(entry("Stikkbombz", { count: 2, damage: 8, ed: 1, salvo: null, thrown: 2 }), 4);
  assert.equal(w.count, 2);
  assert.equal(w.salvo, null);
  assert.deepEqual(w.range, [8]);
});
