import { test } from "node:test";
import assert from "node:assert/strict";
import { Place, placeNotes, placeSummary } from "./index.ts";

// Placeholder text: tests hold no book text.
const world = Place.parse({
  id: "core-world",
  name: "World",
  parent: "core-system",
  source: "core",
  page: 297,
  stats: [{ label: "Classification", value: "Forge World" }],
  hooks: [{ title: "A Hook", text: "Hook text." }],
  gm: "Description.",
});

test("placeNotes: the cite first, then the stat line, the hooks and the description (issue #50)", () => {
  assert.equal(placeNotes(world), "Core p.297\n\nClassification: Forge World\n\nA HOOK\nHook text.\n\nDescription.");
  assert.equal(placeNotes(Place.parse({ id: "core-x", name: "X", source: "core", page: 1 })), "Core p.1");
});

test("placeSummary sends the tree, not the text", () => {
  assert.deepEqual(placeSummary(world), {
    id: "core-world",
    name: "World",
    parentId: "core-system",
    source: "core",
    page: 297,
  });
});
