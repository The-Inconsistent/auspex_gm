import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_CELLS, blocks } from "./blocks.ts";

test("caps the track at MAX_CELLS cells", () => {
  assert.equal(blocks({ value: 3, max: 16 }).cells, MAX_CELLS);
  assert.equal(blocks({ value: 2, max: 4 }).cells, 4, "small maxima keep one cell per point");
});

test("any damage fills at least one cell", () => {
  assert.equal(blocks({ value: 1, max: 16 }).filled, 1);
});

test("short of max, at least one cell stays empty", () => {
  assert.equal(blocks({ value: 15, max: 16 }).filled, MAX_CELLS - 1);
});

test("0 is empty and max is full", () => {
  assert.deepEqual(blocks({ value: 0, max: 16 }), { filled: 0, cells: MAX_CELLS });
  assert.deepEqual(blocks({ value: 16, max: 16 }), { filled: MAX_CELLS, cells: MAX_CELLS });
  assert.deepEqual(blocks({ value: 20, max: 16 }), { filled: MAX_CELLS, cells: MAX_CELLS }, "overflow stays full");
});
