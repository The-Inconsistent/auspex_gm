import assert from "node:assert/strict";
import { test } from "node:test";

import { toggleIn } from "./toggle-set.ts";

test("toggleIn adds a missing id and removes a present one, leaving the input untouched", () => {
  const start = new Set(["a"]);
  assert.deepEqual([...toggleIn(start, "b")], ["a", "b"]);
  assert.deepEqual([...toggleIn(start, "a")], []);
  assert.deepEqual([...start], ["a"]);
});
