import assert from "node:assert/strict";
import { test } from "node:test";

import { fit, imageSrc } from "./codex-image.ts";

test("a picture is drawn at most 1024 px on its long side, never enlarged (issue #199)", () => {
  assert.deepEqual(fit(4032, 3024), { width: 1024, height: 768 });
  assert.deepEqual(fit(1000, 3000), { width: 341, height: 1024 });
  assert.deepEqual(fit(640, 480), { width: 640, height: 480 });
  assert.deepEqual(fit(5000, 1), { width: 1024, height: 1 }, "a sliver keeps a pixel");
});

test("a picture is served under its campaign", () => {
  assert.equal(imageSrc("c", "i"), "/api/campaigns/c/images/i");
});
