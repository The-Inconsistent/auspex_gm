import assert from "node:assert/strict";
import { test } from "node:test";

import { piePaths } from "./clock-pie.ts";

test("a pie has one wedge per segment, the first from twelve o'clock clockwise (issue #210)", () => {
  const paths = piePaths(4);
  assert.equal(paths.length, 4);
  assert.equal(paths[0], "M0 0 L0.0000 -1.0000 A1 1 0 0 1 1.0000 0.0000 Z");
  assert.equal(piePaths(8).length, 8);
});
