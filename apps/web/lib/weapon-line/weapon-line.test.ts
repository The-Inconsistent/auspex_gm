import assert from "node:assert/strict";
import { test } from "node:test";

import type { Weapon } from "@wg/shared";

import { weaponLine } from "./weapon-line.ts";

const knife: Weapon & { addStrength: boolean } = {
  name: "Knife",
  damage: 2,
  ed: 1,
  range: [1],
  traits: [],
  addStrength: true,
};
const bolter: Weapon = { name: "Bolter", damage: 10, ed: 1, ap: -1, range: [12, 24, 36], salvo: 2, traits: ["Brutal"] };

test("melee addStrength adds the wielder's Strength when known", () => {
  assert.equal(weaponLine({ weapon: knife, strength: 5 }), "7 +1 ED · R 1");
});

test("melee addStrength without a Strength prints S+X", () => {
  assert.equal(weaponLine({ weapon: knife }), "S+2 +1 ED · R 1");
});

test("Salvo null prints –", () => {
  assert.equal(weaponLine({ weapon: { ...bolter, salvo: null } }), "10 +1 ED · AP -1 · R 12/24/36 · S – · Brutal");
});

test("ranged weapons list short/medium/long range", () => {
  assert.equal(weaponLine({ weapon: bolter }), "10 +1 ED · AP -1 · R 12/24/36 · S 2 · Brutal");
});
