import assert from "node:assert/strict";
import { test } from "node:test";

import { findHits } from "./utils.ts";

const names = (...n: string[]) => n.map((name) => ({ name }));

test("findHits ranks a name's start, then a word's start, then any match", () => {
  const options = names("Furious Fire", "Reroll Failures", "Seize the Initiative", "Restore Shock", "Last Resort");
  assert.deepEqual(
    findHits(options, "re").map((o) => o.name),
    ["Reroll Failures", "Restore Shock", "Last Resort", "Furious Fire"],
  );
  assert.deepEqual(findHits(options, "  "), []);
  assert.deepEqual(findHits(options, "zz"), []);
});
