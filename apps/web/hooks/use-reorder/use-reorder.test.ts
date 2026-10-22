import assert from "node:assert/strict";
import { test } from "node:test";

import { moveItem } from "./use-reorder.tsx";

test("moveItem moves one item and keeps the rest in order", () => {
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 3, 1), ["a", "d", "b", "c"]);
  assert.deepEqual(moveItem(["a", "b"], 1, 1), ["a", "b"]);
});
