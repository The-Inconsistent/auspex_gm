import assert from "node:assert/strict";
import { test } from "node:test";

import type { Codex } from "@wg/shared";

import { findEntry, firstLine, inboxEntries, parentName } from "./utils";

const at = (id: string, over: object = {}) => ({ id, imageId: null, ...over });
const codex = {
  handouts: [
    at("h-old", { title: "Old", revealedAt: "2026-10-01", style: "slate", header: "", body: "" }),
    at("h-new", { title: "New", revealedAt: "2026-10-05", style: "plain", header: "", body: "" }),
  ],
  npcs: [at("n1", { name: "Tessaly" })],
  locations: [at("l1", { name: "Volkus", parentId: null }), at("l2", { name: "Pump-house", parentId: "l1" })],
  items: [{ id: "c1", name: "Stasis casket" }],
} as unknown as Codex;

test("inbox holds only fresh entries: handouts newest first, then given items, persons, places", () => {
  const fresh = new Set(["handout:h-old", "handout:h-new", "item:c1", "npc:n1", "location:l2"]);
  assert.deepEqual(
    inboxEntries(codex, fresh).map((e) => e.entry.id),
    ["h-new", "h-old", "c1", "n1", "l2"],
  );
  assert.deepEqual(inboxEntries(codex, new Set()), []);
});

test("a new picture on a seen entry puts it back in the inbox", () => {
  const withPicture = { ...codex, npcs: [at("n1", { name: "Tessaly", imageId: "img" })] } as unknown as Codex;
  assert.deepEqual(
    inboxEntries(withPicture, new Set(["picture:img"])).map((e) => e.entry.id),
    ["n1"],
  );
});

test("findEntry reads the live row and drops an entry that is gone", () => {
  assert.equal(findEntry(codex, { kind: "npc", id: "n1" })?.kind, "npc");
  assert.equal(findEntry(codex, { kind: "npc", id: "gone" }), null);
  assert.equal(findEntry(codex, null), null);
});

test("firstLine skips blank lines; parentName is null for a root", () => {
  assert.equal(firstLine("\n  \n Geometric void\nsecond"), "Geometric void");
  assert.equal(parentName(codex, codex.locations[1]!), "Volkus");
  assert.equal(parentName(codex, codex.locations[0]!), null);
});
