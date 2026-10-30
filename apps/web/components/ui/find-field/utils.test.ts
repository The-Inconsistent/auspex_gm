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

test("findHits finds by `also` after every name match", () => {
  const options = [
    { name: "Boy", also: "Ork" },
    { name: "Orkhunter", also: "Imperium" },
  ];
  assert.deepEqual(
    findHits(options, "ork").map((o) => o.name),
    ["Orkhunter", "Boy"],
  );
});
