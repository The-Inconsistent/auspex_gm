import { test } from "node:test";
import assert from "node:assert/strict";
import { Place, SpaceHulkGenerator, hulkNotes, placeNotes, placeSummary, roomNotes } from "./index.ts";

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

// A d6 per table keeps the placeholder generator short.
const table = (id: string, page: number) => ({
  id,
  name: id,
  page,
  dice: "d6",
  rows: [
    { id: `${id}-a`, from: 1, to: 3, name: "A", page, text: "Text A." },
    { id: `${id}-b`, from: 4, to: 6, name: "B", page },
  ],
});
const hulk = SpaceHulkGenerator.parse({
  source: "redacted-records",
  page: 6,
  origin: table("origin", 7),
  occupants: table("occupants", 8),
  objectives: table("objectives", 8),
  rooms: table("rooms", 9),
});

test("hulkNotes: the generator's cite, then each origin, the occupants and the objective (issue #50 step 8)", () => {
  assert.equal(
    hulkNotes(hulk, {
      origins: hulk.origin.rows,
      occupants: hulk.occupants.rows[1]!,
      objective: hulk.objectives.rows[0]!,
    }),
    "RR1 p.6\n\nORIGIN: A (RR1 p.7)\nText A.\n\nORIGIN: B (RR1 p.7)\n\nOCCUPANTS: B (RR1 p.8)\n\nOBJECTIVE: A (RR1 p.8)\nText A.",
  );
  assert.equal(roomNotes(hulk, hulk.rooms.rows[0]!), "RR1 p.9\n\nText A.");
  assert.equal(roomNotes(hulk, hulk.rooms.rows[1]!), "RR1 p.9");
});

test("a generator table must cover its dice, gaps aside", () => {
  const holed = { ...table("rooms", 9), rows: [table("rooms", 9).rows[0]] };
  assert.equal(SpaceHulkGenerator.safeParse({ ...hulk, rooms: holed }).success, false);
  assert.equal(SpaceHulkGenerator.safeParse({ ...hulk, rooms: { ...holed, gaps: [4, 5, 6] } }).success, true);
});
