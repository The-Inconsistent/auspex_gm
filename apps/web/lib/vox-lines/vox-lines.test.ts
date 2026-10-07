import assert from "node:assert/strict";
import { test } from "node:test";

import { voxLines } from "./vox-lines.ts";

test("a line starting with a bracketed stamp splits it off; others stay as written", () => {
  assert.deepEqual(voxLines("[03:12] Hold the line\nstatic…\n[+++] \n  [04:00] indented"), [
    { stamp: "03:12", text: "Hold the line" },
    { text: "static…" },
    { stamp: "+++", text: "" },
    { text: "  [04:00] indented" },
  ]);
});

test("a bracket that never closes, or runs long, is just text", () => {
  assert.deepEqual(voxLines("[03:12 Hold"), [{ text: "[03:12 Hold" }]);
  assert.deepEqual(voxLines(`[${"x".repeat(30)}] long`), [{ text: `[${"x".repeat(30)}] long` }]);
});
