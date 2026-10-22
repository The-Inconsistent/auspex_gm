import assert from "node:assert/strict";
import { test } from "node:test";

import { counterKey, parseDelta } from "./fight-delta.ts";

test("a signed number overrides the segment; a bare one follows it", () => {
  assert.equal(parseDelta({ text: "-3", direction: "deal" }), -3);
  assert.equal(parseDelta({ text: "−3", direction: "deal" }), -3);
  assert.equal(parseDelta({ text: "+2", direction: "heal" }), 2);
  assert.equal(parseDelta({ text: "2", direction: "deal" }), 2);
  assert.equal(parseDelta({ text: " 2 ", direction: "heal" }), -2);
});

test("zero, decimals, words and huge numbers are refused", () => {
  for (const text of ["", "0", "+0", "1.5", "abc", "3x", "100", "--2"])
    assert.equal(parseDelta({ text, direction: "deal" }), null, text);
});

test("a delta maps to its counter action", () => {
  assert.equal(counterKey({ field: "wounds", delta: 3 }), "wounds");
  assert.equal(counterKey({ field: "wounds", delta: -3 }), "heal");
  assert.equal(counterKey({ field: "shock", delta: 1 }), "shock");
  assert.equal(counterKey({ field: "shock", delta: -1 }), "recover");
});
