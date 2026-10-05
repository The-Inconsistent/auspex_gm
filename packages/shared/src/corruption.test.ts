import { test } from "node:test";
import assert from "node:assert/strict";
import { corruptionGained, corruptionLevel, corruptionLevelIndex, mutationTests } from "./corruption.ts";

test("corruptionLevel: the printed bands, with 11 Contaminated (§11.5)", () => {
  const at = (n: number) => corruptionLevel(n).name;
  assert.deepEqual([0, 5, 6, 10, 11, 15, 16, 20, 21, 25, 26, 40].map(at), [
    "Pure",
    "Pure",
    "Tarnished",
    "Tarnished",
    "Contaminated",
    "Contaminated",
    "Tainted",
    "Tainted",
    "Defiled",
    "Defiled",
    "Chaos Spawn",
    "Chaos Spawn",
  ]);
  assert.equal(corruptionLevel(12).modifier, 2);
  assert.equal(corruptionLevelIndex(-3), 0);
});

test("corruptionGained: DN − Icons, doubled on a Complication, never negative", () => {
  assert.equal(corruptionGained({ dn: 5, icons: 2, complication: false }), 3);
  assert.equal(corruptionGained({ dn: 5, icons: 2, complication: true }), 6);
  assert.equal(corruptionGained({ dn: 3, icons: 4, complication: true }), 0);
});

test("mutationTests: one per level crossed at DN 3 + the new level, Chaos Spawn flagged", () => {
  assert.deepEqual(mutationTests(4, 5), { dns: [], chaosSpawn: false });
  assert.deepEqual(mutationTests(5, 6), { dns: [4], chaosSpawn: false });
  assert.deepEqual(mutationTests(4, 12), { dns: [4, 5], chaosSpawn: false });
  assert.deepEqual(mutationTests(20, 25), { dns: [7], chaosSpawn: false });
  assert.deepEqual(mutationTests(24, 30), { dns: [], chaosSpawn: true });
  assert.deepEqual(mutationTests(10, 30), { dns: [5, 6, 7], chaosSpawn: true });
  assert.deepEqual(mutationTests(8, 6), { dns: [], chaosSpawn: false }, "a decrease owes nothing");
});
