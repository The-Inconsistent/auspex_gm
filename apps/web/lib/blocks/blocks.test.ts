import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_CELLS, blocks } from "./blocks.ts";

const filled = (s: string) => [...s].filter((c) => c === "█").length;

test("caps the bar at MAX_CELLS cells", () => {
  assert.equal(blocks({ value: 3, max: 16 }).length, MAX_CELLS);
  assert.equal(blocks({ value: 2, max: 4 }).length, 4, "small maxima keep one cell per point");
});

test("any damage fills at least one cell", () => {
  assert.equal(filled(blocks({ value: 1, max: 16 })), 1);
});

test("short of max, at least one cell stays empty", () => {
  assert.equal(filled(blocks({ value: 15, max: 16 })), MAX_CELLS - 1);
});

test("0 is empty and max is full", () => {
  assert.equal(blocks({ value: 0, max: 16 }), "░".repeat(MAX_CELLS));
  assert.equal(blocks({ value: 16, max: 16 }), "█".repeat(MAX_CELLS));
  assert.equal(blocks({ value: 20, max: 16 }), "█".repeat(MAX_CELLS), "overflow stays full");
});
