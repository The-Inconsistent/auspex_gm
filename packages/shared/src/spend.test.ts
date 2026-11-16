import { test } from "node:test";
import assert from "node:assert/strict";
import { SPEND_KINDS, restoreShockAmount, spendCost, spendLabel, spendTakesAmount } from "./spend.ts";

test("Wrath spends cost 1 Wrath and no Glory (p.164)", () => {
  assert.deepEqual(spendCost("reroll"), { wrath: 1, glory: 0 });
  assert.deepEqual(spendCost("restoreShock", 5), { wrath: 1, glory: 0 }, "an amount means nothing here");
});

test("Glory dice and damage cost n Glory (p.165); Seize costs 1 (p.177)", () => {
  assert.deepEqual(spendCost("gloryDice", 3), { wrath: 0, glory: 3 });
  assert.deepEqual(spendCost("gloryDamage", 2), { wrath: 0, glory: 2 });
  assert.deepEqual(spendCost("seize", 4), { wrath: 0, glory: 1 });
});

test("Restore Shock recovers Rank + Tier (p.164, p.196)", () => {
  assert.equal(restoreShockAmount({ rank: 2, tier: 4 }), 6);
});

test("Glory dice and damage take an amount, and Determination its Icons", () => {
  assert.deepEqual(SPEND_KINDS.filter(spendTakesAmount), ["gloryDice", "gloryDamage", "determination"]);
  assert.equal(spendLabel("determination", 2), "DETERMINATION · 2 ICONS");
  assert.deepEqual(spendCost("determination", 3), { wrath: 0, glory: 0 });
});

test("every kind has a label that names its cost", () => {
  assert.equal(spendLabel("reroll"), "REROLL FAILURES · 1 WRATH");
  assert.equal(spendLabel("gloryDice", 3), "GLORY DICE +3 · 3 GLORY");
  assert.equal(spendLabel("seize"), "SEIZE THE INITIATIVE · 1 GLORY");
  for (const k of SPEND_KINDS) assert.ok(spendLabel(k).length > 0);
});
