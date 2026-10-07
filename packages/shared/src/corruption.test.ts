import { test } from "node:test";
import assert from "node:assert/strict";
import { keepPlay } from "./build.ts";
import { Action } from "./actions.ts";
import { CharacterStats } from "./state.ts";
import { corruptionGain, corruptionTestDn, corruptionLevel, mutationDns } from "./corruption.ts";

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
  assert.equal(mutationDns(5, 5).length, 0);
  assert.equal(mutationDns(4, 5).length, 0);
  assert.equal(mutationDns(5, 6).length, 1);
  assert.equal(mutationDns(10, 11).length, 1);
  assert.equal(mutationDns(3, 12).length, 2);
  assert.equal(mutationDns(25, 26).length, 0);
  assert.equal(mutationDns(20, 30).length, 1);
  assert.equal(mutationDns(12, 3).length, 0);
  assert.deepEqual(mutationDns(3, 12), [4, 5]); // DN 3 + 1 (Tarnished), DN 3 + 2 (Contaminated)
  assert.deepEqual(mutationDns(10, 11), [5]);
});

test("the Test DN is the source DN plus the current level's modifier", () => {
  assert.equal(corruptionTestDn({ source: 3, points: 0 }), 3);
  assert.equal(corruptionTestDn({ source: 3, points: 6 }), 4);
  assert.equal(corruptionTestDn({ source: 5, points: 21 }), 9);
});

test("a Wrath Critical takes 2 off the DN, a spent Wrath 1 but never below 1 (p.286)", () => {
  assert.equal(corruptionTestDn({ source: 5, points: 0, wrathCritical: true }), 3);
  assert.equal(corruptionTestDn({ source: 5, points: 6, spentWrath: true }), 5);
  assert.equal(corruptionTestDn({ source: 1, points: 0, spentWrath: true }), 1);
  assert.equal(corruptionTestDn({ source: 1, points: 0, wrathCritical: true }), -1);
  assert.equal(corruptionTestDn({ source: 3, points: 0, wrathCritical: true, spentWrath: true }), 1);
  assert.equal(corruptionTestDn({ source: 3, points: 6, wrathCritical: true, spentWrath: true }), 1);
});

test("a rebuild keeps the Corruption gained in play", () => {
  const previous = CharacterStats.parse({ corruption: 12 });
  assert.equal(keepPlay({ previous, next: CharacterStats.parse({}) }).corruption, 12);
});

test("character.corrupt takes a delta or a failed Test at a printed source DN, not both or neither", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const ok = (a: object) => Action.safeParse({ type: "character.corrupt", id, ...a }).success;
  assert.equal(ok({ delta: 1 }), true);
  assert.equal(ok({ test: { source: 3, icons: 1 } }), true);
  assert.equal(ok({}), false);
  assert.equal(ok({ delta: 1, test: { source: 3, icons: 1 } }), false);
  assert.equal(ok({ test: { source: 4, icons: 1 } }), false, "4 is not a printed Corruption DN (p.285)");
  assert.equal(ok({ test: { source: 3, icons: 0, wrathCritical: true, spentWrath: true } }), true);
});
