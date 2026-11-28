import assert from "node:assert/strict";
import { test } from "node:test";

import type { ThreatCombatant } from "@wg/shared";

import { followerComplications, followerPool, followerStrikeBy, followerWeapons } from "./utils";

const arm = { name: "Servo Arm", damage: 9, ed: 2, ap: -3, range: [1], traits: ["Brutal"] };
const gun = { name: "Stubber", damage: 7, ed: 1, range: [12, 24, 36], traits: [] };
const c = (over: object = {}) =>
  ({
    mobCount: null,
    stats: {
      skills: { default: 3, list: [{ name: "Weapon Skill", dice: 5 }] },
      abilities: [
        { type: "ACTION", name: "Attack", weapons: [arm, gun] },
        { type: "COMPLICATION", name: "Error", text: "Exhausted for 1 Round." },
        { name: "Mob Rule", text: "x" },
      ],
    },
    ...over,
  }) as unknown as ThreatCombatant;

test("weapons come from ACTION abilities only", () => {
  assert.deepEqual(
    followerWeapons(c()).map((w) => w.name),
    ["Servo Arm", "Stubber"],
  );
  assert.deepEqual(followerWeapons(c({ stats: null })), []);
});

test("pool: the Skill from the block, the default for the other Skill, the Mob's bonus on top", () => {
  assert.equal(followerPool({ c: c(), weapon: arm }), 5);
  assert.equal(followerPool({ c: c(), weapon: gun }), 3);
  assert.equal(followerPool({ c: c({ mobCount: 4 }), weapon: arm }), 7); // ceil(4 / 2) = 2
  assert.equal(followerPool({ c: c({ stats: null }), weapon: arm }), null);
});

test("complications: only the printed ones", () => {
  assert.deepEqual(
    followerComplications(c()).map((a) => a.name),
    ["Error"],
  );
});

test("strike by: a Troop lands no Critical Hit (p.323), other Threats are Threats", () => {
  assert.equal(followerStrikeBy(c({ threatClass: "T" })), "troop");
  assert.equal(followerStrikeBy(c({ threatClass: "E" })), "threat");
});
