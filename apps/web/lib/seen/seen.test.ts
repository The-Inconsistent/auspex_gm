import assert from "node:assert/strict";
import { test } from "node:test";

import { freshCount, freshKeys, isFresh, shownKeys } from "./seen.ts";

const codex = {
  handouts: [{ id: "h1" }],
  npcs: [{ id: "n1", imageId: "i1" }],
  locations: [{ id: "l1", imageId: null }],
  items: [{ id: "c1" }], // given to this Agent (§11.166)
} as never;

test("a device that has never seen the campaign has nothing new", () => {
  assert.equal(freshKeys(codex, null).size, 0);
  assert.deepEqual(shownKeys(codex), ["handout:h1", "npc:n1", "picture:i1", "location:l1", "item:c1"]);
});

test("an unseen entry is new, a seen one is not", () => {
  const fresh = freshKeys(codex, new Set(["handout:h1", "npc:n1", "picture:i1"]));
  assert.deepEqual([...fresh], ["location:l1", "item:c1"], "a given item is new too");
  assert.equal(isFresh({ fresh, kind: "location", entry: { id: "l1" } }), true);
  assert.equal(isFresh({ fresh, kind: "npc", entry: { id: "n1", imageId: "i1" } }), false);
  assert.equal(freshCount(codex, fresh), 2);
});

test("a picture revealed later makes its seen entry new once", () => {
  const fresh = freshKeys(codex, new Set(["handout:h1", "npc:n1", "location:l1", "item:c1"]));
  assert.equal(isFresh({ fresh, kind: "npc", entry: { id: "n1", imageId: "i1" } }), true);
  assert.equal(freshCount(codex, fresh), 1);
});
