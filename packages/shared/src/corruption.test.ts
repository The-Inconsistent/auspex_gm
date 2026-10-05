import { test } from "node:test";
import assert from "node:assert/strict";
import { corruptionGain, corruptionTestDn, corruptionLevel, levelsCrossed, mutationDns } from "./corruption.ts";

test("levels follow p.286, with 11 Contaminated (house rule §11.5)", () => {
  const at = (n: number) => corruptionLevel(n).name;
  assert.deepEqual([0, 5, 6, 10, 11, 15, 16, 20, 21, 25, 26, 40].map(at), [
    "Pure", "Pure", "Tarnished", "Tarnished", "Contaminated", "Contaminated", "Tainted", "Tainted", "Defiled", "Defiled",
    "Chaos Spawn", "Chaos Spawn",
  ]); // prettier-ignore
  assert.equal(corruptionLevel(11).modifier, 2);
  assert.equal(corruptionLevel(21).modifier, 4);
  assert.equal(corruptionLevel(26).chaosSpawn, true);
  assert.equal(corruptionLevel(25).chaosSpawn, false);
});

test("gain is DN − Icons, doubled on a Complication, never negative", () => {
  assert.equal(corruptionGain({ dn: 5, icons: 2, complication: false }), 3);
  assert.equal(corruptionGain({ dn: 5, icons: 2, complication: true }), 6);
  assert.equal(corruptionGain({ dn: 3, icons: 7, complication: true }), 0);
});

test("a gain triggers one Mutation Test per level entered; Chaos Spawn is lost, not tested", () => {
  assert.equal(levelsCrossed(5, 5), 0);
  assert.equal(levelsCrossed(4, 5), 0);
  assert.equal(levelsCrossed(5, 6), 1);
  assert.equal(levelsCrossed(10, 11), 1);
  assert.equal(levelsCrossed(3, 12), 2);
  assert.equal(levelsCrossed(25, 26), 0);
  assert.equal(levelsCrossed(20, 30), 1);
  assert.equal(levelsCrossed(12, 3), 0);
  assert.deepEqual(mutationDns(3, 12), [4, 5]); // DN 3 + 1 (Tarnished), DN 3 + 2 (Contaminated)
  assert.deepEqual(mutationDns(10, 11), [5]);
});

test("the Test DN is the source DN plus the current level's modifier", () => {
  assert.equal(corruptionTestDn({ source: 3, points: 0 }), 3);
  assert.equal(corruptionTestDn({ source: 3, points: 6 }), 4);
  assert.equal(corruptionTestDn({ source: 5, points: 21 }), 9);
});
